# Phase 1 — Tauri Interface Contract: Commands and Events

This document is the canonical reference for the **Rust ↔ TypeScript boundary** in Feature 007. It defines three new Tauri commands (`load_session`, `save_session`, `get_pending_files`) and one new Tauri event (`markpad://open-files`). The frontend module APIs that wrap these calls are documented in [frontend-modules.md](frontend-modules.md); the in-memory schemas they exchange are documented in [data-model.md](../data-model.md).

The TypeScript signatures here are the authoritative types for `src/lib/session.ts` and `src/lib/launchFiles.ts`. The Rust signatures are the authoritative types for `src-tauri/src/session.rs` and `src-tauri/src/launch_files.rs`. The JSON payloads they exchange are derived from these signatures via Tauri's `serde`-based serialization.

---

## 1. Command: `load_session`

Load the persisted session record from disk.

### Rust signature (`src-tauri/src/session.rs`)

```rust
#[tauri::command]
pub async fn load_session(app: tauri::AppHandle) -> Result<SessionRecord, String> {
    // 1. Resolve ${app_data_dir}/session.json
    // 2. Read the file; if missing → return SessionRecord::default()
    // 3. Parse as JSON; if parse fails or version != 1 → return SessionRecord::default()
    // 4. Return the parsed record
    // Returns Err(String) only for truly catastrophic failures (e.g. inability to resolve app_data_dir);
    // the frontend treats Err as "no session" and continues.
}
```

### TypeScript signature (`src/lib/session.ts`)

```ts
import { invoke } from "@tauri-apps/api/core";

export type SessionTabEntry = { path: string };
export type SessionRecord = {
  version: 1;
  tabs: SessionTabEntry[];
  active_index: number | null;
};

export async function loadSession(): Promise<SessionRecord> {
  try {
    return await invoke<SessionRecord>("load_session");
  } catch (err) {
    console.warn("load_session failed; treating as empty session:", err);
    return { version: 1, tabs: [], active_index: null };
  }
}
```

### Behavior

- **Inputs**: none (the command implicitly uses the `AppHandle` for path resolution).
- **Outputs**:
  - On success: a `SessionRecord`. May be the default empty record (`{ version: 1, tabs: [], active_index: null }`) if the file is missing, unreadable, corrupt, or has an unknown `version`.
  - On catastrophic failure (e.g., `app.path().app_data_dir()` itself fails — extraordinarily unlikely on a desktop OS): `Err(String)` with a brief technical message. The TS wrapper catches this and returns the default record so the frontend never has to handle a thrown error.
- **Idempotency**: read-only; safe to call multiple times. The mount effect calls it exactly once.
- **Side effects**: none. (Does NOT create the app-data directory; `save_session` does that on the first write.)
- **Error message format**: the `String` returned from `Err` is for development debugging only; the frontend never surfaces it to the user.

### Acceptance

- FR-014 (persistently remember … so the set can be restored on the next launch).
- FR-015 (on launch, reopen every remembered file).
- FR-019 (when none of the remembered files exist, empty state).
- FR-020 (corrupt session MUST NOT block launch).

---

## 2. Command: `save_session`

Persist the current session record to disk atomically.

### Rust signature (`src-tauri/src/session.rs`)

```rust
#[tauri::command]
pub async fn save_session(app: tauri::AppHandle, record: SessionRecord) -> Result<(), String> {
    // 1. Resolve ${app_data_dir}; create_dir_all if missing
    // 2. Serialize `record` to JSON (pretty-print or compact; either is fine)
    // 3. Write to ${app_data_dir}/session.json.tmp
    // 4. Rename .tmp over session.json (atomic on all three OSes)
    // 5. Return Ok(())
    // Returns Err(String) on any I/O failure; the frontend logs and continues.
}
```

### TypeScript signature (`src/lib/session.ts`)

```ts
export async function saveSession(record: SessionRecord): Promise<void> {
  try {
    await invoke<void>("save_session", { record });
  } catch (err) {
    console.warn("save_session failed; session not persisted this round:", err);
    // Intentionally swallow — the existing on-disk file (if any) is unchanged due to atomic temp+rename.
  }
}
```

### Behavior

