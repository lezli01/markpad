# Implementation Plan: OS File Association, Single Instance, and Session Restore

**Branch**: `007-file-association-single-instance` | **Date**: 2026-05-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-file-association-single-instance/spec.md`

## Summary

Take markpad from "I have to launch the app, then browse to the file" to "I double-click a `.md` file in the OS file browser and markpad opens it". Three things have to hold together for that to feel right: (1) the OS knows markpad can handle `.md` (file-association metadata in the Tauri bundle); (2) a double-click against an already-running markpad lands in the existing window (single-instance plugin) and brings it to front (`unminimize() + show() + set_focus()`); (3) on relaunch, the workspace comes back the way the user left it (a small `session.json` of file paths + active-tab pointer, restored on mount). The same infrastructure also makes `markpad file1.md file2.md` work from a terminal — CLI positional args go through the same "open these paths as tabs" pipeline as OS activations and second-invocation handoffs.

Technical approach: keep the Feature 006 in-memory tab model exactly as it is (`tabs: Tab[]`, `activeTabId: TabId | null`, dedup-by-path on open, per-tab saving flags, snapshot/restore via `<Editor />` ref). Add a **launch-files pipeline** on the Rust side that funnels three sources of "files to open" — initial `std::env::args()`, macOS `RunEvent::Opened { urls }`, and the `tauri-plugin-single-instance` second-invocation callback `(app, argv, cwd)` — into a single buffered queue. The frontend, on mount, drains the queue once via `get_pending_files()` and subscribes to a live `markpad://open-files` event for everything that arrives after. Session persistence is a tiny `session.json` written to the Tauri app-data dir; the Rust side owns the read/write via `load_session` / `save_session` commands (kept off `localStorage` so the existing `preferences.ts` chokepoint stays single-purpose and so atomic writes + per-OS path resolution land in one place). Cold-start composition: load session → restore tabs (silently dropping missing files via the existing `readTextFile` error path) → drain pending → append (deduplicated) → activate "last CLI/OS-supplied file else saved active else null". A debounced save (300 ms after the last change to tab paths or `activeTabId`) keeps `session.json` current without bursting on every keystroke; a window-close backstop catches anything that didn't make it.

One new Rust dep (`tauri-plugin-single-instance`); zero new npm deps; one new bundle config block (`bundle.fileAssociations` for `md` + `markdown`); two new Rust source files (`session.rs`, `launch_files.rs`); two new TS chokepoints (`session.ts`, `launchFiles.ts`); one extended TS chokepoint (`fileOpen.ts` gains `openMarkdownFileByPath`); `App.tsx` grows a mount-time effect, a debounced-save effect, and one event subscription. No changes to existing visual components (`<TabStrip />`, `<Workspace />`, `<Editor />`, `<Toolbar />`, `<ConfirmDialog />`, `<ErrorBanner />`, `<Preview />`), no changes to `<TabStrip />`'s contract from Feature 006, no new capabilities (custom commands are runtime-accessible by default in Tauri 2), no new `localStorage` keys.

## Technical Context

**Language/Version**: TypeScript 5.8 (strict mode, `react-jsx`), Rust 1.75+ via Tauri 2 toolchain (unchanged from Features 003 / 004 / 006). New Rust code lives in two small modules added under `src-tauri/src/`.

