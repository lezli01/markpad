# Phase 0 — Research: OS File Association, Single Instance, and Session Restore

This document resolves the open technical questions for Feature 007. Each section captures the **decision**, the **rationale**, and the **alternatives considered**, so future contributors can re-open a choice with full context. Foundations laid by Features 002 (CodeMirror 6 + markdown-it + DOMPurify + Tailwind islands), 003 (Open file, view modes, theme, `localStorage` chokepoint), 004 (Save / auto-save, `<FileHeader />`, single chokepoint in `fileOpen.ts`), and 006 (multi-file tabs: `tabs[]` + `activeTabId`, dedup on open, per-tab saving flags, snapshot/restore via `<Editor />` ref, `<TabStrip />`, `<ConfirmDialog />`) are assumed; this feature wires up three external "open this file for me" entry points (OS file association, CLI args, second-invocation handoff) and adds the cross-launch persistence layer those entry points imply.

## 1. Single-instance enforcement — `tauri-plugin-single-instance`

**Decision**: Use the official `tauri-plugin-single-instance` (version `"2"`, matching Tauri 2's plugin-workspace versioning) on the Rust side. The plugin registration is one line in `lib.rs::run()`:

```rust
.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
    launch_files::handle_second_invocation(app, argv, cwd);
}))
```

The callback receives `(AppHandle, Vec<String>, String)` — the second invocation's argv and the cwd it was invoked from. The plugin handles the platform-specific mutex internally: a Windows named mutex, a Unix domain socket on macOS/Linux. The second process exits cleanly as soon as the callback returns in the first process (the plugin handles process termination).

**Rationale**:
- FR-005 requires "at most one running instance per OS user session at any time". Cross-platform single-instance is solved by the plugin in the same maintained workspace that ships Tauri itself (`tauri-apps/plugins-workspace`).
- The callback receives `argv` AND `cwd` — both are needed: `argv` carries the file paths the second invocation was asked to open; `cwd` is needed to resolve any relative paths in `argv`.
- The plugin's mutex is per-OS-user (the Windows named mutex is created in the user-session namespace; the Unix domain socket lives in the per-user runtime dir). That matches spec Assumption 2 exactly.
- No frontend dependency, no new permission, no new capability entry — the plugin is Rust-side only.

**Alternatives considered**:
- **Roll our own lock file + Unix-socket IPC**: write a lock file in app-data, IPC via a domain socket / named pipe to deliver argv, handle stale-lock cleanup on crash. Materially more code (hundreds of lines per platform), more failure modes (stale lock files trap users), more security surface (named pipe permissions, socket file modes). Rejected.
- **Use the OS-level "is process X running" check (psutil-style)**: race conditions galore — checking and locking aren't atomic. Rejected.
- **Skip single-instance and let multiple windows happen**: spec explicitly forbids (FR-005). Rejected.
- **`tauri-plugin-deep-link`**: solves a different problem (custom URL scheme `markpad://...` routing). We need file-path routing, not URL routing. Rejected.

**Implementation notes**:
- Add `tauri-plugin-single-instance = "2"` to `src-tauri/Cargo.toml` under `[dependencies]`.
- The plugin MUST be the FIRST plugin in the chain so the second invocation is short-circuited before any other plugin runs in the second process.
- The callback runs on the first process's main thread; do not block in it. The `handle_second_invocation` function in `launch_files.rs` is non-blocking — it canonicalizes paths, then calls `route_paths` (which either pushes to a `Mutex<Vec<_>>` or emits an event; both are sub-millisecond).
- The plugin handles the second process's exit; we do not need a manual `std::process::exit(0)` call in the callback.

---

## 2. CLI positional arguments — `std::env::args()` directly, no `tauri-plugin-cli`

**Decision**: Read positional args via `std::env::args().skip(1)` at startup (in the `setup` callback) and from the single-instance plugin's callback `argv` parameter for second invocations. No `tauri-plugin-cli` dep.

**Rationale**:
- FR-010 requires positional file paths only. There are no `--flags`, no subcommands, no `--help` to print. `tauri-plugin-cli` is built for richer CLI schemas (matchers, named flags, subcommands); for "list of files" it is overkill.
- The single-instance plugin already gives us `argv` as `Vec<String>` for the second-invocation case; using `std::env::args()` for the cold-start case parallels that perfectly. One mental model, two call sites.
- `tauri-plugin-cli` would add a dep, a build-time config, and a runtime API. None of those buy us anything for positional paths.

**Alternatives considered**:
- **`tauri-plugin-cli` with `positional = true` matcher**: works but adds the dep + a config schema; it parses `argv` for us, but for "treat every arg as a path" we'd just iterate the matcher's positional result, which is identical work to iterating `argv.skip(1)`. Rejected on Principle I.
- **`clap` directly**: same overkill for a flag-less interface. Rejected.

**Implementation notes**:
- `ingest_initial_args(app: &AppHandle, argv: Vec<String>)` is called once from the `setup` callback. It calls `route_paths(app, canonicalize_args(&cwd, argv.into_iter().skip(1)))`, where `cwd = std::env::current_dir().ok()`.
- Cold-start argv on most OSes includes `argv[0]` = the executable path; we skip it.
- The single-instance callback receives the second-invocation `argv` and `cwd` already separated; we don't skip there because the plugin's contract is that argv contains only the actual arguments (no `argv[0]`). [Note for implementers: verify this against the plugin's docs at integration time — if it includes argv[0], add the `.skip(1)`.]
- Arguments that look like flags (`--something`) are passed through as paths today. Per spec Assumption 12, flag handling is out of scope. If a user runs `markpad --version foo.md`, today's behavior would attempt to open a file named `--version` (which doesn't exist → silently skipped per FR-012) and then open `foo.md`. That's acceptable. A future feature can add proper flag handling.

---

## 3. File association manifest — `bundle.fileAssociations` in `tauri.conf.json`

**Decision**: Declare file associations in `src-tauri/tauri.conf.json` under `bundle.fileAssociations`. Tauri 2's bundler generates the correct per-OS manifest entries — Windows registry, macOS `Info.plist` `CFBundleDocumentTypes`, Linux `.desktop` `MimeType`:

```json
"bundle": {
  ...
  "fileAssociations": [
    {
      "ext": ["md", "markdown"],
      "description": "Markdown document",
      "name": "Markdown"
    }
  ]
}
```

**Rationale**:
- Tauri 2 provides this exact config key specifically to abstract over the three OSes' file-association mechanisms.
- The user does NOT need to manually edit registry entries / `Info.plist` / `.desktop` files; the installer generates them.
- The user IS still responsible for *choosing* markpad as the default handler via OS settings (spec Assumption 1) — the manifest only advertises that markpad *can* handle `.md`. This matches macOS's "Get Info → Open With" model, Windows's "Open With → Choose another app → Always use", and Linux's `xdg-mime default`. The spec is explicit that registration UX is out of scope.
- Including `markdown` (the long extension) alongside `md` matches the existing Open dialog filter in `fileOpen.ts:58-59` (`extensions: ["md", "markdown"]`).

**Alternatives considered**:
- **Per-OS bundle config blocks** (`bundle.windows.fileAssociations`, `bundle.macOS.fileAssociations`): Tauri 2 supports per-OS overrides but the cross-platform array generates correct entries for all three; no override is needed for a uniform "handle .md and .markdown" registration.
- **Manual installer edits**: maintenance nightmare per OS. Rejected.
- **Only `md`, not `markdown`**: inconsistent with the existing Open dialog filter and excludes a recognized extension. Rejected.

**Implementation notes**:
- The change is one config block; no Rust or TS code is needed to make the OS aware of the association.
- After this change, the user runs `npm run tauri build` to produce a bundled installer that registers the association. Running `npm run tauri dev` does NOT register the association (dev builds aren't installed into the OS); manual testing on dev builds requires either invoking `markpad path/to/file.md` from a shell (CLI args path) or running the installed release build.
- Adding new extensions later is one line in the array.
- The `name` and `description` fields are user-visible in OS settings ("Default apps" → "Markdown document").
- Linux: the generated `.desktop` includes `MimeType=text/markdown;text/x-markdown;` (Tauri infers from the extension list). Verify on a Linux integration test that `xdg-mime` recognizes the association.

---

## 4. Routing OS file activations — three Rust sources, one frontend event

**Decision**: Three Rust entry points funnel into a single shared pipeline in `launch_files.rs`:

| Source | Rust entry point | Used for |
|---|---|---|
| Cold-start CLI args (Windows / Linux / macOS) | `setup` hook calls `ingest_initial_args(app, std::env::args().collect())` | First process launches with `markpad foo.md` from shell, or via Windows/Linux file-association double-click (file path is in argv) |
| macOS file activation (cold start and hot) | `RunEvent::Opened { urls }` handler in the `.run(callback)` closure calls `handle_opened_urls(app, urls)` | macOS-specific: Finder double-click on a `.md` against a running or launching markpad; `NSApplicationOpenURLs` event |
| Second-invocation handoff (all OSes) | `tauri_plugin_single_instance::init(callback)` → `handle_second_invocation(app, argv, cwd)` | `markpad foo.md` invoked while markpad is already running; Windows/Linux file-association double-click against an already-running markpad |

All three converge in `route_paths(app: &AppHandle, paths: Vec<PathBuf>)` which:
1. Calls `bring_to_front(app)` — `unminimize` + `show` + `set_focus` on the main window. (No-op for the cold-start case where the window is still being created; the window will show on its own.) For the second-invocation case, this is what actually raises the window per FR-007.
2. If `frontend_ready` is false: push paths into `pending: Mutex<Vec<PathBuf>>`. The frontend will drain them on mount via `get_pending_files()`.
3. If `frontend_ready` is true: emit `markpad://open-files` with payload `{ paths: paths.into_iter().map(|p| p.to_string_lossy().into_owned()).collect::<Vec<_>>() }`. The frontend's live subscription handles them.

The frontend has exactly ONE handler for "open these paths as tabs", called from two contexts: the mount-time `getPendingFiles()` drain, and the live `markpad://open-files` event. The handler:
1. For each path, calls `openMarkdownFileByPath(path)` (new `fileOpen.ts` export — reads the file via `readTextFile`, returns the same `OpenResult` shape the existing `openMarkdownFile()` uses).
2. For each `kind: "ok"` result, applies the Feature 006 dedup-or-append logic: if a tab with that path already exists → activate it; else append a new tab.
3. For `kind: "error"` results when the caller is session-restore or pending-files: silently skip (FR-012 / FR-016 — no error banner).
4. After all paths are processed, activate the LAST successfully opened path's tab (FR-022's "last CLI/OS-supplied file wins active").

**Rationale**:
- Three OS event sources, one pipeline. Adding a fourth source later (e.g., a custom URL scheme via `tauri-plugin-deep-link`) is one new entry point that calls `route_paths`. The frontend never has to know which source a path came from.
- The buffer (`pending`) + `frontend_ready` flag eliminates the cold-start race where an OS-dispatched file arrives before the webview's event listener is wired. Without it, files could be silently lost between process-start and webview-ready.
- Bringing the window to front BEFORE delivering the files (rather than after) starts the window animation immediately on the second invocation, so the user's perception is "click → window flashes to front → file appears" rather than "click → wait → file appears → wait → window flashes".
- Emitting at the AppHandle level (`app.emit(...)`) broadcasts to all windows. Since this is a single-window app per FR-005, that's the same as targeting the main window; using `WebviewWindow::emit` would be marginally more specific but adds a window-lookup line for no behavioral difference.

**Alternatives considered**:
- **Three independent event names, three frontend handlers**: violates "one mental model" — every frontend developer has to remember which source uses which event. The pipeline pattern is invariant to source.
- **Polling for new files from the frontend (no events)**: needs a timer + cache-of-already-seen-paths. Strictly more code than emit + listen.
- **Buffer in the frontend (not Rust)**: cannot work — the frontend doesn't exist yet during the cold-start race window. The buffer MUST live in the process layer that exists before the webview.
- **Skip the buffer, just always emit**: loses files dispatched between process-start and listener-wire. macOS in particular loves to dispatch `Opened` URLs to a freshly-launched app before the webview is up; emit-only would silently drop them.

**Implementation notes**:
- `route_paths` runs under the single-instance plugin's callback thread for second invocations; emit is thread-safe in Tauri 2.
- `bring_to_front` is best-effort — if the main window has been closed (rare; the app should be exiting) it returns Ok with a warning logged. The plugin guarantees the second invocation exits anyway; if first instance is dying, the user's click effectively becomes a fresh launch (a new process spawns).
- `frontend_ready` becomes `true` inside `get_pending_files()` BEFORE the buffer is read; this prevents a race where new arrivals between the read and the flag-set would be lost. The order is:
  1. Acquire `pending` lock.
  2. Drain into a local `Vec` (`std::mem::take`).
  3. Set `frontend_ready = true` (still under the lock, or with a separate `compare_exchange` — either works).
  4. Release the lock.
  5. Return the drained `Vec`.
  Anything that arrives during step 1-4 is added to the buffer and IS returned in this call (because it was added before the take). Anything that arrives after the lock is released is processed via emit (because `frontend_ready` is now true).
- The frontend subscribes to `markpad://open-files` BEFORE calling `get_pending_files()`. That way, any event that fires between subscribe and drain is queued by Tauri's event system rather than dropped. (Tauri's event listeners buffer events for the same window after they're registered; they don't lose events that fire while a handler is awaiting another promise.)
- The event payload is JSON-serializable (`{ paths: string[] }`) — Tauri's `emit` handles serialization. Paths are sent as strings (UTF-8); paths that aren't valid UTF-8 on the underlying filesystem use `to_string_lossy` (one of the rare cases where lossy conversion is acceptable — the alternative is to filter them out, but on the three desktop OSes valid UTF-8 paths are overwhelmingly the norm and a path that round-trips losslessly through display is what the user provided).