- **Inputs**: `record: SessionRecord` (the current persistable state).
- **Outputs**: `Ok(())` on success; `Err(String)` on I/O failure (e.g., disk full, permission denied).
- **Idempotency**: every call replaces the file atomically. Two concurrent calls (theoretically possible if the debounce window is shorter than the write latency) MAY race on the rename; both succeed but the LAST rename wins (which is whichever finishes second). Either valid state is acceptable; the next debounce will write whichever is current anyway.
- **Side effects**: creates the app-data directory if missing; writes / overwrites `session.json`; never leaves a partial file (atomic temp + rename).
- **Crash safety**: a process crash mid-write leaves the previous `session.json` intact (the rename hasn't happened yet). A crash after rename leaves the new file intact.

### Acceptance

- FR-014 (session record MUST be written at least at normal application shutdown — the debounced save + the implicit "last change before close" makes this so).
- FR-021 (only on-disk file paths are persisted — the caller filters Untitled tabs before passing).

---

## 3. Command: `get_pending_files`

Drain the launch-files buffer and mark the frontend as ready for live events.

### Rust signature (`src-tauri/src/launch_files.rs`)

```rust
#[tauri::command]
pub async fn get_pending_files(state: tauri::State<'_, LaunchFilesState>) -> Result<Vec<String>, String> {
    // 1. Acquire the pending lock (Mutex<Vec<PathBuf>>)
    // 2. std::mem::take the inner Vec into a local
    // 3. Set state.frontend_ready.store(true, Ordering::SeqCst) — while still under the lock
    //    so any concurrent push sees frontend_ready=true on the next route_paths call and emits instead
    // 4. Release the lock
    // 5. Convert each PathBuf to String via to_string_lossy and return the Vec<String>
}
```

### TypeScript signature (`src/lib/launchFiles.ts`)

```ts
import { invoke } from "@tauri-apps/api/core";

export async function getPendingFiles(): Promise<string[]> {
  try {
    return await invoke<string[]>("get_pending_files");
  } catch (err) {
    console.warn("get_pending_files failed; no pending files this launch:", err);
    return [];
  }
}
```

### Behavior

- **Inputs**: none (the state is injected by Tauri's command dispatcher).
- **Outputs**: an array of canonical, absolute file path strings. Empty array when no files were queued before frontend-ready (the most common case — no CLI args, no OS activation).
- **Idempotency**: a SECOND call to `get_pending_files` returns an empty array — the buffer was drained on the first call and `frontend_ready` is already `true` so no further pushes occur. The frontend MUST call this exactly once per launch; the mount effect handles this.
- **Threading**: thread-safe — both the lock and the atomic flag protect against concurrent ingest calls (e.g., a second invocation arriving in the middle of frontend mount).
- **Lock ordering**: the `frontend_ready = true` set MUST happen under the same lock acquisition as the buffer drain. This eliminates the race where a path could be pushed AFTER drain but BEFORE flag-set, causing both the buffer (drained, returned) and the live event (would-be-emitted next time) to miss it. The implementation in `route_paths` checks `frontend_ready` after acquiring the lock, so it sees the flag-set immediately.

### Acceptance

- FR-001 (OS activation opens files as tabs — for cold-start cases where the activation arrived before the frontend was ready).
- FR-006 (launch-attempt files are routed to the existing instance — for the cold-start half of the race window).
- FR-013 (positional CLI args appended to restored tabs — same drain path).

---

## 4. Event: `markpad://open-files`

Push file paths to the frontend after the frontend signaled readiness.

### Rust emit site (`src-tauri/src/launch_files.rs`)

```rust
fn route_paths(app: &tauri::AppHandle, paths: Vec<PathBuf>) {
    if paths.is_empty() { return; }
    let state = app.state::<LaunchFilesState>();
    bring_to_front(app);  // raise window first so the user sees the response immediately
    let mut pending = state.pending.lock().expect("pending lock poisoned");
    if state.frontend_ready.load(Ordering::SeqCst) {
        drop(pending); // release lock before emit
        let payload = serde_json::json!({
            "paths": paths.iter().map(|p| p.to_string_lossy().into_owned()).collect::<Vec<_>>()
        });
        let _ = app.emit("markpad://open-files", payload);
    } else {
        pending.extend(paths);
    }
}
```

### TypeScript subscription (`src/lib/launchFiles.ts`)

```ts
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type OpenFilesPayload = { paths: string[] };

export async function subscribeToOpenFiles(
  handler: (paths: string[]) => void,
): Promise<UnlistenFn> {
  return listen<OpenFilesPayload>("markpad://open-files", (event) => {
    handler(event.payload.paths);
  });
}
```

### Behavior

- **Event name**: `markpad://open-files` (string literal). The pseudo-scheme prefix is a naming convention for grep-ability; Tauri places no constraints on event names.
- **Payload**: `{ paths: string[] }` — an array of canonical absolute path strings (UTF-8 via `to_string_lossy`). Empty arrays are never emitted (the emit is short-circuited when `paths.is_empty()`).
- **Delivery**: the event is emitted via `app.emit` (broadcast to all windows). Since markpad runs a single window per FR-005, this is functionally identical to emitting to the main window specifically.
- **Ordering**: when multiple second invocations arrive in rapid succession, each produces its own emit. The frontend handler runs them in arrival order (Tauri's listener queue preserves order for a single subscriber). The "last successfully opened" rule (FR-022) means the LAST file in the LAST emit becomes active; earlier files are background tabs.
- **Concurrency with `get_pending_files`**: the lock ordering in `route_paths` ensures that any path queued before the frontend-ready flag is in the buffer (returned by `get_pending_files`), and any path arriving after the flag is set is emitted (received by the live subscription). No path is delivered twice; none is lost.
- **Bring-to-front**: `bring_to_front(app)` is called BEFORE the emit so the OS window animation starts immediately. The emit completes microseconds later.

### Acceptance

- FR-001, FR-002 (OS-activated files become tabs in the existing instance).
- FR-003 (the most recently arrived file becomes active).
- FR-006, FR-007 (second-invocation routing brings window to front and delivers files).

---

## 5. Side-effect contract: `bring_to_front` (called by `route_paths`)

Not a public command or event, but a Rust helper whose behavior is part of the user-visible contract.

### Rust signature (`src-tauri/src/launch_files.rs`)

```rust
fn bring_to_front(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();   // restore from taskbar/dock
        let _ = window.show();         // bring above other windows
        let _ = window.set_focus();    // give input focus
    }
}
```

### Behavior

- Called on every `route_paths` invocation (i.e., every CLI/OS/second-invocation arrival), whether files are queued or emitted.
- Errors from any of the three calls are ignored (best-effort; FR-007 follows "OS conventions" per spec Assumption 3).
- For the cold-start case where the window has not yet been created, `get_webview_window("main")` returns `None` and the function is a no-op; the window will show on its own as part of normal launch.

### Acceptance

- FR-007 (window comes to user's foreground on second invocation).
- FR-008 (bare second launch — no file args — still brings the window to front; the empty `paths` array short-circuits the file routing but `bring_to_front` is called via a tweak: for the single-instance plugin callback specifically, we always call `bring_to_front` even when `route_paths` would otherwise short-circuit on empty paths).

### Note on bare second invocation

The single-instance plugin callback receives the second invocation's `argv` — possibly empty (e.g., the user ran a bare `markpad` while another `markpad` was open, expecting "raise the existing window"). The implementation MUST call `bring_to_front` unconditionally in the callback, BEFORE deciding whether to route any paths:

```rust
pub fn handle_second_invocation(app: &tauri::AppHandle, argv: Vec<String>, cwd: String) {
    bring_to_front(app);                                     // <-- always
    let cwd_path = std::path::PathBuf::from(&cwd);
    let canonical = argv.into_iter()
        .filter_map(|a| canonicalize_arg(&cwd_path, &a))
        .collect::<Vec<_>>();
    if !canonical.is_empty() {
        route_paths(app, canonical);  // route_paths internally calls bring_to_front again — harmless idempotent
    }
}
```

The double `bring_to_front` call (once unconditionally, once inside `route_paths`) is intentional and harmless — both are no-ops if the window is already focused.

---

## 6. Capability and permission summary (UNCHANGED in `capabilities/default.json`)

The existing capability set covers everything this feature needs:

| Permission | Why needed | Status |
|---|---|---|
| `core:default` | Required for any Tauri 2 app | Existing |
| `opener:default` | (Carried from prior features; unrelated to this one) | Existing |
| `dialog:default` | Used by `openMarkdownFile()` (existing) — not used by this feature's new code paths | Existing |
| `fs:allow-read-text-file` | `openMarkdownFileByPath()` (new) calls `readTextFile()` — same permission as existing `openMarkdownFile()` | Existing |
| `fs:allow-write-text-file` | (Carried from prior features; not new in this feature) | Existing |

**No new permission is required.** Custom commands (`load_session`, `save_session`, `get_pending_files`) are runtime-accessible by default in Tauri 2 once registered via `tauri::generate_handler![...]`; they do not require capability entries.

---

## 7. Test matrix for the contract (manual, per quickstart.md)

The full manual test plan is in [quickstart.md](../quickstart.md). The contract-level coverage:

| Contract surface | Quickstart section |
|---|---|
| `load_session` returns the saved record on relaunch | Scenario D (session restore) |
| `load_session` returns empty on missing/corrupt file | Scenario E (edge cases) |
| `save_session` writes after every tab change (debounced) | Scenario D + observe `session.json` mtime |
| `save_session` writes are atomic (no half-files after crash) | Scenario E (kill markpad mid-write) |
| `get_pending_files` returns CLI args on cold start | Scenario C (CLI args) |
| `get_pending_files` returns empty when launched bare | Scenario A / D |
| `markpad://open-files` event received for second invocation | Scenario B (single-instance + file routing) |
| `markpad://open-files` event received for macOS Opened | Scenario B (macOS only) |
| `bring_to_front` raises minimized window on second invocation | Scenario B |
| `bring_to_front` is called for bare `markpad` | Scenario B (bare invocation) |