**Primary Dependencies**:
- Already in `package.json` (from 002 / 003 / 004 / 006): `react@^19`, `react-dom@^19`, `@tauri-apps/api@^2`, `@tauri-apps/plugin-opener@^2`, `@tauri-apps/plugin-dialog@^2`, `@tauri-apps/plugin-fs@^2`, `vite@^7`, `@vitejs/plugin-react@^4`, `typescript@~5.8`, `codemirror@^6`, `@codemirror/state@^6`, `@codemirror/view@^6`, `@codemirror/commands@^6`, `@codemirror/lang-markdown@^6`, `markdown-it@^14`, `dompurify@^3`, `tailwindcss@^4`, `@tailwindcss/vite@^4`.
- New runtime deps (npm): **none**. The launch-files event uses `@tauri-apps/api/event` (already pulled in via `@tauri-apps/api`); commands use `@tauri-apps/api/core`'s `invoke` (same).
- New Rust deps: **`tauri-plugin-single-instance = "2"`** added to `src-tauri/Cargo.toml`. Justified in Complexity Tracking (rolling DIY single-instance lock+IPC is materially more code and a security/safety risk; the official plugin is well-maintained in `tauri-apps/plugins-workspace`). `serde` + `serde_json` are already present and cover session.json (de)serialization.
- New dev deps: none.

**Storage**:
- `localStorage` keys unchanged: `markpad.theme`, `markpad.viewMode`, `markpad.autoSave` (Features 003 / 004). The `preferences.ts` chokepoint stays single-purpose.
- NEW persistent file: `session.json` at `${app_data_dir}/session.json`. Per-user, per-OS:
  - Windows: `%APPDATA%\dev.is-a.lezli01.markpad\session.json`
  - macOS: `~/Library/Application Support/dev.is-a.lezli01.markpad/session.json`
  - Linux: `${XDG_DATA_HOME:-~/.local/share}/dev.is-a.lezli01.markpad/session.json`
- Format: small JSON, schema documented in [data-model.md §1](data-model.md). Read+write via Rust commands (`load_session`, `save_session`) — frontend never touches the path directly.
- File-system access on the frontend unchanged: `readTextFile` via `tauri-plugin-fs` for every restored / CLI / OS-activated file, with the same `friendlyMessage` error mapping `fileOpen.ts` already uses. The Tauri capability list in `src-tauri/capabilities/default.json` is **unchanged** — custom commands are runtime-accessible by default in Tauri 2, and no new `fs` scope or new permission is required (`fs:allow-read-text-file` + `fs:allow-write-text-file` already cover all file reads/writes the frontend does).

**Testing**: No automated test suite is wired up in the repo yet — same pre-existing gap as Features 002 / 003 / 004 / 006. Per Constitution Principle IX, CI is expected to run `tsc`, ESLint, and Prettier. `tsc --noEmit` is exercised by `npm run build`; `eslint` is exercised by `npm run lint` (a script exists but is not yet gated by CI). Prettier and a test runner remain the unaddressed pre-existing gap — see Complexity Tracking. Rust compilation IS gated end-to-end via `npm run tauri build`, which means the new `session.rs` / `launch_files.rs` modules and the `tauri-plugin-single-instance` integration get a real compile-and-link check on every full build. Manual acceptance is via [quickstart.md](quickstart.md) (numbered steps mapped to FR / SC IDs).

**Target Platform**: Desktop — Windows, Linux, macOS — via Tauri 2 system webview. Three behaviors are platform-aware and handled in Rust:
- **CLI args** (Windows/Linux for file association, all three for `markpad` from a shell): `std::env::args()` at startup, single-instance callback `(app, argv, cwd)` for second invocations.
- **OS `Opened` URLs** (macOS for file association — Finder double-click against a running app does NOT spawn a second process; it sends an `NSApplicationOpenURLs` event surfaced as `tauri::RunEvent::Opened { urls }`): handled in the `run(callback)` event handler.
- **Bring-to-front** (`unminimize` + `show` + `set_focus`): same Tauri API on all three platforms.

The `tauri-plugin-single-instance` plugin handles the cross-platform mutex internally (Windows named mutex / Unix domain socket / equivalent) so the application code is the same on all three.

**Project Type**: Desktop application (Tauri + React frontend, Rust backend). Single-project layout — frontend in `src/`, backend in `src-tauri/` — unchanged from prior features.