---

## 5. Path canonicalization — Rust-side, before paths cross the IPC

**Decision**: Each path coming into `launch_files.rs` is canonicalized as soon as it arrives, before it enters the buffer or the emit:

```rust
fn canonicalize_arg(cwd: &Path, arg: &str) -> Option<PathBuf> {
    let path = Path::new(arg);
    let abs = if path.is_absolute() { path.to_path_buf() } else { cwd.join(path) };
    abs.canonicalize().ok()
}
```

`canonicalize` does three things in one call: resolves `..` and `.` segments, follows symlinks, and verifies the path refers to an existing entry. The `Option` return makes "non-existent" indistinguishable from "permission denied while resolving" — both become `None`, which the caller filters out. This is exactly the silent-skip behavior FR-012 (CLI args) and FR-016 (session restore) require.

On macOS, the URLs from `RunEvent::Opened` arrive as `url::Url` values — `Url::to_file_path()` produces an absolute `PathBuf` which is then passed through `canonicalize` for the symlink + existence resolution.

**Rationale**:
- FR-010 explicitly requires that relative paths resolve against the invoking shell's cwd. The single-instance plugin gives us the second invocation's `cwd` (not the first instance's), so the resolution is correct for hand-off args. For cold-start args, `std::env::current_dir()` in `setup` is the right cwd.
- Doing this in Rust lets us drop unresolvable paths before they hit the IPC, so the frontend's "open these paths" code never has to think about "does this exist?" — every path that arrives is guaranteed to exist at the moment of dispatch.
- `canonicalize` resolving symlinks is a small bonus: two `markpad` invocations passing the same logical file via different symlink paths produce the same canonical path, which makes the Feature 006 dedup-by-path work correctly.
- Case-insensitivity (Windows + APFS-case-insensitive macOS) is NOT handled — `canonicalize` returns the path in its on-disk casing, which means two opens of the same file with different-cased paths produce the same canonical path on case-insensitive FS, the same way Feature 006 §2 documented for Open-dialog paths. On Linux's case-sensitive FS, `Foo.md` and `foo.md` are different files and get different tabs — correct behavior.

**Alternatives considered**:
- **Canonicalize in the frontend**: the second invocation's `cwd` would need to be passed through the IPC explicitly. More plumbing for no benefit; also the frontend doesn't have a cheap "does this exist?" check without an explicit fs call.
- **Skip canonicalize, accept paths as-is**: relative paths from CLI args wouldn't resolve correctly against the second invocation's cwd. Rejected.
- **Custom case-folding on Windows**: introduces platform branches we don't need yet. `canonicalize` already produces the on-disk casing which is enough for normal dedup. If real bug reports emerge ("two tabs for the same file with different cases"), revisit.

**Implementation notes**:
- `canonicalize` is in `std::fs`. On Windows it returns paths with the `\\?\` prefix (verbatim path). The frontend MUST tolerate this prefix in `openMarkdownFileByPath` (it does — `readTextFile` handles `\\?\`-prefixed paths fine via the underlying Windows API).
- For files on a network share that's offline: `canonicalize` returns `Err` → `None` → silently skipped. Same behavior as a deleted file.
- For symbolic-link cycles: `canonicalize` returns `Err`. Silently skipped.
- The frontend's dedup uses BYTE-EQUALITY on the canonical paths. Two distinct on-disk files produce two distinct tabs; two routes to the same on-disk file (via different symlinks) produce one tab. This is correct.

---

## 6. Session persistence — Rust-owned `session.json` in app-data dir

**Decision**: Session state is a small JSON file at `${app_data_dir}/session.json`, read and written exclusively from the Rust side via two Tauri commands:

```rust
#[tauri::command]
async fn load_session(app: AppHandle) -> Result<SessionRecord, String> { … }

#[tauri::command]
async fn save_session(app: AppHandle, record: SessionRecord) -> Result<(), String> { … }
```

Schema (the same struct, serialized by `serde_json`):

```rust
#[derive(Serialize, Deserialize, Default)]
struct SessionRecord {
    version: u32,           // currently 1
    tabs: Vec<SessionTabEntry>,
    active_index: Option<usize>,  // index into `tabs`; None means no active tab at save time
}

#[derive(Serialize, Deserialize)]
struct SessionTabEntry {
    path: String,           // absolute, canonical, OS-native separators
}
```

`load_session` returns an empty `SessionRecord::default()` on any read or parse failure — corruption MUST NOT block launch (FR-020). `save_session` writes to `${app_data_dir}/session.json.tmp` and then atomically renames over `session.json` so a crash mid-write leaves the previous (consistent) session intact.

**Rationale**:
- Keeps the `preferences.ts` chokepoint single-purpose ("the only user of `localStorage` in the app"). Session is a structurally different kind of persistence (per-launch lifecycle, larger payload, schema versioning) and merits its own chokepoint.
- Per-OS app-data-dir resolution is a one-liner via `app.path().app_data_dir()` (Tauri 2's path API). No need to compute platform-specific paths from JS.
- Atomic write (temp + rename) is essentially free in Rust (`std::fs::write` + `std::fs::rename`) and gives crash-safety. The same idiom in JS would need `tauri-plugin-fs`'s `writeFile` + `rename` and would expand the capability list.
- The schema is intentionally minimal — paths + active pointer, nothing else. Adding fields later requires bumping `version` and migrating in `load_session` (the existing `version: 1` makes a future migration mechanical).
- `active_index` rather than `active_path` makes the "active file moved/deleted, fall back to neighbor" rule (FR-017) trivially expressible in the frontend (just look at `tabs[active_index]`, fall back to neighbors by index). If the file at `active_index` fails to load, the next surviving file in order becomes active.

**Alternatives considered**:
- **Store in `localStorage`**: would split persistence between TS (preferences) and Rust (session) for no benefit — actually for negative benefit (the chokepoint comment loses precision). `localStorage` quotas and the webview's per-platform storage location quirks also become our problem. Rejected on Principle VIII (chokepoint clarity).
- **Store in Tauri's webview cookie jar / IndexedDB**: even more obscure for a 200-byte payload. Rejected.
- **Use the `tauri-plugin-store` plugin**: solves a richer problem (multiple typed stores with reactive subscription); for one tiny session file it is overkill, and adds a dep. Rejected on Principle I.
- **Per-OS hard-coded paths**: brittle; `app.path()` already does this for us correctly.
- **`save_session` writes synchronously inside the frontend's `useEffect`**: works, but every keystroke that triggers a debounce window-touch causes a redundant write. The 300 ms debounce is cheaper and equally robust.
- **No schema `version` field**: makes future migration require breaking changes. The 4-byte field is cheap insurance.

**Implementation notes**:
- The app-data dir MUST exist before writing. `save_session` calls `create_dir_all(app_data_dir)` before the temp-write; idempotent.
- On a permission error (rare — the app's own data dir is normally writable), `save_session` returns `Err(msg)` and the frontend logs a `console.warn` but does not surface to the user. Session-save is best-effort.
- The corruption-tolerance path in `load_session`:
  ```rust
  let content = match std::fs::read_to_string(&path) { Ok(s) => s, Err(_) => return Ok(SessionRecord::default()) };
  match serde_json::from_str::<SessionRecord>(&content) {
      Ok(r) if r.version == 1 => Ok(r),
      _ => Ok(SessionRecord::default()),  // unknown version, parse error, or version mismatch
  }
  ```
- Unknown future `version` values produce an empty session today; a future feature can add a migration table.
- The frontend's `SessionRecord` TypeScript type mirrors the Rust struct (camelCase via serde rename attributes if the project prefers, OR snake_case throughout — pick one and document in `session.ts`). Decision: **snake_case** in the JSON, with TypeScript types matching, to keep the Rust struct definition the canonical schema and avoid any rename annotations. `session.ts` exports the type so any consumer reads from the same shape.

---

## 7. Mount-time orchestration in `App.tsx` — load, drain, subscribe, append

**Decision**: A single `useEffect([])` runs once on mount with the following sequence:

```
1. unlisten = await subscribeToOpenFiles(handler)     // subscribe FIRST (catches any event that fires mid-sequence)
2. session = await loadSession()                       // restore the saved session
3. for each tab in session.tabs (in saved order):
     openResult = await openMarkdownFileByPath(tab.path)
     if openResult.kind === "ok":
       append a new tab with that content (no dedup needed — these are first writes to an empty tabs list)
     // kind === "error": silently skip (FR-016)
4. activeId = the tab corresponding to session.active_index, IF that tab is in the restored set
            ; else the closest surviving neighbor by saved index (FR-017)
            ; else null (FR-019 — empty state)
   setActiveTabId(activeId)
5. pending = await getPendingFiles()                   // drain the cold-start buffer
6. for each path in pending:
     run the shared open-paths handler  // same handler subscribeToOpenFiles uses; handles dedup + append + activate-last
   (the handler sets activeTabId to the LAST successfully-opened path — overriding the session-restored active per FR-022)
7. on unmount: unlisten()                              // remove the live event subscription
```

Order matters: subscribing FIRST means any event fired by the Rust side between steps 1 and 5 is buffered by Tauri's event-listener queue rather than lost. Loading the session SECOND means restored tabs appear first in the tab strip (preserving saved order); pending files are appended after.

The shared open-paths handler is a single function (defined inside `App.tsx` and captured by both the live subscription and the mount-time drain):

```ts
async function openPathsAsTabs(paths: string[], options: { source: "session" | "pending" | "live" }) {
  let lastOpenedId: TabId | null = null;
  for (const path of paths) {
    // Dedup: if an existing tab has this path, just remember its id for "last opened"
    const existing = tabs.find(t => t.openedFile?.path === path);
    if (existing) {
      lastOpenedId = existing.id;
      continue;
    }
    const result = await openMarkdownFileByPath(path);
    if (result.kind === "ok") {
      const newTab = makeTabFromOpenResult(result);
      setTabs(prev => [...prev, newTab]);  // append
      lastOpenedId = newTab.id;
    } else if (result.kind === "error" && options.source === "live") {
      // For live (user-initiated) handoffs, surface the error so the user knows it failed.
      // For session/pending sources, silent skip per FR-012 / FR-016.
      setError(result.message);
    }
  }
  if (lastOpenedId !== null) {
    activateTab(lastOpenedId);  // FR-003 (OS activation), FR-011 (CLI args), FR-022 (precedence)
  }
}
```

Note the `source` flag: session-restore and cold-start drain MUST be silent on failure; live handoffs (the user just double-clicked a `.md` from Finder against an already-running markpad) MAY surface an error banner because the user has just-recently performed an action and should know it didn't work. This is a deliberate, narrow exception to the otherwise-uniform silent-skip rule, justified by user expectations.

**Rationale**:
- One mount effect, one open-paths handler — minimal surface area in `App.tsx`. The complexity is in the order, not the shape.
- Subscribing first is a standard React pattern to avoid "event fires while loading another thing" races.
- The "last successfully opened wins active" rule (FR-022) is implemented by the same loop that does the opening — no separate "compute active" pass.
- Reusing `activateTab` (the Feature 006 helper that handles the editor snapshot/restore) means the new code paths automatically benefit from cursor/scroll preservation, despite the user never having activated these tabs before in this session (irrelevant for first activation — no snapshot exists yet — but correct for subsequent activations).

**Alternatives considered**:
- **`Promise.all` the file reads in step 3** (parallel restore): cuts cold-start time for many tabs. But it complicates "preserve saved order" because resolution order != iteration order. A sequential loop is simpler and 20 small `readTextFile` calls in series finish well within the 3-second cold-start budget (SC-005). Future optimization if cold-start time becomes a complaint.
- **Use React Suspense**: not warranted — the App's render shape is fine with imperative state updates.
- **Skip step 1's subscribe-first and only subscribe after step 6**: races. Rejected.
- **Don't differentiate `source` in the handler — silent-skip always**: would hide errors when the user actively double-clicks a file (e.g., they renamed it between Finder showing it and clicking). The narrow live-source exception preserves user awareness.

**Implementation notes**:
- The effect's dep array is `[]` — it runs exactly once on mount. Re-running it would reload the session on top of the current state, which is wrong.
- The `unlisten` returned by `subscribeToOpenFiles` is captured in the effect's cleanup. React's StrictMode in dev will mount the component twice; the unlisten on the first unmount cleans up the first subscription, and the second mount subscribes again. No double-handling because each subscription is independent.
- The `openPathsAsTabs` function captures `tabs` via closure, which is the wrong `tabs` on subsequent calls (stale closure). Fix: read `tabs` via a `tabsRef` (`useRef<Tab[]>([])` that's kept in sync via a `useEffect`) inside the handler — same pattern as Feature 006's `handleSaveRef` / `handleNewFileRef`. Alternatively, use the functional form of `setTabs(prev => ...)` and read `prev` for dedup, but the existing `tabs.find` lookup before the `setTabs` call is more readable. The ref pattern wins on consistency with Feature 006.
- During the mount effect, no tabs exist yet (the app just started), so the dedup check in step 3 always fails (no existing tabs). The dedup matters in step 6 (a CLI arg matches a just-restored session tab) and in the live handler (the user double-clicks a file that's already in the tab set).

---

## 8. Debounced session save — 300 ms after the last persistable change

**Decision**: A `useEffect` keyed on `[tabPathsKey, activeTabId]` runs a 300 ms `setTimeout` that calls `saveSession({ version: 1, tabs, active_index })`, where:

```ts
const tabPathsKey = tabs
  .map(t => t.openedFile?.path ?? "")
  .join("|");
// Used only as a dep; not the payload. Empty string for Untitled tabs makes them part of the key
// without conflating them with a missing-path tab — they're excluded from the saved payload.
```

The payload `tabs` array excludes Untitled tabs (those with `openedFile === null`). The `active_index` is the index of the active tab WITHIN the saved (filtered) list, OR `None` if the active tab is Untitled (in which case session-restore reaches step 5 of §7 with `activeId = null` and the cold-start drain populates it).

**Rationale**:
- 300 ms is short enough that the user perceives saves as "instant" (no UI lag — there is none, the save is async), long enough that bursts (open 5 files via Open dialog, switch tabs 3 times) coalesce into one write. Disk write of ~2 KB JSON is sub-millisecond on a modern SSD; the debounce is purely about coalescing, not about cost.
- Keying the effect on `tabPathsKey` rather than `tabs` directly means edits to a tab's `text` (which don't affect the saved shape) don't trigger save attempts. Only changes to the persisted shape — paths, active pointer — trigger the timer.
- The save is fire-and-forget from the frontend's perspective; the Rust side handles the atomic write. If `save_session` returns an error, the frontend logs a `console.warn` and moves on. Failed saves do NOT corrupt the existing file (atomic temp+rename).
- Untitled-tab exclusion is automatic: they have no path, they can't be restored, persisting them would create unreadable entries that get silently skipped on next launch.

**Alternatives considered**:
- **Save on every state change (no debounce)**: 5+ writes per second during burst activity. Wasteful and offers no extra safety (the previous write is already on disk; the next change re-overwrites within milliseconds). Rejected.
- **Save only on app close**: loses everything to a crash. Rejected.
- **Save via the Tauri `WindowEvent::CloseRequested` from Rust, asking the frontend for state**: synchronous IPC handshake at close, finicky, and adds complexity. The debounced opportunistic save is robust enough: if the user closes within 300 ms of their last persistable change, the worst case is one missing change (e.g., they closed the last tab and immediately quit). The next launch would still restore the prior state which is fine — closing the last tab is itself a "go to empty state" intent.
- **Persist Untitled tabs as something restorable**: would require capturing their in-memory text, contradicting FR-021. Out of scope; follow-up "restore unsaved edits" feature can revisit.

**Implementation notes**:
- The effect:
  ```ts
  useEffect(() => {
    const id = setTimeout(() => {
      const savedTabs = tabs
        .filter(t => t.openedFile !== null)
        .map(t => ({ path: t.openedFile!.path }));
      const activeIndex = activeTab?.openedFile
        ? savedTabs.findIndex(s => s.path === activeTab.openedFile!.path)
        : null;
      void saveSession({
        version: 1,
        tabs: savedTabs,
        active_index: activeIndex !== null && activeIndex >= 0 ? activeIndex : null,
      });
    }, 300);
    return () => clearTimeout(id);
  }, [tabPathsKey, activeTabId]);
  ```
- A nice property: the cleanup `clearTimeout` cancels the pending save on every change, so only the LAST change in a burst triggers a write.
- An additional `beforeunload`-style backstop (best-effort save on window close) is OPTIONAL — the 300 ms debounce already handles all but the most rapid close-after-change. If implementers add it, use Tauri's `appWindow.onCloseRequested` event handler with a synchronous-as-possible save call (Rust's `save_session` is async but the rename is fast). Recommend: skip the backstop initially and add it only if real bug reports of "session not saved" appear.
- A note on Untitled tabs and `active_index`: if the user has 3 file-backed tabs and 1 Untitled, and the Untitled tab is active at save time, `active_index` is `null`. Next launch restores the 3 file-backed tabs with no active selection from the session; then if no CLI args, the mount handler picks the first restored tab as active (this is the "fallback when saved active is missing" rule in §10 below, applied here to "saved active was Untitled"). Slightly different from "restore as last user had it" but acceptable — Untitled tabs are inherently ephemeral.

---

## 9. `openMarkdownFileByPath` — the new `fileOpen.ts` export

**Decision**: Add a sibling to `openMarkdownFile()` that opens a known path directly (no dialog):

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

Same `OpenResult` shape, same `friendlyMessage` error mapping, same `basename` helper — every difference between this and `openMarkdownFile()` is the absence of the dialog step.

**Rationale**:
- One chokepoint, one error-mapping path, one return shape. The handler in `App.tsx` doesn't have to know whether a path came from the dialog or from CLI args — both produce an `OpenResult`.
- `readTextFile` works for absolute paths on all three OSes via the existing `fs:allow-read-text-file` capability (no new permission). On Windows, paths with the `\\?\` prefix from `canonicalize` work as well.
- Returning `kind: "error"` rather than throwing lets the caller decide whether to surface or silent-skip (per the `source` flag in §7).

**Alternatives considered**:
- **Bypass the chokepoint and call `readTextFile` directly from `App.tsx`**: violates the "only `fileOpen.ts` imports `@tauri-apps/plugin-fs`" invariant. Rejected.
- **Refactor `openMarkdownFile` to take an optional `path` arg (dialog if absent, direct if present)**: muddies the function's contract — its return type would conditionally include the `cancelled` case (which never applies to direct path opens). Two separate functions are clearer.
- **Inline the read at every caller**: forces every caller to handle the same error mapping; defeats the chokepoint.

**Implementation notes**:
- The chokepoint comment at the top of `fileOpen.ts` is updated to cross-reference `session.ts` and `launchFiles.ts` so grep-by-purpose continues to find every relevant module.
- The `OpenResult` `kind: "cancelled"` variant is unreachable from this function (no dialog, no cancel). The shared type stays — `kind` is a discriminated union and the caller handles it via exhaustiveness.

---

## 10. Active-tab fallback rules at restore time

**Decision**: When loading a session, the active tab is selected by the following precedence (consistent with FR-017 and FR-022):

1. **Saved active still exists, no CLI/pending overrides**: activate `tabs[session.active_index]` (verified to be in the restored set).
2. **Saved active was missing but other saved tabs survive**: activate the saved tab nearest the saved index — preferring the next file in saved order (i.e., `tabs[i+1]`, `tabs[i+2]`, …) and falling back to a prior one (`tabs[i-1]`, `tabs[i-2]`, …) if no later one survives. The first surviving candidate wins.
3. **No saved tabs survive but pending files arrived**: handled in step 6 of the mount sequence — the last pending file becomes active.
4. **No saved tabs survive and no pending files**: `activeTabId = null` → empty state (FR-019).

**Rationale**:
- "Next neighbor by index, then previous" matches the close-tab-neighbor convention from Feature 006 §7 (right-neighbor-first). Same mental model. The "previous if no next" branch ensures the workspace is never tabless when restorable tabs exist (FR-017's explicit guarantee).
- Index-based fallback (rather than path-based) makes the implementation O(N) trivial and doesn't require any extra metadata in `session.json`.
- The "no saved tabs survive but pending files arrived" case is handled implicitly — step 6 of §7 sets `activeTabId` to the last successfully-opened path's tab, overriding whatever step 4 set.

**Alternatives considered**:
- **Always activate the first restored tab on missing-active**: jumps focus far from where the user was. Rejected.
- **Use MRU history (most-recently-used) for fallback**: would require persisting an MRU stack. Overkill for a small editor; the spec doesn't ask for it.
- **Surface an error "your active file was deleted" with a button to choose another**: noisy and modal. Spec FR-016 explicitly forbids dialogs for missing files.

**Implementation notes**:
- In the mount sequence step 4, after restoring all surviving tabs:
  ```ts
  const restored = ...;  // array of newly-created tabs in saved order
  const savedActiveIdx = session.active_index;
  let activeId: TabId | null = null;
  if (savedActiveIdx !== null && savedActiveIdx >= 0) {
    // Try to find the surviving tab at exactly the saved index
    if (savedActiveIdx < restored.length) {
      activeId = restored[savedActiveIdx]?.id ?? null;
    }
    if (activeId === null) {
      // Saved active was missing; walk forward then backward
      for (let i = savedActiveIdx + 1; i < restored.length; i++) {
        if (restored[i]) { activeId = restored[i].id; break; }
      }
      if (activeId === null) {
        for (let i = savedActiveIdx - 1; i >= 0; i--) {
          if (restored[i]) { activeId = restored[i].id; break; }
        }
      }
    }
  } else if (restored.length > 0) {
    activeId = restored[0].id;  // no saved active, but tabs exist — pick the first
  }
  setActiveTabId(activeId);
  ```
  Note: because step 3 ALREADY filtered out the unreadable tabs, the index from `session.active_index` may overshoot the new `restored.length`. The fallback walk handles that uniformly.
  
- Better simpler form: keep a `Map<original_saved_index, new_tab_id>` during step 3, and look up `savedActiveIdx` in that map. The "find first surviving" fallback walks the original-index space, not the new array.

---

## 11. Bring window to front — Tauri `unminimize / show / set_focus`

**Decision**: The Rust helper `bring_to_front(app: &AppHandle)` does:

```rust
fn bring_to_front(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
```

All three calls are best-effort; the order is intentional (`unminimize` before `show` because `show` is a no-op for an already-minimized-but-visible window; `set_focus` last because focus stealing prevention on some OSes requires the window to be visible first). Errors are ignored — if the main window has been destroyed (rare), the second invocation effectively becomes a fresh launch.

**Rationale**:
- These three calls are the standard "raise this window" idiom in the Tauri community (and in any windowing framework — the same names exist in Qt, AppKit, GDK with the same semantics).
- "Best-effort" matches spec Assumption 3: bring-to-front follows OS conventions. We don't promise behavior across virtual desktops, focus-stealing prevention, etc.
- The `tauri-plugin-single-instance` README's own example does exactly these three calls in the callback; we follow the well-trodden path.

**Alternatives considered**:
- **`set_focus` only**: insufficient on Windows when the window is minimized — `set_focus` doesn't un-minimize.
- **`request_user_attention(Critical)`**: starts the window flashing in the taskbar; appropriate for "background app needs urgent input" but wrong for "open this file the user just clicked". Rejected.
- **Move to foreground without focus**: some OSes have an "always on top" trick to raise without stealing focus. Spec wants focus (FR-007: "given input focus"). Rejected.

**Implementation notes**:
- The `"main"` window label matches `tauri.conf.json`'s default window (the conf file doesn't override `label`, so it's `"main"`). If the project ever adds named windows, this string is a maintenance point.
- The Linux behavior depends on the window manager — some respect `set_focus`, some prompt the user to acknowledge. Acceptable per "OS conventions".
- macOS will additionally bounce the dock icon if the window restore takes more than a moment; this is OS-default behavior and welcome.

---

## 12. Frontend live event subscription — `@tauri-apps/api/event`

**Decision**: The frontend subscribes to the `markpad://open-files` event via `@tauri-apps/api/event`'s `listen` function:

```ts
// In src/lib/launchFiles.ts
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type OpenFilesPayload = { paths: string[] };

export async function subscribeToOpenFiles(
  handler: (paths: string[]) => void,
): Promise<UnlistenFn> {
  return listen<OpenFilesPayload>("markpad://open-files", (event) => {
    handler(event.payload.paths);
  });
}

export async function getPendingFiles(): Promise<string[]> {
  return invoke<string[]>("get_pending_files");
}
```

The event name `"markpad://open-files"` uses a "scheme-like" prefix to namespace markpad events from any other future events. Tauri does not require a particular naming convention; we adopt one for grep-ability.

**Rationale**:
- `listen` is the canonical pattern for Rust → frontend push.
- Returning an `UnlistenFn` lets the caller (in `App.tsx`'s mount effect) clean up on unmount, matching React's effect-cleanup pattern.
- Wrapping `invoke("get_pending_files")` in a typed helper means `App.tsx` doesn't import `@tauri-apps/api/core` directly — same chokepoint rule that `fileOpen.ts` follows for the dialog and fs plugins.

**Alternatives considered**:
- **Use `WebviewWindow::listen` instead of `listen`**: the latter is window-agnostic and works in our single-window app. Window-scoped listen would be needed if markpad had multiple windows (it does not, by design).
- **Use a custom event emitter (e.g., a `BroadcastChannel`)**: doesn't bridge to the Rust side.
- **Poll via `getPendingFiles()` on a timer**: extra timer, extra cost, extra latency. Rejected.

**Implementation notes**:
- `listen` resolves to `UnlistenFn` which is itself a function — call it to unsubscribe.
- In React StrictMode, the mount effect runs twice. The first cleanup unsubscribes the first listener; the second mount creates a second listener. Events that fire during the brief no-listener gap (between cleanup and re-subscribe) would be lost in theory, but the mount effect runs synchronously enough that this gap is microseconds and the user can't trigger an OS event that fast.
- Event payloads are JSON; `paths: string[]` is the only field. The Rust side emits via `app.emit("markpad://open-files", json!({ "paths": paths }))`.

---

## 13. Out-of-scope confirmations (re-stated from spec for the tasks phase)

These are intentionally **not** addressed in this feature; planning here ensures the tasks phase does not silently expand scope:

- **Restore unsaved (in-memory) edits across launches**: out of scope (FR-021 + spec Assumption 4). Only file paths + active pointer are persisted. Adding unsaved-edit restore would require capturing tab `text`, conflict-resolving against the on-disk version, and possibly an `~unsaved` directory of buffered files. Candidate for a follow-up.
- **Drag-to-reorder tabs**: out of scope (carried from Feature 006). Tab order at restore matches saved insertion order.
- **Multiple windows / `--new-window` flag / detach tab into new window**: out of scope per spec Assumption 12. The whole feature design assumes one window per user session.
- **Per-tab view modes** (one tab in editor-only, another in split): out of scope per Feature 006 carry-over.
- **Recent files menu / recently closed tabs**: out of scope.
- **File watch / reload from disk on external change**: out of scope. Re-opening an already-open file uses the existing tab (FR-023). External changes to a file currently open in markpad are invisible until the user closes and reopens.
- **Custom URL scheme handling (e.g., `markpad://...` deep links)**: out of scope; the spec is only about file paths. The launch-files pipeline could later be extended to accept URL routes by adding a fourth entry point that calls `route_paths` after URL→path translation.
- **CLI flags** (`--help`, `--version`, `--no-session`, `--new-window`): out of scope per spec Assumption 12. Positional arguments only.
- **Session record migration to a new schema version**: not needed at v1. The `version: 1` field plus the corruption-tolerance return-empty branch makes future migration mechanical.
- **Window size / position persistence**: out of scope. The spec is about *what files were open*, not *how the window was sized*. Could be a follow-up via `tauri-plugin-window-state`.
- **Removal of the `greet` Tauri command** (template leftover in `lib.rs`): out of scope per Complexity Tracking; cleaner as a separate small follow-up PR.
- **ESLint / Prettier / test runner / CI**: still the pre-existing quality-gate gap from 002 / 003 / 004 / 006. Not regressed; not addressed.
