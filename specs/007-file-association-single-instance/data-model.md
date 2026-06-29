# Phase 1 — Data Model: OS File Association, Single Instance, and Session Restore

This feature introduces ONE on-disk artifact (the session record), ONE Rust-side runtime state object (the launch-files buffer + frontend-ready flag), and adds NO new in-memory React state shapes — the Feature 006 `Tab` and `TabSet` shapes are reused verbatim. This document captures each new entity's fields, validation rules, and lifecycle; the existing Feature 006 entities are referenced rather than restated.

## 1. `SessionRecord` (on-disk + shared TS/Rust schema)

A small JSON document persisted at `${app_data_dir}/session.json` (per-OS path resolved by Tauri's `app.path().app_data_dir()`). It captures the workspace state that survives across launches.

### Schema (canonical — Rust struct)

```rust
#[derive(Serialize, Deserialize, Default)]
pub struct SessionRecord {
    pub version: u32,                       // currently 1
    pub tabs: Vec<SessionTabEntry>,         // empty when no file-backed tabs were open
    pub active_index: Option<usize>,        // index into `tabs`, or None
}

#[derive(Serialize, Deserialize)]
pub struct SessionTabEntry {
    pub path: String,                       // absolute, canonical, OS-native path
}
```

### TypeScript mirror

```ts
// src/lib/session.ts
export type SessionTabEntry = { path: string };
export type SessionRecord = {
  version: 1;
  tabs: SessionTabEntry[];
  active_index: number | null;
};
```

The TypeScript field names match the JSON exactly (snake_case `active_index`). No serde `rename` attributes; the Rust struct definition is the canonical schema.

### Field semantics

| Field | Type | Notes |
|---|---|---|
| `version` | `u32` (Rust) / `1` literal (TS) | Schema version. Currently `1`. A future schema change increments this and adds a migration branch in `load_session`. Files with unknown versions are treated as corrupt and produce an empty session (FR-020). |
| `tabs` | `Vec<SessionTabEntry>` | Ordered list of file-backed tabs that were open at save time. Untitled tabs are NEVER included (they have no path to restore from; FR-021 + spec Assumption 4). Order is exactly the visible tab order in the strip at save time. |
| `tabs[i].path` | `String` (absolute, canonical) | The absolute, canonical, OS-native path of the file backing that tab. Symlinks are resolved (via `canonicalize` on the Rust write side and via `canonicalize` on every CLI/OS-routed read). Two routes to the same on-disk file (different symlinks) produce the same canonical path — by construction no duplicate paths can appear in `tabs`. |
| `active_index` | `Option<usize>` / `number \| null` | The index in `tabs` of the tab that was active at save time. `None` / `null` when the active tab at save time was Untitled (and therefore excluded from `tabs`), or when no tabs were open. On restore, if the active file no longer exists, the fallback rules in [research.md §10](research.md) apply. |

### Validation rules

- `version === 1` is the only accepted value at load time today.
- `tabs[i].path` MUST be a non-empty absolute path string. (Rust enforces by construction — `canonicalize` produces absolute paths; the loader does NOT re-validate on read, instead relying on the per-file `readTextFile` failure path during restore to silently skip unreadable entries.)
- `active_index`, when non-null, MUST be in `[0, tabs.len())` at save time. At load time, an out-of-bounds value is treated as if `active_index` were null and the FR-017 fallback kicks in.
- Duplicate paths within `tabs` are not expected (the save-time set has no duplicates by Feature 006's FR-011 dedup) but if they appear (e.g., a corrupt edit), the restore loop's dedup handles them harmlessly — only the first instance creates a tab; subsequent indices' fallback walks pass through them.

### Lifecycle

| Event | Effect on `session.json` |
|---|---|
| First-ever launch | File does NOT exist. `load_session` returns `SessionRecord::default()` (empty). |
| App close (any) | The debounced save effect (300 ms after the last persistable change) has typically already written the latest state. No close-time handler is required; an optional `appWindow.onCloseRequested` backstop may be added later. |
| Tab opened (any source) | The 300 ms debounce triggers; on debounce expiry, a new `SessionRecord` is computed and written atomically (temp + rename). |
| Tab closed | Same as above. |
| Active tab switched | Same as above (only `active_index` changes in the payload). |
| Tab `text` edited | NO save triggered. Edits don't persist (FR-021). |
| Tab saved to disk (Save / auto-save) | If the tab transitions from Untitled (Save-As) to file-backed, the path changes from "not in saved set" to "in saved set" — a save fires. If the tab was already file-backed, the saved shape is unchanged → no save fires. |
| App data dir missing | `save_session` creates it via `create_dir_all` before writing. |
| File corruption (manual edit, partial write) | `load_session` returns `SessionRecord::default()`. The next save will overwrite the corrupted file with the current valid state. |
| App is closed during a write | The atomic temp + rename pattern means either the old `session.json` is intact (write didn't reach rename) or the new one is intact (rename completed). No partial file is ever observed by a subsequent load. |
| User manually deletes `session.json` between launches | Treated as "first-ever launch" — empty session, normal empty state. |
| User opts to clear markpad's app data | Deleting the file is sufficient; no separate "reset session" UI is in this feature. |

---

## 2. `LaunchFilesState` (Rust-managed runtime state)

A `tauri::Manager`-managed state object that funnels launch-time and second-invocation file paths to the frontend. Defined in `src-tauri/src/launch_files.rs`:

```rust
pub struct LaunchFilesState {
    pub pending: Mutex<Vec<PathBuf>>,
    pub frontend_ready: AtomicBool,
}

impl Default for LaunchFilesState {
    fn default() -> Self {
        Self {
            pending: Mutex::new(Vec::new()),
            frontend_ready: AtomicBool::new(false),
        }
    }
}
```

Registered via `.manage(LaunchFilesState::default())` in `lib.rs::run()`.

### Field semantics

| Field | Type | Notes |
|---|---|---|
| `pending` | `Mutex<Vec<PathBuf>>` | Canonicalized, existent file paths that have been ingested before the frontend signaled readiness. Drained by `get_pending_files`. Pushed to by `ingest_initial_args` (cold-start argv), `handle_opened_urls` (macOS file activation pre-ready), and `handle_second_invocation` (second invocation pre-ready — extremely rare but possible if the first instance is mid-cold-start when a second invocation arrives). |
| `frontend_ready` | `AtomicBool` | `false` from process start until `get_pending_files` is invoked the first time. Once `true`, new launch-file arrivals are emitted as `markpad://open-files` events instead of being buffered. The atomic prevents a torn read across the route-paths decision. |

### Validation rules

- Every `PathBuf` in `pending` has been verified to exist (it passed through `canonicalize` which returns `Err` for non-existent paths; the caller filters those out before pushing).
- The buffer is unbounded in principle; in practice the cold-start race window is milliseconds and only a handful of files arrive in it. No buffer-overflow protection is needed for this app's profile.

### Lifecycle

```
Process start
   │
   ├─ setup hook:    ingest_initial_args(app, std::env::args())
   │     for each canonicalizable arg in argv[1..]:
   │       pending.lock().push(canonical_path)
   │
   ├─ (concurrently, macOS only)
   │  RunEvent::Opened { urls }:
   │     for each url converted to canonical path:
   │       route_paths(app, [canonical_path])
   │         └─ frontend_ready=false → pending.push(...)
   │
   ├─ webview loads, frontend mounts
   │
   ├─ frontend calls get_pending_files()
   │     ├─ acquire pending lock
   │     ├─ drain into Vec
   │     ├─ set frontend_ready = true
   │     ├─ release lock
   │     └─ return drained Vec to frontend
   │
   ├─ (later) second-invocation callback or macOS Opened:
   │     route_paths(app, [canonical_paths])
   │       └─ frontend_ready=true → app.emit("markpad://open-files", { paths })
   │
   └─ Process exit (single-instance lock released by plugin)
```

After `frontend_ready` flips to `true`, `pending` is never written to again. (Even if a hypothetical race occurred where a path was pushed during the brief window between drain-and-flag, the lock ordering in `get_pending_files` makes that race impossible — the drain and the flag-set both happen under the same lock acquisition.)

---

## 3. `Tab` and `TabSet` (Feature 006, REUSED — no changes)

The in-memory tab model is **unchanged**. See [Feature 006's data-model.md §1](../006-multi-file-tabs/data-model.md) for the full schema:

- `Tab { id, text, savedText, openedFile, untitledLabel }` — every field has the same shape and semantics.
- `TabSet { tabs: Tab[], activeTabId: TabId | null }` — same invariants.
- The dedup rule from Feature 006 FR-011 (no two tabs share an `openedFile.path`) is reused; this feature's new opens (from session restore, CLI args, OS activations, live handoffs) all flow through a handler that checks `tabs.find(t => t.openedFile?.path === path)` before appending.

What this feature adds is **how `tabs` is initially populated and persisted across launches** — not the shape itself. The mount-time sequence in [research.md §7](research.md) is the canonical orchestration.

### Active-tab pointer fallback at restore (new behavior in this feature)

When restoring a session, the new rule for selecting `activeTabId` is:

1. If the saved active file is in the restored set → activate it.
2. Else, if pending files (CLI args / cold-start OS activations) were also passed → the LAST successfully opened pending file is active (FR-022 precedence; supersedes the saved active).
3. Else, if other saved tabs survive → activate the nearest neighbor by saved index (next file, falling back to previous; FR-017).
4. Else → `activeTabId = null` (empty state; FR-019).

This rule is implemented in `App.tsx`'s mount effect, not as a stored field — the persistent state remains "what was active at save time" and the runtime computes the actual `activeTabId` from that plus the current restoration outcome.

---

## 4. User Preferences (Feature 003 / 004, UNCHANGED)

| Key in `localStorage` | Type | Default |
|---|---|---|
| `markpad.theme` | `"light" \| "dark"` | System preference; falls back to `"light"`. |
| `markpad.viewMode` | `"editor" \| "preview" \| "split"` | `"split"`. |
| `markpad.autoSave` | `"on" \| "off"` (exposed as `boolean`) | `false`. |

This feature does NOT add a new `localStorage` key and does NOT migrate preferences. The preferences chokepoint (`src/lib/preferences.ts`) is untouched.

---

## 5. Refs and per-tab structures (Feature 006, UNCHANGED)

The Feature 006 refs and per-tab structures are reused without modification:

- `editorStatesRef: useRef<Map<TabId, TabSnapshot>>` — per-tab editor state snapshots for cursor/scroll preservation. Cleared on tab close, persisted across renders, not persisted across launches.
- `savingByTab: Record<TabId, boolean>` — per-tab in-flight save flag.
- `pendingSaveRef: useRef<Map<TabId, boolean>>` — per-tab "another save needed after this one" flag.

This feature does NOT add new refs. The mount-time effect uses `useRef<Tab[]>` for the stale-closure fix described in [research.md §7](research.md) — but that's an implementation detail of the mount handler, not a new architectural ref.

---

## 6. Tauri commands (new) — quick index

The full contract is in [contracts/tauri-interface.md](contracts/tauri-interface.md). Summary:

| Command | Direction | Purpose |
|---|---|---|
| `load_session` | TS → Rust | Read `session.json` from disk; return `SessionRecord::default()` on any failure. |
| `save_session(record)` | TS → Rust | Atomically write `session.json` (temp + rename); idempotent. |
| `get_pending_files` | TS → Rust | Drain `LaunchFilesState.pending` and set `frontend_ready = true`. Called once on frontend mount. |

## 7. Tauri events (new) — quick index

| Event | Direction | Payload | Emitted by |
|---|---|---|---|
| `markpad://open-files` | Rust → TS | `{ paths: string[] }` (canonical absolute paths) | `route_paths` in `launch_files.rs` (post-`frontend_ready`); fires on second-invocation handoffs and macOS `RunEvent::Opened` after the frontend is up. |

---

## 8. What is NOT in this data model

These are intentionally excluded; trying to model them here would scope-creep the feature:

- **Per-tab unsaved-edit text persisted across launches**: out of scope (FR-021). Only paths.
- **Per-tab cursor / scroll / selection persisted across launches**: out of scope. The `EditorState` snapshots live in a ref and are forgotten on launch.
- **Per-tab view mode persisted across launches**: out of scope (view mode is workspace-level, unchanged from Feature 003).
- **Window size / position persisted across launches**: out of scope (could be a follow-up via `tauri-plugin-window-state`).
- **MRU stack of recently visited tabs**: out of scope; the active fallback uses saved index, not MRU history.
- **Recently closed tabs / "reopen last closed"**: out of scope.
- **Session schema migration table**: not needed at v1; the `version` field is forward-looking insurance.
- **Multiple session profiles (e.g., per project)**: out of scope; one session per user.
