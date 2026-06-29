# Phase 1 — Frontend Module Contracts

This document is the canonical reference for the new and updated **TypeScript modules** in Feature 007. It defines the public API of `src/lib/session.ts` (new), `src/lib/launchFiles.ts` (new), and the new export added to `src/lib/fileOpen.ts`. It also documents the mount-time orchestration in `src/App.tsx` — which sequence of calls each new module participates in.

The actual TypeScript types live in the source files; this document explains the **intent** behind those types and the **interactions** the tasks phase must preserve. Rust ↔ TS boundary types and the underlying Tauri commands/events are in [tauri-interface.md](tauri-interface.md). In-memory schemas are in [data-model.md](../data-model.md).

---

## 1. `src/lib/session.ts` (NEW)

Single chokepoint for the session-persistence Tauri commands. The frontend never invokes `load_session` or `save_session` directly; everything goes through this module.

### Module-level documentation comment

```ts
// Single chokepoint for session persistence (load/save the per-launch tabs+active state).
// The on-disk session.json is owned by the Rust side (src-tauri/src/session.rs); this module
// is the only TS importer of `invoke("load_session" | "save_session")`. The schema mirrors
// the Rust SessionRecord struct exactly (snake_case fields, version=1).
```

### Exports

```ts
import { invoke } from "@tauri-apps/api/core";

export type SessionTabEntry = { path: string };

export type SessionRecord = {
  version: 1;
  tabs: SessionTabEntry[];
  active_index: number | null;
};

export async function loadSession(): Promise<SessionRecord>;
export async function saveSession(record: SessionRecord): Promise<void>;
```

### Contract

- `loadSession()`:
  - Returns the saved `SessionRecord` if `session.json` exists and parses cleanly with `version === 1`.
  - Returns `{ version: 1, tabs: [], active_index: null }` (the default empty record) on ANY failure: missing file, parse error, version mismatch, IPC error.
  - NEVER throws. NEVER surfaces an error to the user. The Rust side already returns the default on most failure modes; this wrapper additionally catches IPC failures (which would otherwise reject the promise).

- `saveSession(record)`:
  - Resolves to `void` once the Rust side has completed the atomic write (or rejected internally).
  - NEVER throws. Logs a `console.warn` on IPC failure.
  - The caller is responsible for filtering Untitled tabs out of `record.tabs` before calling — this module does NOT validate the payload (the validation is structural: TS types prevent malformed payloads at compile time).

### Callers

- `App.tsx`'s mount-time effect (once, on mount): `await loadSession()`.
- `App.tsx`'s debounced save effect (every 300 ms after a persistable change): `await saveSession(record)`.

No other module in the codebase imports from `session.ts`.

### Constitution alignment

- Principle I (Simplicity First): two tiny functions, no state, no class hierarchy.
- Principle VIII (Contributor-Friendly): a `grep -r 'load_session\\|save_session' src/` shows exactly this file as the IPC caller.

---

## 2. `src/lib/launchFiles.ts` (NEW)

Single chokepoint for the launch-files protocol — the cold-start drain command and the live-event subscription. The frontend never invokes `get_pending_files` or `listen("markpad://open-files", …)` directly; everything goes through this module.

### Module-level documentation comment

```ts
// Single chokepoint for the launch-files protocol — how OS-routed files (file association,
// CLI args, second-invocation handoffs) reach the frontend. Two surfaces:
//   - getPendingFiles(): drain the cold-start buffer (call once on mount, BEFORE doing anything
//     that would replay events). Marks the frontend as "ready" on the Rust side; subsequent
//     arrivals come via the live event below.
//   - subscribeToOpenFiles(handler): listen for the live "markpad://open-files" event for handoffs
//     that arrive after the frontend is ready (second invocations, macOS Opened after launch).
// The Rust side guarantees that every routed file is delivered exactly once via one of these
// two paths. This module is the only TS importer of `invoke("get_pending_files")` and
// `listen("markpad://open-files", …)`.
```

### Exports

```ts
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type OpenFilesPayload = { paths: string[] };

export async function getPendingFiles(): Promise<string[]>;

export async function subscribeToOpenFiles(
  handler: (paths: string[]) => void,
): Promise<UnlistenFn>;
```

### Contract

- `getPendingFiles()`:
  - Returns an array of canonical absolute path strings that were queued by the Rust side before the frontend was ready (cold-start CLI args, pre-ready macOS `Opened` URLs).
  - Returns `[]` on IPC failure (logged via `console.warn`).
  - MUST be called exactly once per launch; subsequent calls return `[]` (the Rust side drained the buffer on first call and flipped the ready flag).
  - The caller is responsible for handling the returned paths — typically by iterating them and calling the new `openMarkdownFileByPath` (see §3 below) for each.

