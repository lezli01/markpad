---

description: "Task list for Feature 007 — OS file association, single instance, and session restore"
---

# Tasks: OS File Association, Single Instance, and Session Restore

**Input**: Design documents from `/specs/007-file-association-single-instance/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/tauri-interface.md](contracts/tauri-interface.md), [contracts/frontend-modules.md](contracts/frontend-modules.md), [quickstart.md](quickstart.md)

**Tests**: No automated test suite is wired up (pre-existing gap from Features 002 / 003 / 004 / 006 — see plan.md Principle IX). Verification is manual via [quickstart.md](quickstart.md). No test tasks are generated.

**Organization**: Tasks are grouped by user story so each story can be implemented, verified, and merged independently. Within each story, tasks are ordered so that file-creating tasks precede file-editing tasks and Rust/TS modules are scaffolded before they're wired into `lib.rs` / `App.tsx`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4). Setup, Foundational, and Polish tasks have no story label.
- Every task names exact file paths.

## Path Conventions

Single-project layout (Tauri 2 + React + TypeScript + Vite):

- `src/` — React frontend (TypeScript)
- `src/lib/` — frontend chokepoints
- `src/components/` — React components (unchanged by this feature)
- `src-tauri/src/` — Rust backend
- `src-tauri/capabilities/` — Tauri capability files (unchanged by this feature)
- `specs/007-file-association-single-instance/` — this spec + plan

---

## Phase 1: Setup

**Purpose**: Declare the one new runtime dependency upfront so subsequent compile checks in the foundational and story phases include it.

- [X] T001 Add `tauri-plugin-single-instance = "2"` to the `[dependencies]` table in `src-tauri/Cargo.toml`. This dep is used by US2 (single instance) but is declared in Setup so the dependency manifest is settled before any code changes land. Run `cargo fetch` from `src-tauri/` after editing to verify the dep resolves.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared launch-files pipeline (frontend + backend) that every user story depends on. After Phase 2, the app compiles and behaves identically to Feature 006 — the pipeline is plumbed end-to-end but no source is yet wired to push paths into the buffer or emit live events (US1 wires the OS-Opened source; US2 wires the second-invocation source; US3 wires the initial-argv source; US4 wires session persistence).

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [X] T002 [P] Add a new `openMarkdownFileByPath(path: string): Promise<OpenResult>` export to `src/lib/fileOpen.ts` per [contracts/frontend-modules.md §3](contracts/frontend-modules.md). The implementation mirrors `openMarkdownFile()` minus the dialog step: validate non-empty string, call `readTextFile(path)`, return `{ kind: "ok", name: basename(path), path, content }` on success or `{ kind: "error", message: friendlyMessage(err) }` on failure. Also update the top-of-file chokepoint comment to cross-reference the two new companion chokepoints (`src/lib/session.ts` and `src/lib/launchFiles.ts`) so grep-by-purpose still works.

- [X] T003 [P] Create `src/lib/launchFiles.ts` per [contracts/frontend-modules.md §2](contracts/frontend-modules.md) and [contracts/tauri-interface.md §3 + §4](contracts/tauri-interface.md). Exports: `OpenFilesPayload` type (`{ paths: string[] }`); `getPendingFiles(): Promise<string[]>` wrapping `invoke<string[]>("get_pending_files")` with an error-swallowing try/catch returning `[]` on failure; `subscribeToOpenFiles(handler: (paths: string[]) => void): Promise<UnlistenFn>` wrapping `listen<OpenFilesPayload>("markpad://open-files", evt => handler(evt.payload.paths))`. Include the module-level chokepoint comment from the contract.

- [X] T004 [P] Create `src-tauri/src/launch_files.rs` per [contracts/tauri-interface.md §3, §4, §5](contracts/tauri-interface.md) and [research.md §4, §5, §11](research.md). This file is created with the SHARED helpers only — US1/US2/US3 each add their own source-specific function in later phases. Implement:
  - `pub struct LaunchFilesState { pub pending: Mutex<Vec<PathBuf>>, pub frontend_ready: AtomicBool }` with a `Default` impl.
  - `fn canonicalize_arg(cwd: &Path, arg: &str) -> Option<PathBuf>` — joins `cwd` + relative `arg` (or uses absolute as-is), calls `.canonicalize().ok()` so non-existent / unresolvable paths return `None`.
  - `fn bring_to_front(app: &tauri::AppHandle)` — `if let Some(window) = app.get_webview_window("main") { let _ = window.unminimize(); let _ = window.show(); let _ = window.set_focus(); }`. Errors silenced (best-effort per spec Assumption 3).
  - `fn route_paths(app: &tauri::AppHandle, paths: Vec<PathBuf>)` — short-circuit on empty input; call `bring_to_front(app)`; acquire the `pending` lock; if `frontend_ready.load(SeqCst)` then drop the lock and `app.emit("markpad://open-files", json!({"paths": paths.iter().map(|p| p.to_string_lossy().into_owned()).collect::<Vec<_>>()}))`; else extend `pending` with the paths.
  - `#[tauri::command] pub async fn get_pending_files(state: tauri::State<'_, LaunchFilesState>) -> Result<Vec<String>, String>` — acquire `pending` lock; `std::mem::take` the inner `Vec`; set `frontend_ready.store(true, SeqCst)` while still under the lock; release; return the drained paths as `Vec<String>` via `to_string_lossy`.