**Performance Goals**:
- Cold start with N ≤ 20 saved tabs: workspace usable (TabStrip rendered, active tab loaded, editor interactive) within 3 s (SC-004 / SC-005). The bottleneck is the N parallel `readTextFile` calls during restore; we issue them in parallel via `Promise.all` and let the active tab settle first.
- Hot single-instance dispatch (second invocation → existing window's active tab is the supplied file AND window is in foreground): under 500 ms in ≥ 95% of cases on a typical desktop machine (SC-007). The hot path is: single-instance plugin's IPC delivers `argv` to the running process → `launch_files` canonicalizes paths and emits `markpad://open-files` → frontend listener invokes `openMarkdownFileByPath` per path (one fs read per file). The `unminimize / show / set_focus` calls run in parallel with the read on the Rust side so the window animation starts immediately.
- Session save debounce: 300 ms after the last change to the persisted shape (tab paths array or `activeTabId`). Burst activity (10 tabs opened in rapid succession) coalesces into a single write.
- Missing-file restore handling: silent skip per file with no modal error (FR-016, SC-008). The skip path is the existing `readTextFile` rejection in `openMarkdownFile`; we just don't surface the error banner for session-restore failures (FR-016 specifically forbids any error dialog).
- Memory: `session.json` is bounded to "list of file paths + one integer". For 20 tabs averaging 100-character paths, that's ~2 KB; well below disk and parse noise.

**Constraints**:
- All Feature 002 / 003 / 004 / 006 constraints carry over: layout usable from 480 px to 3840 px, sanitizer in the markdown render path, no network access, no new runtime deps without a written justification.
- Bring-to-front follows OS conventions (spec Assumption 3); behavior across virtual desktops, multi-monitor, "always on top", focus-stealing prevention is whatever the host OS provides. The spec does not promise teleportation beyond what `unminimize / show / set_focus` achieve.
- `session.json` corruption MUST NOT block launch (FR-020). The Rust loader returns an empty session on any parse error and the file is re-saved fresh from the new session.
- Missing-file handling MUST be silent across both CLI (FR-012) and session restore (FR-016) — no error dialog, no orphan tab placeholder. The frontend uses the existing `OpenResult.kind === "error"` branch but elides the error banner for these two callers (it stays for user-initiated `openMarkdownFile()` calls via the dialog).
- The Feature 006 dedup rule (FR-011 — re-open of an already-open file activates the existing tab, never reloads from disk) MUST apply uniformly across all three new sources (OS activation, CLI args, session restore). Session restore in particular MUST NOT re-read a file whose tab already exists by path; this can happen if a tab was already created from CLI args before session-restore ran.
- Window-title behavior (Feature 003 FR-007 — the OS window title reflects the active tab's file) MUST continue to work as the active tab changes via any source.
- Untitled tabs (Feature 006 — tabs with `openedFile === null`) MUST NOT be persisted to `session.json`. They have no path to restore from (FR-021 + spec Assumption 4).
- Single instance is per-user-session (spec Assumption 2). The `tauri-plugin-single-instance` lock is scoped to the OS user account by default.

**Scale/Scope**:
- 1 new Rust runtime dep (`tauri-plugin-single-instance`); 0 new npm deps.
- 2 new Rust source files (`src-tauri/src/session.rs` ~70 LOC, `src-tauri/src/launch_files.rs` ~120 LOC); 1 Rust file updated (`src-tauri/src/lib.rs` grows from ~16 to ~45 LOC for plugin chain + run-event callback + command registration); 0 Rust files deleted.
- 1 Tauri config update (`tauri.conf.json` gains `bundle.fileAssociations` for `md` + `markdown`).
- 0 new Tauri capabilities; 0 new permissions; 0 new IPC scopes.
- 3 new Tauri commands (`load_session`, `save_session`, `get_pending_files`); 1 new Tauri event (`markpad://open-files`).
- 2 new TS modules (`src/lib/session.ts` ~40 LOC, `src/lib/launchFiles.ts` ~30 LOC); 2 modified (`src/App.tsx` grows by ~80 LOC for mount-time restore + debounced save + live event subscription; `src/lib/fileOpen.ts` adds `openMarkdownFileByPath` ~20 LOC); 0 TS files deleted.
- 0 new visual components; 0 deleted components; the Feature 006 component contracts are unchanged.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Simplicity First | PASS | One new Rust dep (single-instance plugin, justified below). Zero new npm deps. No new state library, no new visual component, no new context, no router. Session record is a tiny JSON. The launch-files pipeline is a `Mutex<Vec<PathBuf>>` + an `AtomicBool` + one Tauri command + one Tauri event. The whole feature is ~250 lines of net new code across Rust and TS combined. |
| II | Cross-Platform Desktop Support | PASS | `tauri-plugin-single-instance` is cross-platform (handles Windows mutex / Unix socket internally — uniform Rust API). `bundle.fileAssociations` in Tauri 2 generates per-platform manifests (Windows registry entries, macOS `Info.plist` `CFBundleDocumentTypes`, Linux `.desktop` `MimeType`). CLI args via `std::env::args()` is OS-native. `RunEvent::Opened` handles macOS-specific file activations. No platform-specific code in the frontend. |
| III | Spec-Driven Development | PASS | `spec.md` exists and passed the speckit-specify checklist (all 16 items first-iteration green); this plan derives from it directly. No silent scope expansion. |
| IV | Small, Reviewable Changes | PASS (with note) | Four user stories at P1–P4 are independently shippable. Recommended decomposition: PR 1 = P1+P2+P3 (single-instance plugin + bundle.fileAssociations + Rust launch-files pipeline + frontend mount-time `getPendingFiles` + live event subscription + `openMarkdownFileByPath`); PR 2 = P4 (session.rs + load/save commands + frontend session restore + debounced save). Two PRs total, with a clean cleavage at the persistence layer. P1+P2+P3 are tightly coupled (they share the same event pipeline) — splitting them further would create intermediate states with no user-visible value. If shipped as one PR the diff stays moderate (~5 edited files, 4 new files, 1 new dep, no deleted files). |
| V | AI-Assisted but Human-Owned | PASS | This plan is AI-drafted; the maintainer reads, reviews, and approves before any code lands on `master`. |
| VI | Local-First & Private by Default | PASS | No network access added. `session.json` is local-only, per-user, stored in the standard Tauri app-data dir (no roaming, no sync). Single-instance plugin uses an OS-local mutex / Unix-domain socket — no network protocol. File associations are local OS configuration. No telemetry. The default install continues to send zero data anywhere. |
| VII | Safe Markdown Rendering | PASS | The render path is untouched. Files loaded from any source (dialog, CLI args, session restore, OS activation) all flow through the same `readTextFile` → `activeTab.text` → `<Preview />` → markdown-it → DOMPurify pipeline that Feature 002 / 003 established. Quickstart includes a regression check: open a malicious-payload `.md` via OS file activation, confirm the sanitizer still strips inline `<script>` and event handlers. |
| VIII | Contributor-Friendly Open Source | PASS | The chokepoint pattern is preserved and extended: `fileOpen.ts` stays the single importer of `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs` (it gains `openMarkdownFileByPath` as an additional export, not as a leaky new import elsewhere); `preferences.ts` stays the single user of `localStorage`. Two new chokepoints (`session.ts` for the session commands, `launchFiles.ts` for the launch-files protocol) are tiny and single-purpose. Each new Rust module owns one concern (`session.rs` = session.json read/write, `launch_files.rs` = pending-files buffer + canonicalization + event emission). `lib.rs` stays a thin wiring file. Quickstart maps every acceptance scenario and success criterion to a manual step. |
| IX | Quality Gates: Tests, Lint, Format, CI | PARTIAL (pre-existing) | `tsc` is enforced via `npm run build`. `eslint` exists as a script (`npm run lint`) but is not yet gated by CI. Prettier and an automated test runner remain the unaddressed pre-existing gap from earlier features — see Complexity Tracking row "Quality gate setup". This feature does NOT regress the gap; nothing it introduces would be caught by tools that are still not wired up. One small improvement: Rust compilation is end-to-end gated by `npm run tauri build`, so the new `session.rs` / `launch_files.rs` modules and the plugin integration get a real compile-and-link check (not just `tsc`). |

**Decision**: Gate passes for this feature. Principle IX gap is pre-existing and tracked; no new gap introduced.

**Post-design re-check** (after `research.md` + `data-model.md` + `contracts/` + `quickstart.md`): No new violations introduced. The design adds exactly one runtime dependency (`tauri-plugin-single-instance`, justified), zero npm deps, zero new visual components, zero new state libraries, zero new Tauri capabilities. The Rust side gains two small single-purpose modules + a thin update to `lib.rs` for plugin wiring + run-event callback registration. The frontend gains two single-purpose chokepoints + a mount-time effect + a debounced save effect in `App.tsx`. The Feature 006 in-memory tab model is preserved verbatim. State management stays on local React state + refs (Principle I). The launch-files pipeline funnels three OS-level event sources into one event/command pair (one frontend handler covers all of them — no per-source branches leak into the UI code). Session persistence is owned end-to-end by Rust (one storage location, one schema, one writer) so atomicity and per-OS path resolution don't leak into the frontend.

## Project Structure

### Documentation (this feature)

```text
specs/007-file-association-single-instance/
├── plan.md                        # This file (/speckit-plan command output)
├── spec.md                        # Feature specification (already exists)
├── research.md                    # Phase 0 output (this command)
├── data-model.md                  # Phase 1 output (this command)
├── quickstart.md                  # Phase 1 output (this command)
├── contracts/                     # Phase 1 output (this command)
│   ├── tauri-interface.md         # Rust↔TS: commands + events + payloads
│   └── frontend-modules.md        # Frontend module APIs: session.ts, launchFiles.ts, fileOpen.ts changes, App.tsx mount sequence
├── checklists/
│   └── requirements.md            # /speckit-specify quality checklist (already exists)
└── tasks.md                       # Phase 2 output (/speckit-tasks command — NOT created here)
```

### Source Code (repository root)

```text
markpad/
├── src/                              # React + TypeScript frontend
│   ├── main.tsx                      # UNCHANGED
│   ├── App.tsx                       # UPDATE: mount-time effect (loadSession → restore tabs → getPendingFiles → append → activate per FR-022); debounced effect (save_session on (tabs.map(t=>t.openedFile?.path), activeTabId) change, 300 ms); subscribe to "markpad://open-files" event for live handoffs; window-close backstop (best-effort beforeunload-style sync save). Feature 006 tab model, handlers, refs, snapshot/restore all UNCHANGED in shape.
│   ├── styles.css                    # UNCHANGED
│   ├── components/
│   │   ├── Workspace.tsx             # UNCHANGED
│   │   ├── Editor.tsx                # UNCHANGED (Feature 006's imperative-handle API is reused)
│   │   ├── Preview.tsx               # UNCHANGED
│   │   ├── Toolbar.tsx               # UNCHANGED
│   │   ├── ErrorBanner.tsx           # UNCHANGED
│   │   ├── TabStrip.tsx              # UNCHANGED (Feature 006 contract preserved)
│   │   └── ConfirmDialog.tsx        # UNCHANGED
│   ├── lib/
│   │   ├── markdown.ts               # UNCHANGED
│   │   ├── starterContent.ts         # UNCHANGED
│   │   ├── preferences.ts            # UNCHANGED (no new persistence belongs here — session has its own chokepoint)
│   │   ├── fileOpen.ts               # UPDATE: add export `openMarkdownFileByPath(path: string): Promise<OpenResult>` that reads an existing path (no dialog). Updated chokepoint comment cross-references the two new chokepoints (`session.ts`, `launchFiles.ts`). Existing `openMarkdownFile()` / `saveMarkdownFile` / `saveMarkdownFileAs` / `setWindowTitle` are unchanged.
│   │   ├── session.ts                # NEW: chokepoint for the session-persistence commands. Exports `loadSession(): Promise<SessionRecord>` and `saveSession(record: SessionRecord): Promise<void>` — typed wrappers over `invoke("load_session" | "save_session")`.
│   │   └── launchFiles.ts            # NEW: chokepoint for the launch-files protocol. Exports `getPendingFiles(): Promise<string[]>` (one-shot drain on mount) and `subscribeToOpenFiles(handler: (paths: string[]) => void): UnlistenFn` (live event subscription).
│   └── vite-env.d.ts                 # UNCHANGED
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                   # UNCHANGED (still just calls markpad_lib::run)
│   │   ├── lib.rs                    # UPDATE: extend `run()` to: (a) register `tauri_plugin_single_instance::init(callback)`; (b) `.manage(LaunchFilesState::default())`; (c) `.setup(|app| { launch_files::ingest_initial_args(app, std::env::args().collect()); Ok(()) })`; (d) register new commands `load_session`, `save_session`, `get_pending_files`; (e) switch from `.run(generate_context!())` shorthand to `.build(generate_context!())?.run(|app, event| { if let RunEvent::Opened { urls } = event { launch_files::handle_opened_urls(app, urls); } })` so the macOS Opened event is observable.
│   │   ├── session.rs                # NEW: serde structs (`SessionRecord` / `SessionTabEntry`); `load_session(app) -> SessionRecord` and `save_session(app, record) -> ()` Tauri commands; app-data-dir resolution via `app.path()`; atomic-ish write (write to `session.json.tmp` then rename) to survive a crash mid-write; corruption tolerance (return empty session on parse error, no panic).
│   │   └── launch_files.rs           # NEW: `LaunchFilesState { pending: Mutex<Vec<PathBuf>>, frontend_ready: AtomicBool }`; `ingest_initial_args(app, argv)` (called once at setup); `handle_second_invocation(app, argv, cwd)` (single-instance callback); `handle_opened_urls(app, urls)` (macOS file activations); `get_pending_files(app) -> Vec<String>` Tauri command (drains buffer, sets frontend_ready=true); helper `canonicalize_arg(cwd, arg) -> Option<PathBuf>` (relative-to-CWD resolution + symlink resolution; returns None for non-existent paths so caller can skip); helper `route_paths(app, paths)` (if frontend_ready, emit `markpad://open-files`; else push to buffer) AND helper `bring_to_front(app)` (unminimize + show + set_focus on the main window).
│   ├── Cargo.toml                    # UPDATE: add `tauri-plugin-single-instance = "2"` under [dependencies]. serde and serde_json are already present.
│   ├── tauri.conf.json               # UPDATE: add `bundle.fileAssociations: [{ ext: ["md", "markdown"], description: "Markdown document", name: "Markdown" }]` so Tauri's bundler generates the per-OS file-association registrations (Windows registry, macOS Info.plist CFBundleDocumentTypes, Linux .desktop MimeType).
│   └── capabilities/default.json     # UNCHANGED (custom commands are runtime-accessible by default in Tauri 2; no new fs scope is needed because the existing `fs:allow-read-text-file` + `fs:allow-write-text-file` are unscoped and cover the new `openMarkdownFileByPath` reads).
├── index.html                        # UNCHANGED
├── package.json                      # UNCHANGED
├── vite.config.ts                    # UNCHANGED
├── tsconfig.json                     # UNCHANGED
└── CLAUDE.md                         # UPDATE (the SPECKIT marker block — see Phase 1 step): repoint to `specs/007-file-association-single-instance/plan.md` so future AI-assisted work picks up this plan as the current one.
```

**Structure Decision**: Keep the existing single-project layout. The new Rust modules (`session.rs`, `launch_files.rs`) slot into `src-tauri/src/` next to `lib.rs`; the new TS chokepoints (`session.ts`, `launchFiles.ts`) slot into `src/lib/` next to `fileOpen.ts`. Naming follows the existing chokepoint convention — each file's name is the concern it owns. No new directories.

The chokepoint invariants are extended, not broken:
- **"Single importer of `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`, `@tauri-apps/api/webviewWindow`"** → still `fileOpen.ts`. The two new chokepoints (`session.ts`, `launchFiles.ts`) import `@tauri-apps/api/core` and `@tauri-apps/api/event` — different surfaces than the fs/dialog/window APIs `fileOpen.ts` owns. The chokepoint comment in `fileOpen.ts` is updated to cross-reference the two new chokepoints so grep-by-purpose still works.
- **"Single user of `localStorage`"** → still `preferences.ts`. Session persistence deliberately goes through Tauri commands rather than `localStorage` (see Complexity Tracking).
- **"Logic that can live in TypeScript SHOULD live in TypeScript"** (Constitution Architecture rules) → the Rust additions are the minimum: they do what only Rust can do (run before the webview, parse `std::env::args`, hold the single-instance mutex, receive `RunEvent::Opened`, write to OS-specific app-data dirs). Tab composition, dedup, activation, error mapping all stay in TS where Feature 006 left them.

## Complexity Tracking

| Violation / Note | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| New runtime dep: `tauri-plugin-single-instance = "2"` | FR-005 requires "at most one running instance per OS user session at any time" with cross-platform behavior. The plugin is the canonical solution in the official `tauri-apps/plugins-workspace` repo. It abstracts the platform-specific mutex (Windows named mutex, Unix domain socket, equivalent on macOS) and the IPC channel that delivers the second-invocation `argv` + `cwd` to the first instance's callback. It is small (~few hundred lines per platform), well-tested, and shipped by the same group that ships Tauri itself. | Rolling DIY single-instance: write a lock file in app-data, IPC via a Unix-domain socket / named pipe to deliver `argv`, handle stale-lock cleanup on crash (lock files outliving their owning process are a classic "trapped users can't launch the app" failure mode), test on three OSes. Materially more code AND more risk than depending on the maintained plugin. The dep's bus factor and licensing match Tauri itself (MIT/Apache). The constitution's "new runtime dep must be justified" rule is satisfied by the security/correctness argument above. |
| Session persistence handled by Rust (not by `localStorage` in TS) | (1) Keeps the existing `preferences.ts` chokepoint single-purpose ("the only user of localStorage in the app" — grep `localStorage` to verify; we don't want to dilute that). (2) Lets atomic-ish write (write-tmp + rename) and per-OS app-data-dir resolution live in one Rust function rather than juggle them in JS. (3) Avoids the per-platform localStorage location quirks of the webview runtime — Rust's `app.path()` is the canonical per-user app-data location. (4) Frees us from needing a new Tauri `fs` scope for the session file (which would otherwise expand the capability list). | localStorage: would split the persistence story (preferences in localStorage, session via Rust, why?); would need separate handling for the corruption case (a parse error in `localStorage.getItem` is a thrown exception we'd have to wrap); would put the persistence in the webview's per-origin storage which is harder to inspect, back up, or migrate. The two-chokepoint TS architecture is more honest about what each file owns. |
| Path canonicalization happens in Rust (not in TS) | Relative paths from CLI args MUST be resolved against the invoking shell's `cwd` (FR-010). On the Rust side, `cwd` is `std::env::current_dir()` at startup AND the single-instance plugin's callback receives the second invocation's `cwd` explicitly. Doing this in TS would require shipping the second invocation's cwd through the IPC layer separately — extra plumbing. Rust also has `Path::canonicalize` which resolves symlinks and verifies the file exists; the frontend would need an explicit "does this file exist" Tauri call to do the same. | Canonicalize-in-TS: needs to know the second invocation's cwd (not the running-process cwd, which is the first invocation's). The single-instance plugin gives us `cwd` for free in Rust; pushing it through to TS is more plumbing for no benefit. Doing the canonicalization on the Rust side also lets us drop unresolvable paths (non-existent) before the frontend even sees them, which is the cleanest implementation of FR-012's silent-skip rule. |
| Pending-files buffer + `frontend_ready` flag in Rust managed state | Cold-start race: the OS may dispatch an `Opened` URL (macOS) or the user may launch with CLI args BEFORE the webview has finished initializing and the frontend's event listener is wired. Without a buffer, those files would be silently lost (`emit` against an unmounted listener is a no-op). The buffer (`Mutex<Vec<PathBuf>>`) catches everything between process start and the first `get_pending_files()` call; the `AtomicBool` ensures we don't accidentally double-deliver (buffer drain + live event) for the same file. | Alternatives: (a) Emit unconditionally and hope the listener is up — loses files on cold start with macOS Opened URLs. (b) Have the frontend poll until ready — wasted work + non-deterministic timing. (c) Use Tauri's `webview_ready` lifecycle hook on the Rust side — works but couples session restore + launch-files into one wait point on the Rust side, where they're more naturally one frontend mount-time effect. The buffer is ~10 lines of Rust and removes the race entirely. |
| Three new Tauri commands rather than one combined "bootstrap" command | Each command has one job: `load_session` returns the saved record; `save_session` writes the supplied record; `get_pending_files` drains the buffer and marks the frontend ready. Combining them into a single "bootstrap" command would (a) couple two unrelated concerns (session vs launch files), (b) make `save_session` (called many times throughout the session) share a code path with a "this only fires once at mount" command, (c) make the contract harder to test. | A combined `bootstrap()` returning `{ session, pendingFiles }` saves one IPC round-trip at mount. Premature optimization for a path that runs at most once per launch. Splitting them keeps each contract one-line-describable, which makes the frontend chokepoints (`session.ts`, `launchFiles.ts`) each correspondingly tiny. |
| Switch from `.run(generate_context!())` shorthand to `.build(...)?.run(callback)` in `lib.rs` | `RunEvent::Opened { urls }` (the macOS file-activation event) is only delivered through the `run(closure)` form, where the closure receives `(AppHandle, RunEvent)`. The shorthand `.run(generate_context!())` doesn't expose run-events. Switching is mechanical and adds two lines. | Skipping the closure form and trying to handle macOS file activations another way (e.g., polling `argv` on a timer) does not work — macOS does NOT pass file paths via argv on second activation; it sends `NSApplicationOpenURLs` which Tauri surfaces only through `RunEvent::Opened`. There is no simpler alternative. |
| Removal of the `greet` Tauri command (template leftover) is NOT bundled here | The `greet` command in `lib.rs` is dead code from the Tauri starter template — it has no caller in the frontend and serves no purpose. Removing it is unrelated cleanup. Per Constitution Principle IV (Small, Reviewable Changes — "mixing unrelated changes in a single PR is prohibited"), it stays for a follow-up cleanup commit. Calling it out here so the tasks phase does not casually delete it. | Delete-in-passing: tempting but mixes scope. The follow-up cleanup is trivial (3 LOC) and lives better as its own PR with a "remove dead template code" title. |
| Quality gate setup (ESLint, Prettier, test runner, CI) STILL NOT done in this feature | Carried over from 002 / 003 / 004 / 006. Wiring up linters and CI is its own scope and decision-heavy (Vitest vs Playwright, where Prettier runs, CI provider choice, etc.). Bundling it into this feature would violate Principle IV. ESLint at least is now exercisable via `npm run lint` — adding a CI gate for that single command would be a small follow-up. | Doing it here would balloon the PR(s) that ship the actual user-facing features and entangle this work with framework choices that deserve their own spec. Tracked in the project's follow-up list. |