- `subscribeToOpenFiles(handler)`:
  - Registers `handler` to be called every time the Rust side emits `markpad://open-files`. The handler receives the array of canonical absolute path strings.
  - Returns an `UnlistenFn` — a function the caller invokes to stop listening (typically in a `useEffect` cleanup).
  - The handler is called on every event; the caller (in `App.tsx`) implements the dedup + open + activate-last logic for each call.
  - The subscription is established asynchronously; the caller MUST `await` the returned promise before assuming events are being delivered.

### Callers

- `App.tsx`'s mount-time effect:
  - `unlisten = await subscribeToOpenFiles(handler)` — subscribed FIRST (before any other async work) so live events arriving mid-mount are buffered by the listener queue, not lost.
  - `pending = await getPendingFiles()` — drained AFTER session restore, then run through the same `handler` to ensure mount-time CLI args go through the same code path as live handoffs.
  - On effect cleanup: `unlisten()`.

No other module in the codebase imports from `launchFiles.ts`.

### Constitution alignment

- Principle I: two functions, one payload type, one event name string. The "ready flag" complexity is entirely in Rust.
- Principle VIII: a `grep -r 'markpad://open-files\\|get_pending_files' src/` shows exactly this file.

---

## 3. `src/lib/fileOpen.ts` (UPDATED)

The existing chokepoint for Tauri's dialog, fs, and window APIs (the comment at the top of the file already documents this). One new export is added.

### Update to the module-level comment

The existing comment (lines 1-4 in the current file) is extended to cross-reference the two new chokepoints:

```ts
// Single chokepoint for Tauri's dialog, fs (read AND write), and window APIs.
// No other module in the app should import @tauri-apps/plugin-dialog,
// @tauri-apps/plugin-fs, or @tauri-apps/api/webviewWindow — grep for those
// module names to verify.
//
// Companion chokepoints (added in Feature 007):
//   - src/lib/session.ts        owns load_session / save_session
//   - src/lib/launchFiles.ts    owns get_pending_files + markpad://open-files event
```

### New export

```ts
export async function openMarkdownFileByPath(path: string): Promise<OpenResult>;
```

Implementation (drop-in, mirrors `openMarkdownFile()` minus the dialog step):

```ts
export async function openMarkdownFileByPath(path: string): Promise<OpenResult> {
  if (typeof path !== "string" || path.length === 0) {
    return { kind: "error", message: "Empty path." };
  }
  try {
    const content = await readTextFile(path);
    return { kind: "ok", name: basename(path), path, content };
  } catch (err) {
    console.warn("Failed to read file by path:", err);
    return { kind: "error", message: friendlyMessage(err) };
  }
}
```

### Contract