- [X] T005 Wire `launch_files` into `src-tauri/src/lib.rs`: add `mod launch_files;` near the top; add `.manage(launch_files::LaunchFilesState::default())` to the Tauri builder chain; register `launch_files::get_pending_files` inside the existing `tauri::generate_handler![...]` macro (keep the existing `greet` registration untouched — its removal is out of scope per plan.md Complexity Tracking). (Depends on T004.)

- [X] T006 [P] Add a `tabsRef: useRef<Tab[]>([])` to `src/App.tsx` and a syncing `useEffect([tabs])` that does `tabsRef.current = tabs;`. This avoids the stale-closure bug in T007's `openPathsAsTabs` handler (which is captured by the mount-time event subscription in T008 and would otherwise see the empty initial `tabs` array forever). Pattern matches Feature 006's `handleSaveRef` / `handleNewFileRef` / `handleOpenFileRef`.

- [X] T007 Implement the shared `openPathsAsTabs(paths: string[], options: { source: "session" | "pending" | "live" }): Promise<void>` function inside `src/App.tsx` per [contracts/frontend-modules.md §4 "Shared open-paths handler"](contracts/frontend-modules.md). For each path: look up via `tabsRef.current.find(t => t.openedFile?.path === path)` and re-focus the existing tab if found (set `lastOpenedId` to its id); otherwise call `openMarkdownFileByPath(path)`, on `kind: "ok"` build a new `Tab` (via `nextTabId()`) and `setTabs(prev => [...prev, newTab])` and set `lastOpenedId` to the new id, on `kind: "error"` surface via `setError(result.message)` ONLY when `options.source === "live"` (silent skip for `session` and `pending` per FR-012 / FR-016). At the end, if `lastOpenedId !== null` call the existing `activateTab(lastOpenedId)` so the last successfully opened tab becomes active (FR-022). (Depends on T002, T006.)

- [X] T008 Add the mount-time `useEffect([])` in `src/App.tsx` per [contracts/frontend-modules.md §4 "Mount-time effect"](contracts/frontend-modules.md). Order: (1) `unlisten = await subscribeToOpenFiles((paths) => void openPathsAsTabs(paths, { source: "live" }))` FIRST (so events firing mid-mount queue rather than disappear); (2) drain via `const pending = await getPendingFiles()` and pass through `await openPathsAsTabs(pending, { source: "pending" })`; (3) cleanup calls `unlisten()`. Track a `let cancelled = false;` outer flag and check it after each `await` to short-circuit React StrictMode's double-mount. NOTE: the `loadSession()` call is NOT added here yet — that's added in US4 (T019). (Depends on T003, T007.)

**Checkpoint**: After Phase 2 the app compiles and behaves identically to Feature 006 (no source pushes paths to the buffer; the live event never fires). The pipeline is fully plumbed and ready to be activated by any of the four user stories.

---