- `openMarkdownFileByPath(path)`:
  - Reads the file at `path` (assumed absolute and canonical — the Rust side canonicalizes before sending paths to the frontend).
  - Returns the same `OpenResult` shape as `openMarkdownFile()`, with one structural difference: `kind: "cancelled"` is unreachable (there is no dialog to cancel). The shared type stays the same; callers ignore `"cancelled"` in their switch / if-chain.
  - On any read failure, returns `kind: "error"` with the same `friendlyMessage(err)` mapping the existing `openMarkdownFile()` uses.
  - Does NOT prompt, does NOT dedup, does NOT activate. Those concerns belong to the caller (`App.tsx`'s open-paths handler).

### Existing exports (UNCHANGED)

- `openMarkdownFile()` — still the dialog-based open. Callers (the Open button, the Ctrl+O shortcut) are unaffected.
- `saveMarkdownFile(path, content)` — unchanged.
- `saveMarkdownFileAs(content, defaultName?)` — unchanged.
- `setWindowTitle(fileName)` — unchanged.

### Callers of the new function

- `App.tsx`'s open-paths handler — called inside the mount-time effect AND inside the live `markpad://open-files` handler.

No other module imports it.

---

## 4. `src/App.tsx` (UPDATED — mount-time and persistence orchestration)

`<App />` continues to own all top-level state (per Feature 006). This feature adds:

1. A mount-time `useEffect([])` for session restore + pending-file drain + live subscription.
2. A `useEffect` keyed on persistable shape that debounces `saveSession` calls.
3. One shared "open paths as tabs" handler reused by both the mount-time drain and the live event.

No new visual component is added. No existing component contract changes.

### New state / refs

None. The mount-time effect uses a few local-to-effect `useRef`s for the stale-closure fix (see [research.md §7](../research.md#7)) but they're implementation details inside the effect, not visible to other components.

### Mount-time effect (single, runs once)

```ts
useEffect(() => {
  let cancelled = false;
  let unlisten: UnlistenFn | null = null;

  (async () => {
    // 1. Subscribe FIRST — events arriving mid-mount are queued by the listener.
    unlisten = await subscribeToOpenFiles((paths) => {
      void openPathsAsTabs(paths, { source: "live" });
    });
    if (cancelled) { unlisten(); return; }

    // 2. Restore the saved session.
    const session = await loadSession();
    if (cancelled) return;
    const restored: Array<Tab | null> = [];
    for (const entry of session.tabs) {
      const result = await openMarkdownFileByPath(entry.path);
      if (cancelled) return;
      if (result.kind === "ok") {
        const tab: Tab = {
          id: nextTabId(),
          text: result.content,
          savedText: result.content,
          openedFile: { name: result.name, path: result.path },
          untitledLabel: null,
        };
        restored.push(tab);
      } else {
        restored.push(null);   // preserve index for the fallback walk
      }
    }
    const survivingTabs = restored.filter((t): t is Tab => t !== null);
    setTabs(survivingTabs);

    // 3. Pick the active tab from the saved index, with FR-017 fallback.
    let activeId: TabId | null = null;
    if (session.active_index !== null) {
      const savedAt = restored[session.active_index];
      if (savedAt !== null && savedAt !== undefined) {
        activeId = savedAt.id;
      } else {
        // Walk forward then backward for the nearest survivor.
        for (let i = session.active_index + 1; i < restored.length; i++) {
          if (restored[i]) { activeId = restored[i]!.id; break; }
        }
        if (activeId === null) {
          for (let i = session.active_index - 1; i >= 0; i--) {
            if (restored[i]) { activeId = restored[i]!.id; break; }
          }
        }
      }
    } else if (survivingTabs.length > 0) {
      activeId = survivingTabs[0].id;
    }
    setActiveTabId(activeId);

    // 4. Drain pending files and append them (deduplicating against the restored set).
    const pending = await getPendingFiles();
    if (cancelled) return;
    if (pending.length > 0) {
      await openPathsAsTabs(pending, { source: "pending" });
    }
  })();

  return () => {
    cancelled = true;
    if (unlisten) unlisten();
  };
}, []); // empty deps — runs exactly once
```

### Shared open-paths handler

```ts
type OpenSource = "session" | "pending" | "live";

async function openPathsAsTabs(
  paths: string[],
  options: { source: OpenSource },
): Promise<void> {
  let lastOpenedId: TabId | null = null;
  // Use a tabsRef to avoid stale closure (mount-time + live event both read the latest tabs).
  for (const path of paths) {
    const existing = tabsRef.current.find(t => t.openedFile?.path === path);
    if (existing) {
      lastOpenedId = existing.id;
      continue;
    }
    const result = await openMarkdownFileByPath(path);
    if (result.kind === "ok") {
      const newTab: Tab = {
        id: nextTabId(),
        text: result.content,
        savedText: result.content,
        openedFile: { name: result.name, path: result.path },
        untitledLabel: null,
      };
      setTabs(prev => [...prev, newTab]);
      lastOpenedId = newTab.id;
    } else if (result.kind === "error" && options.source === "live") {
      // Live handoffs surface errors so the user knows their double-click failed.
      // Session/pending sources are silent per FR-012 / FR-016.
      setError(result.message);
    }
  }
  if (lastOpenedId !== null) {
    activateTab(lastOpenedId);   // FR-022's "last opened wins active"
  }
}
```

### Debounced save effect

```ts
const tabPathsKey = useMemo(
  () => tabs.map(t => t.openedFile?.path ?? "").join("|"),
  [tabs],
);

useEffect(() => {
  const id = setTimeout(() => {
    const savedTabs: SessionTabEntry[] = tabs
      .filter(t => t.openedFile !== null)
      .map(t => ({ path: t.openedFile!.path }));
    let activeIdx: number | null = null;
    if (activeTab?.openedFile) {
      const idx = savedTabs.findIndex(s => s.path === activeTab.openedFile!.path);
      activeIdx = idx >= 0 ? idx : null;
    }
    void saveSession({ version: 1, tabs: savedTabs, active_index: activeIdx });
  }, 300);
  return () => clearTimeout(id);
}, [tabPathsKey, activeTabId]);
```

### Notes on the implementation

- `tabsRef` is a `useRef<Tab[]>([])` kept in sync via a `useEffect` that runs on every `tabs` change. This avoids the stale-closure bug where the live event handler (registered once at mount) would otherwise see the empty `tabs` array forever. Same pattern as Feature 006's `handleSaveRef` / `handleNewFileRef`.
- The mount-effect's `cancelled` flag handles React StrictMode's double-mount in dev — if the first mount's cleanup fires before the async sequence completes, subsequent setters are skipped.
- The debounced save effect's `tabPathsKey` (memoized join of paths) is the dep used to detect persistable-shape changes — edits to `text` don't trigger re-runs. Untitled tabs contribute `""` to the key but are filtered out of the payload.
- The active-index fallback walk reuses the same "next neighbor, then previous" pattern that Feature 006 used for close-tab neighbor activation — consistent mental model.
- No new top-level state, no new refs (besides `tabsRef`), no new visual components. The render tree from Feature 006 is unchanged.

### Acceptance

The `<App />` mount-time orchestration covers:
- FR-001, FR-002, FR-003 (OS activation opens files as tabs, last-active rule).
- FR-006 through FR-009 (single-instance routing handled by Rust; frontend handler is the same for live + cold-start).
- FR-010 through FR-013 (CLI args ingested via cold-start drain, append after session, last active).
- FR-014 through FR-021 (session save + restore + missing-file silent skip + fallback active).
- FR-022 through FR-024 (active-tab precedence; dedup; preserve existing tabs).

---

## 5. Components UNCHANGED (Feature 006 contracts preserved)

The visual components introduced or updated by Feature 006 are **not** modified by this feature:

| Component | Status |
|---|---|
| `<TabStrip />` | UNCHANGED — same props (`tabs`, `activeTabId`, `onActivate`, `onClose`), same render contract. |
| `<ConfirmDialog />` | UNCHANGED — same props, same close-with-unsaved-changes contract. |
| `<Editor />` | UNCHANGED — same `EditorHandle` ref API, same `value` / `onChange` props. |
| `<Workspace />` | UNCHANGED — same props. |
| `<Toolbar />` | UNCHANGED. |
| `<ErrorBanner />` | UNCHANGED. |
| `<Preview />` | UNCHANGED. |
| `EmptyState` (the inline component in `App.tsx` for the no-tabs state) | UNCHANGED. |

This is by design: the user-visible UI in Feature 007 is not new chrome — it is the same workspace, with the tabs populated from new sources at launch and persisted to disk between launches.

---

## 6. Files touched at a glance

| File | Action | Why |
|---|---|---|
| `src/lib/session.ts` | NEW | Chokepoint for `load_session` / `save_session`. |
| `src/lib/launchFiles.ts` | NEW | Chokepoint for `get_pending_files` + `markpad://open-files` event. |
| `src/lib/fileOpen.ts` | UPDATE | Add `openMarkdownFileByPath` export; update top-comment cross-references. |
| `src/App.tsx` | UPDATE | Mount-time effect, debounced save effect, shared open-paths handler, `tabsRef`. |
| `src/components/*` | UNCHANGED | All Feature 006 components keep their contracts. |
| `src/lib/preferences.ts` | UNCHANGED | No new preferences. |
| `src/lib/markdown.ts` | UNCHANGED | |
| `src/lib/starterContent.ts` | UNCHANGED | |
| `src-tauri/src/lib.rs` | UPDATE | Plugin chain (add single-instance), `.manage(LaunchFilesState)`, `.setup`, command registration, run-event closure for `RunEvent::Opened`. |
| `src-tauri/src/session.rs` | NEW | `SessionRecord` struct, `load_session` + `save_session` commands. |
| `src-tauri/src/launch_files.rs` | NEW | `LaunchFilesState`, `ingest_initial_args`, `handle_second_invocation`, `handle_opened_urls`, `get_pending_files` command, `bring_to_front`, `canonicalize_arg`, `route_paths`. |
| `src-tauri/Cargo.toml` | UPDATE | Add `tauri-plugin-single-instance = "2"`. |
| `src-tauri/tauri.conf.json` | UPDATE | Add `bundle.fileAssociations` for `md` + `markdown`. |
| `src-tauri/capabilities/default.json` | UNCHANGED | No new permission needed. |

---

## 7. Test surface

No automated test suite is wired up (pre-existing gap). Manual verification is in [quickstart.md](../quickstart.md), which maps every acceptance scenario and success criterion to a numbered manual step.

Each new module's contract is intentionally small enough that a future test setup could mount it in isolation with predictable mocks:

- `session.ts`: pure IPC wrapper. Mockable by stubbing `@tauri-apps/api/core`'s `invoke`.
- `launchFiles.ts`: pure IPC + event wrapper. Mockable similarly plus a stub `listen`.
- `fileOpen.ts:openMarkdownFileByPath`: pure IPC wrapper over `readTextFile`. Same mock approach as Feature 006's existing `openMarkdownFile` would use.

Once a runner is added, the priority order is:

1. The mount-time orchestration in `App.tsx` (session → drain → activate fallback). This is the most subtle ordering logic in the feature.
2. The debounced save effect (verifying it fires after N ms, skips during edits, includes only file-backed tabs).
3. The shared open-paths handler (dedup, source-aware error surfacing, last-opened activation).
4. The Rust-side `route_paths` lock ordering (no double-delivery, no lost arrivals across the ready-flag boundary).