## Phase 3: User Story 1 - Open `.md` files via OS file association (Priority: P1) 🎯 MVP

**Goal**: Wire OS file activations into markpad. On macOS, `NSApplicationOpenURLs` (delivered as `tauri::RunEvent::Opened { urls }`) reaches the running app. On all three OSes, the bundle installer registers markpad as a handler for `.md` and `.markdown`. On Windows / Linux, file activations from the OS browser arrive via process argv — those reach markpad's existing tab set only AFTER US3 lands (cross-story dependency documented below).

**Independent Test**: Build the release bundle (`npm run tauri build`), install it, set markpad as the default `.md` handler in OS settings, then double-click a `.md` file in the OS file browser. The file opens as the active tab in markpad. (See [quickstart.md Scenario A](quickstart.md).)

### Implementation for User Story 1

- [X] T009 [P] [US1] Add `bundle.fileAssociations` to `src-tauri/tauri.conf.json` per [research.md §3](research.md): inside the existing `bundle` object, add `"fileAssociations": [{ "ext": ["md", "markdown"], "description": "Markdown document", "name": "Markdown" }]`. This is a one-block config edit; no code changes.

- [X] T010 [US1] Add a new `pub fn handle_opened_urls(app: &tauri::AppHandle, urls: Vec<tauri::Url>)` function to `src-tauri/src/launch_files.rs` per [research.md §4](research.md). For each URL call `.to_file_path()` (returns `Result<PathBuf, _>`), then run the result through `canonicalize_arg`-style symlink+existence resolution (or call `.canonicalize().ok()` directly since `to_file_path` already produces an absolute path), collect the surviving canonical paths, call `route_paths(app, canonical_paths)`. Import the URL type via `use tauri::Url;` (or whichever path the Tauri 2 re-export uses — verify against the version's docs at integration time). (Depends on T004.)

- [X] T011 [US1] Switch the builder chain in `src-tauri/src/lib.rs` from `.run(tauri::generate_context!()).expect(...)` to the `.build(...).expect(...).run(closure)` form per [research.md §4](research.md) and [plan.md Complexity Tracking](plan.md). Implementation:
  ```rust
  tauri::Builder::default()
      // ... existing plugins, .manage, .invoke_handler ...
      .build(tauri::generate_context!())
      .expect("error while building tauri application")
      .run(|app, event| {
          if let tauri::RunEvent::Opened { urls } = event {
              launch_files::handle_opened_urls(app, urls);
          }
      });
  ```
  The `.run(closure)` form is infallible (returns `()`), so the `.expect(...)` moves from `.run` to `.build`. (Depends on T010.)

**Checkpoint**: On macOS, double-clicking a `.md` file (with markpad as the registered handler) routes the file into markpad correctly for both cold-start and hot scenarios. On Windows / Linux, the bundle now advertises markpad as a `.md` handler, but file activations arriving via argv won't reach the tab set until US3 ships. (See cross-story dependency note in Dependencies below.)

---

## Phase 4: User Story 2 - Single running instance with bring-to-front routing (Priority: P2)

**Goal**: Enforce one running markpad per OS user session. A second invocation (CLI, OS activation, or Open With) routes its file arguments to the existing instance and brings its main window to the foreground, instead of spawning a second process / window. Bare second invocations (no file args) just raise the existing window.

**Independent Test**: Launch markpad; open a file via the in-app Open control; minimize the window. From a terminal, run `markpad` (no args). The existing window restores and comes to the foreground; no second window appears. Then run `markpad foo.md`: still no second window; `foo.md` appears as a new tab alongside the existing tab and becomes active. (See [quickstart.md Scenario B](quickstart.md).)

### Implementation for User Story 2

- [X] T012 [US2] Add a new `pub fn handle_second_invocation(app: &tauri::AppHandle, argv: Vec<String>, cwd: String)` function to `src-tauri/src/launch_files.rs` per [contracts/tauri-interface.md §5](contracts/tauri-interface.md) and [research.md §1](research.md). Implementation:
  ```rust
  pub fn handle_second_invocation(app: &tauri::AppHandle, argv: Vec<String>, cwd: String) {
      bring_to_front(app);  // unconditional — handles bare second invocation (FR-008)
      let cwd_path = std::path::PathBuf::from(&cwd);
      let canonical: Vec<PathBuf> = argv.iter()
          .filter_map(|a| canonicalize_arg(&cwd_path, a))
          .collect();
      if !canonical.is_empty() {
          route_paths(app, canonical);
      }
  }
  ```
  Note: the SI plugin's contract for what `argv` contains (whether `argv[0]` is the executable path) should be verified against the plugin's docs at integration time — if argv[0] is included, add `.iter().skip(1)`. The unconditional `bring_to_front` call satisfies FR-007 + FR-008 (bare second launches raise the window without touching tabs). (Depends on T004.)

- [X] T013 [US2] Register the single-instance plugin in `src-tauri/src/lib.rs` per [research.md §1](research.md). Add the plugin **first** in the chain so the second invocation is short-circuited before any other plugin runs in the second process:
  ```rust
  tauri::Builder::default()
      .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
          launch_files::handle_second_invocation(app, argv, cwd);
      }))
      // ... existing plugins ...
  ```
  (Depends on T001 for the dep and T012 for the callback.)

**Checkpoint**: Running `markpad` (with or without args) while another markpad is open routes to the existing window and brings it to the foreground. Combined with US1, hot file activations on Windows / Linux now work (file association double-click → second invocation → handle_second_invocation → existing window receives the file).

---

## Phase 5: User Story 3 - Open files via positional command-line arguments (Priority: P3)

**Goal**: `markpad file1.md file2.md` from a terminal opens both files as tabs. On cold start (no markpad running), the launching process ingests its own argv. On hot start (markpad already running), the second invocation's argv is routed via US2's `handle_second_invocation`. Bad paths are silently skipped (no error dialog, no orphan tab).

**Independent Test**: With markpad not running, from a fresh shell run `markpad file1.md file2.md`. markpad launches with both files as tabs, in argument order, with `file2.md` active. With markpad running, run `markpad nonexistent.md real-file.md`: no second window; `real-file.md` opens as a new tab and becomes active; `nonexistent.md` is silently skipped. (See [quickstart.md Scenario C](quickstart.md).)

### Implementation for User Story 3

- [X] T014 [US3] Add a new `pub fn ingest_initial_args(app: tauri::AppHandle, argv: Vec<String>)` function to `src-tauri/src/launch_files.rs` per [research.md §2, §4](research.md). Implementation:
  ```rust
  pub fn ingest_initial_args(app: tauri::AppHandle, argv: Vec<String>) {
      let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
      let canonical: Vec<PathBuf> = argv.iter()
          .skip(1)  // argv[0] is the executable path
          .filter_map(|a| canonicalize_arg(&cwd, a))
          .collect();
      if !canonical.is_empty() {
          route_paths(&app, canonical);
      }
  }
  ```
  (Depends on T004.)

- [X] T015 [US3] Add a `.setup(...)` closure to the Tauri builder chain in `src-tauri/src/lib.rs` that calls `ingest_initial_args` per [research.md §2](research.md). Place AFTER `.plugin(tauri_plugin_single_instance::init(...))` from T013 (so the SI plugin claims the lock first; if the lock is already held the second process never reaches `.setup`):
  ```rust
  .setup(|app| {
      launch_files::ingest_initial_args(app.handle().clone(), std::env::args().collect());
      Ok(())
  })
  ```
  The `app.handle().clone()` produces an owned `AppHandle` to satisfy the `ingest_initial_args` signature (`AppHandle` is cheap to clone). (Depends on T014.)

**Checkpoint**: Cold-start `markpad foo.md bar.md` from a shell opens both files. Combined with US1 (file association registration) and US2 (single instance), Windows / Linux file activations cold-start case is also fully covered (file activation → OS launches markpad with argv → `ingest_initial_args` → tab set populated).

---

## Phase 6: User Story 4 - Remember and restore the previous session's open files (Priority: P4)

**Goal**: Persist the set of open file paths and the active-tab pointer to `session.json` in the per-user Tauri app-data dir; on next launch, reopen each surviving file (silently dropping missing ones) and re-activate the saved active tab (or the nearest surviving neighbor per FR-017). A corrupt or missing `session.json` falls back cleanly to the empty state.

**Independent Test**: Open markpad, open three different `.md` files via the in-app Open control, switch to the middle one (active), then close markpad. Relaunch markpad. The three files reappear as tabs in the same order, with the middle one active. Now delete one of those files from disk outside markpad, close markpad, and relaunch. The remaining two appear; no error dialog; an existing-file tab is active. (See [quickstart.md Scenario D](quickstart.md).)

### Implementation for User Story 4

- [X] T016 [P] [US4] Create `src-tauri/src/session.rs` per [contracts/tauri-interface.md §1, §2](contracts/tauri-interface.md) and [data-model.md §1](data-model.md). Implement:
  - Serde structs:
    ```rust
    #[derive(Serialize, Deserialize, Default)]
    pub struct SessionRecord {
        pub version: u32,
        pub tabs: Vec<SessionTabEntry>,
        pub active_index: Option<usize>,
    }
    #[derive(Serialize, Deserialize, Default)]
    pub struct SessionTabEntry {
        pub path: String,
    }
    ```
    (`SessionRecord::default()` produces `{ version: 0, tabs: [], active_index: None }` — the `load_session` corruption fallback returns `SessionRecord { version: 1, ..Default::default() }` to honor the contract.)
  - `#[tauri::command] pub async fn load_session(app: tauri::AppHandle) -> Result<SessionRecord, String>`: resolve `${app_data_dir}/session.json` via `app.path().app_data_dir()`; `read_to_string` and if any error → `Ok(SessionRecord { version: 1, tabs: vec![], active_index: None })`; `serde_json::from_str` and if parse fails or `version != 1` → same fallback; otherwise return the parsed record.
  - `#[tauri::command] pub async fn save_session(app: tauri::AppHandle, record: SessionRecord) -> Result<(), String>`: resolve `${app_data_dir}`; `create_dir_all` (idempotent); serialize `record` to JSON (pretty or compact — either is fine); write to `${app_data_dir}/session.json.tmp`; `std::fs::rename` over `${app_data_dir}/session.json` (atomic on all three OSes); return `Ok(())`. On any I/O error return `Err(format!("{err}"))`.

- [X] T017 [US4] Wire the session module into `src-tauri/src/lib.rs`: add `mod session;`; add `session::load_session` and `session::save_session` to the existing `tauri::generate_handler![...]` macro alongside `launch_files::get_pending_files` and `greet`. (Depends on T016.)

- [X] T018 [P] [US4] Create `src/lib/session.ts` per [contracts/frontend-modules.md §1](contracts/frontend-modules.md). Exports:
  - Types `SessionTabEntry = { path: string }` and `SessionRecord = { version: 1; tabs: SessionTabEntry[]; active_index: number | null }` (snake_case to match the Rust struct field names).
  - `loadSession(): Promise<SessionRecord>` wrapping `invoke<SessionRecord>("load_session")` with try/catch — return `{ version: 1, tabs: [], active_index: null }` on any IPC failure (logs via `console.warn`).
  - `saveSession(record: SessionRecord): Promise<void>` wrapping `invoke<void>("save_session", { record })` with try/catch — log via `console.warn` on IPC failure; never throws.
  Include the module-level chokepoint comment from the contract.

- [X] T019 [US4] Extend the mount-time `useEffect([])` in `src/App.tsx` (originally added by T008) to call `loadSession()` and restore tabs BETWEEN the subscribe step and the `getPendingFiles()` drain step per [contracts/frontend-modules.md §4 "Mount-time effect"](contracts/frontend-modules.md) and [research.md §10](research.md). New ordering:
  1. `unlisten = await subscribeToOpenFiles(...)` (unchanged from T008).
  2. `const session = await loadSession()`.
  3. Iterate `session.tabs` in order. For each entry call `openMarkdownFileByPath(entry.path)`. Build an indexed array (`restored: Array<Tab | null>`) tracking which saved indices succeeded; collect the surviving tabs into a new `survivingTabs` array via `restored.filter((t): t is Tab => t !== null)`; call `setTabs(survivingTabs)`.
  4. Compute initial `activeId` with the FR-017 fallback walk: if `session.active_index` is non-null AND `restored[session.active_index]` is non-null → that tab's id; else walk forward then backward through `restored` for the first survivor; else (no saved active or no survivors near it) pick `survivingTabs[0]?.id ?? null`. Call `setActiveTabId(activeId)`.
  5. `const pending = await getPendingFiles()` (unchanged from T008).
  6. `await openPathsAsTabs(pending, { source: "pending" })` (unchanged from T008). The handler's "last opened wins active" rule overrides the session-restored active when CLI/OS-supplied files are present (FR-022).
  Keep the `cancelled` flag check after every `await`. (Depends on T008 and T018.)

- [X] T020 [US4] Add the debounced save effect to `src/App.tsx` per [contracts/frontend-modules.md §4 "Debounced save effect"](contracts/frontend-modules.md) and [research.md §8](research.md). Implementation:
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
  Notes: Untitled tabs are filtered out (they have no path); their `""` entries in `tabPathsKey` still affect the dep so adding/closing Untitled tabs triggers a debounce window, but the saved payload omits them. (Depends on T018.)

**Checkpoint**: Closing markpad with N file-backed tabs and relaunching restores those N tabs (minus any deleted since close). The previously active tab is re-activated when its file still exists; otherwise a sensible neighbor. A corrupt `session.json` is silently replaced on next save.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Manual acceptance, cross-OS verification, and documentation touch-ups across all four stories.

- [ ] T021 [P] Run [quickstart.md](quickstart.md) Scenarios A, B, C, D, E, F end-to-end on the maintainer's primary OS (Windows, per the repo context). For Scenario A, use the **installed release build** (`npm run tauri build` then install) since dev mode does not register file associations with the OS. Fix any failures uncovered (per-task, not bundled here) and re-run.

- [ ] T022 [P] Cross-OS smoke test: run [quickstart.md Scenarios A1-A4, B1-B5, C14-C18](quickstart.md) on at least one of macOS or Linux (whichever is reachable). Scenario B5 (macOS-specific `RunEvent::Opened` for hot file activation) is the most important non-Windows check since the Rust code path is conditional on OS-level event delivery and cannot be exercised on Windows. Document findings in the PR description.

- [X] T023 [P] Update [README.md](README.md) Features list (lines 17-29) to add three new user-facing bullets:
  - "Open files from your file manager." Set markpad as the default for `.md` and a double-click opens markpad (or routes to the running instance).
  - "One window per user." markpad runs as a single instance; new file requests bring the existing window to the foreground.
  - "Resumes where you left off." Open files are remembered between launches; missing files are silently dropped.
  Also update the "Persistent preferences" bullet to say "and your set of open files" (or move the persistence note to the new Resumes bullet to avoid overlap). Verify the README's stale "Active-file header" bullet (line 25) — if Feature 006 already removed it, this confirmation is a no-op; if it survived, remove it as part of this update. Finally, optionally extend the Privacy section (line 95-96) to add: "Session state (the list of open files) is stored locally in your platform's standard application-data directory; nothing is sent over the network." Coordinate with the maintainer before landing copy changes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — T001 can run immediately on the branch.
- **Foundational (Phase 2)**: Depends on Setup completion (T001 unblocks `cargo build` for any phase that uses the SI plugin, but Foundational itself doesn't use the SI plugin yet, so Phase 2 can technically start in parallel with T001).
- **User Stories (Phases 3-6)**: ALL depend on Foundational (Phase 2) being complete. After Phase 2, user stories can proceed in parallel (if staffed) or sequentially in priority order (P1 → P2 → P3 → P4).
- **Polish (Phase 7)**: Depends on all four user stories being complete.

### User Story Dependencies

All four stories depend ONLY on Foundational at the implementation level. They touch different sources and different files (mostly).

**Cross-story value-delivery dependencies** (relevant when shipping stories separately):

- **US1 macOS file association**: works after Foundational + US1.
- **US1 Windows / Linux file association cold-start**: works after Foundational + US1 + **US3** (because Windows / Linux deliver file activations via process argv, which `ingest_initial_args` from US3 is responsible for ingesting).
- **US1 Windows / Linux file association hot path**: works after Foundational + US1 + US2 + US3 (hot activations on Win/Linux become second invocations routed through `handle_second_invocation` from US2; the file path comes from argv that US3's ingestion logic understands — but for the SI callback specifically, US2's `handle_second_invocation` includes its own argv processing, so technically the hot path on Win/Linux works after just US2 + US1 without US3. US3 is only needed for the COLD start half on those OSes).
- **US2**: works after Foundational + US2 (single instance + bring-to-front, on its own, for any bare second `markpad` invocation or for `markpad foo.md` hot invocations).
- **US3 cold start**: works after Foundational + US3.
- **US3 hot start**: works after Foundational + US2 + US3 (second-invocation routing is from US2).
- **US4**: works after Foundational + US4 (entirely independent of US1/US2/US3 at the implementation level).

**Bottom line for PR sequencing**:
- **One-PR-for-everything** is realistic given the moderate diff (~250 LOC net new). See plan.md Principle IV note.
- **Two-PR split**: PR1 = US1 + US2 + US3 (the launch-files trio, technically interdependent at the user-facing-value level); PR2 = US4 (cleanly isolated to the persistence layer).
- **Four-PR-split** (one per story) is possible but creates intermediate states with partial-OS coverage that are awkward to review.

### File-edit Sequencing Within Phases

These constraints apply because two tasks can't edit the same file in parallel without conflict:

- `src-tauri/src/launch_files.rs`: created in T004; extended in T010 (US1), T012 (US2), T014 (US3). These four tasks MUST be sequential.
- `src-tauri/src/lib.rs`: edited in T005 (foundational), T011 (US1), T013 (US2), T015 (US3), T017 (US4). MUST be sequential.
- `src/App.tsx`: edited in T006, T007, T008 (foundational), T019 (US4), T020 (US4). MUST be sequential.
- All other tasks edit distinct files and can run in parallel where marked `[P]`.

### Parallel Opportunities

**Within Foundational (Phase 2)**:
- T002 (`src/lib/fileOpen.ts`), T003 (`src/lib/launchFiles.ts`), T004 (`src-tauri/src/launch_files.rs`), and T006 (`src/App.tsx` ref + sync effect) can all run in parallel — they touch four different files. Mark all `[P]`.
- T005 waits for T004.
- T007 waits for T002 + T006 (same `App.tsx` file as T006).
- T008 waits for T003 + T007 (same `App.tsx` file as T007).

**Within US1 (Phase 3)**:
- T009 (tauri.conf.json) and T010 (launch_files.rs) can run in parallel.
- T011 waits for T010.

**Within US2 (Phase 4)**: T012 → T013 (T013 needs the function from T012).

**Within US3 (Phase 5)**: T014 → T015 (same reason).

**Within US4 (Phase 6)**:
- T016 (session.rs) and T018 (session.ts) can run in parallel — different files.
- T017 waits for T016.
- T019 waits for T008 (mount effect base) + T018 (session.ts types/wrappers).
- T020 waits for T018; also touches App.tsx so it sequences after T019 (same file).

**Across user-story phases (after Foundational)**: US1, US2, US3, and US4 can be developed in parallel by different team members IF the developers coordinate on the shared `src-tauri/src/lib.rs` and the shared `src-tauri/src/launch_files.rs` (rebase / merge those carefully) and on `src/App.tsx` for US4.

**Polish (Phase 7)**: T021, T022, T023 can all run in parallel (different OSes / different file).

---

## Parallel Example: Foundational (Phase 2)

```bash
# Launch the four file-creating / first-touch foundational tasks together:
Task: "T002 Add openMarkdownFileByPath to src/lib/fileOpen.ts (+ chokepoint comment update)"
Task: "T003 Create src/lib/launchFiles.ts with getPendingFiles + subscribeToOpenFiles"
Task: "T004 Create src-tauri/src/launch_files.rs with LaunchFilesState + helpers + get_pending_files"
Task: "T006 Add tabsRef + sync useEffect to src/App.tsx"

# Then sequentially:
Task: "T005 Wire launch_files into src-tauri/src/lib.rs (depends on T004)"
Task: "T007 Implement openPathsAsTabs in src/App.tsx (depends on T002, T006)"
Task: "T008 Add mount-time useEffect in src/App.tsx (depends on T003, T007)"
```

## Parallel Example: User Story 4 (Phase 6)

```bash
# Launch the two new-file scaffolding tasks together:
Task: "T016 Create src-tauri/src/session.rs with SessionRecord + load_session + save_session"
Task: "T018 Create src/lib/session.ts with SessionRecord types + loadSession + saveSession wrappers"

# Then sequentially:
Task: "T017 Wire session module into src-tauri/src/lib.rs (depends on T016)"
Task: "T019 Extend mount-time useEffect in src/App.tsx with loadSession + restore (depends on T008 + T018)"
Task: "T020 Add debounced saveSession useEffect to src/App.tsx (depends on T018)"
```

---

## Implementation Strategy

### MVP First (US1 + minimum prerequisites)

If shipping the smallest user-visible MVP first:

1. Complete Phase 1: Setup (T001).
2. Complete Phase 2: Foundational (T002-T008).
3. Complete Phase 3: US1 (T009-T011).
4. **STOP and VALIDATE**: on macOS, run [quickstart.md Scenario A](quickstart.md) — double-clicking a `.md` file opens it in markpad. On Windows / Linux, the bundle registers markpad as a handler, but actually opening files via clicks will land in the empty state (because argv ingestion is still missing) — **so the MVP is macOS-only at this point**.
5. To make MVP cross-platform, add US3 (T014-T015) so cold-start argv ingestion lands.
6. To remove the multi-window annoyance on Win/Linux double-clicks against a running markpad, add US2 (T012-T013).

This sequence reflects the spec's stated priorities. The maintainer should weigh "cross-platform MVP" against "macOS-only MVP that ships sooner" when picking the merge order.

### Recommended (per plan.md): two-PR delivery

1. **PR1** = T001 + T002–T008 + T009–T011 + T012–T013 + T014–T015 (Setup + Foundational + US1 + US2 + US3). All "launch-files pipeline" stories together. After merge: file association works on all three OSes for both cold and hot paths; CLI args work; single-instance prevents duplicate windows.
2. **PR2** = T016–T020 (US4 — session restore), cleanly isolated to the persistence layer.
3. Polish (T021–T023) runs after both PRs land, before tagging a release.

### Incremental Delivery (one PR per story)

Possible but creates four PRs with intermediate states that need careful per-OS testing on each merge. Only worth doing if the maintainer wants visible per-story commits in `master` history for archaeology purposes.

### Parallel Team Strategy

With multiple developers:

1. Single dev completes T001 then T002-T008 (Foundational is sequential within the same files, so parallel hands don't speed it up much).
2. After Foundational:
   - Developer A: US1 (T009-T011)
   - Developer B: US2 (T012-T013)
   - Developer C: US3 (T014-T015)
   - Developer D: US4 (T016-T020)
3. Coordinate sequential edits to `src-tauri/src/lib.rs` (T011, T013, T015, T017) and `src-tauri/src/launch_files.rs` (T010, T012, T014) via rebase / sequenced merges.

---

## Notes

- `[P]` tasks edit different files and have no dependencies on each other.
- `[Story]` label maps each task to a single user story; foundational/setup/polish tasks have no story label.
- Untracked tasks would emerge from real-world testing — e.g., if `tauri-plugin-single-instance` requires capability entries on a specific OS, or if `RunEvent::Opened` for Tauri 2 has a different field layout than research.md §4 assumes. These are caught in T021 / T022 (manual acceptance) and fixed inline.
- The `greet` Tauri command in `lib.rs` (Tauri template leftover) is intentionally NOT removed by any task here — per plan.md Complexity Tracking, that is a separate follow-up cleanup commit to avoid mixing unrelated changes (Constitution Principle IV).
- Commit after each task or logical group; the foundational phase's seven tasks are best landed as one commit since they form one atomic "pipeline scaffolded" change.
- Stop at any checkpoint to validate the user story independently.
- Avoid: cross-story dependencies that would break a story's independent testability (only macOS US1 is genuinely independent of the others; documented above).
