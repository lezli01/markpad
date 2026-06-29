---

description: "Task list for Core Workspace Controls"
---

# Tasks: Core Workspace Controls

**Input**: Design documents from `/specs/003-core-ui-controls/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/components.md, quickstart.md

**Tests**: NOT included. Per `plan.md` (Technical Context / Complexity Tracking), no automated test suite is wired up in this repo yet, and standing one up is still out of scope (the gap is carried over from Feature 002). Manual acceptance is via `quickstart.md` (15 numbered steps mapped to FR/SC IDs).

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently against the spec.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Each task includes the exact file path it touches

## Path Conventions

Single-project Tauri + React layout (unchanged from Feature 002, per `plan.md` "Project Structure"):

- Frontend: `src/` (React + TypeScript, Vite)
- Backend: `src-tauri/` (Rust — this feature adds two plugin registrations; no project-owned Rust code)
- New UI components go under `src/components/`, pure helpers under `src/lib/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install the two new Tauri plugins on both the frontend and the Rust side, register them in the Tauri builder, and grant the minimum permissions in the capability manifest so the "Open file" path will actually work in Phase 3.

- [X] T001 [P] Install runtime dependencies in [package.json](package.json): `npm install @tauri-apps/plugin-dialog@^2 @tauri-apps/plugin-fs@^2`
- [X] T002 [P] Add the two Rust plugin crates under `[dependencies]` in [src-tauri/Cargo.toml](src-tauri/Cargo.toml): `tauri-plugin-dialog = "2"` and `tauri-plugin-fs = "2"` (alongside the existing `tauri-plugin-opener`)
- [X] T003 [P] Register both plugins inside `pub fn run()` in [src-tauri/src/lib.rs](src-tauri/src/lib.rs) — chain `.plugin(tauri_plugin_dialog::init())` and `.plugin(tauri_plugin_fs::init())` onto the existing `tauri::Builder::default().plugin(tauri_plugin_opener::init())` call, before `.invoke_handler(...)` (see `contracts/components.md` → "Tauri configuration changes")
- [X] T004 [P] Extend the `permissions` array in [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json) to add `"dialog:default"` and `"fs:allow-read-text-file"` (per `research.md` §4 — minimum scope, no blanket `fs:default`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the single chokepoint for preference reads and writes. US2 and US3 both consume it; centralizing it here keeps `localStorage` access out of every other module (per `contracts/components.md` → "lib/preferences.ts" and Principle VIII).

**⚠️ CRITICAL**: No user-story work depends on this for US1 (which does not persist anything), but US2 and US3 both call into it on their first task. Land this before starting either.

- [X] T005 Create [src/lib/preferences.ts](src/lib/preferences.ts) exporting `type Theme`, `type ViewMode`, and four synchronous functions: `getTheme()`, `setTheme(theme)`, `getViewMode()`, `setViewMode(mode)`. Each getter reads its `markpad.*` key from `localStorage` inside try/catch; if the value is missing or not in the whitelist, it falls back — `getTheme()` returns `window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"` (defaulting to `"light"` if `matchMedia` is unavailable); `getViewMode()` returns `"split"`. Each setter validates against a runtime whitelist (`["light", "dark"]` / `["editor", "preview", "split"]`) and writes to `localStorage` inside try/catch (write failures log `console.warn` but never throw). This module MUST be the ONLY place that touches `localStorage` (per `contracts/components.md`); future contributors can grep to verify.

**Checkpoint**: Foundation ready — `preferences.ts` is the only shared scaffolding US2 and US3 need.

---

## Phase 3: User Story 1 — Open an existing markdown file from disk (Priority: P1) 🎯 MVP

**Goal**: A user clicks an "Open" button in the workspace chrome, picks a markdown file in the native file dialog, and sees its content appear in the editor and rendered preview. The OS window title shows the filename. Errors (binary file, permission denied, file vanished) surface in a dismissible banner without clobbering the editor. Cancelling the dialog is a no-op.

**Independent Test**: With the Tauri app running, save `mvp-test.md` to disk with a small markdown sample. Click **Open**, pick the file, and confirm the editor + preview show its content and the window title becomes `mvp-test.md — markpad`. Cancel the dialog on a second click and confirm nothing changes. Pick a renamed PNG (binary with a `.md` extension) and confirm a dismissible error banner appears with the editor unchanged. (Maps to `quickstart.md` steps 1–6 and User Story 1 acceptance scenarios 1–5.)

### Implementation for User Story 1

- [X] T006 [P] [US1] Create [src/lib/fileOpen.ts](src/lib/fileOpen.ts) exporting `type OpenResult = { kind: "ok"; name; path; content } | { kind: "cancelled" } | { kind: "error"; message }`, an `async function openMarkdownFile(): Promise<OpenResult>`, and an `async function setWindowTitle(name: string | null): Promise<void>`. `openMarkdownFile()` calls `open(...)` from `@tauri-apps/plugin-dialog` with `{ multiple: false, directory: false, filters: [{ name: "Markdown", extensions: ["md", "markdown"] }, { name: "All Files", extensions: ["*"] }] }`, returns `{ kind: "cancelled" }` on `null`, then calls `readTextFile(path)` from `@tauri-apps/plugin-fs`, returning `{ kind: "ok", name: basename(path), path, content }` on success or `{ kind: "error", message }` on any thrown error (raw error logged via `console.warn`; user-facing message is one of a small set of plain-language strings — see `contracts/components.md` → "lib/fileOpen.ts"). `setWindowTitle(name)` calls `getCurrentWebviewWindow().setTitle(name ? `${name} — markpad` : "markpad")` from `@tauri-apps/api/window` inside try/catch. This module MUST be the ONLY place that imports `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`, or `@tauri-apps/api/window`.
- [X] T007 [P] [US1] Create [src/components/Toolbar.tsx](src/components/Toolbar.tsx) — a thin horizontal islands-styled bar that for US1 accepts only `{ onOpenFile: () => void }`. Render a single `<button>` with an inline-SVG folder/open icon and the visible label "Open". No icon library import — inline SVG only (per `research.md` §7 and `contracts/components.md` → "Toolbar"). US2 and US3 will extend the prop signature; do NOT add stubs for view-mode or theme controls in this task.
- [X] T008 [P] [US1] Create [src/components/ErrorBanner.tsx](src/components/ErrorBanner.tsx) accepting `{ message: string; onDismiss: () => void }`. Render a single horizontal islands-styled bar with a warning accent (e.g., amber) showing `message` and a `<button aria-label="Dismiss">` (close ✕) that calls `onDismiss()`. Use `role="status"` (not `role="alert"` — the user is not in danger). No auto-dismiss timer.
- [X] T009 [US1] Update [src/App.tsx](src/App.tsx) to own three new state fields: `openedFile: { name: string; path: string } | null`, `error: string | null`, and keep the existing `text` from Feature 002. Add a `handleOpenFile()` that calls `openMarkdownFile()` and on `kind: "ok"` sets `text`, `openedFile`, and clears `error`; on `kind: "error"` sets `error` (leaves `text` and `openedFile` unchanged); on `kind: "cancelled"` does nothing. Add a `useEffect` keyed on `openedFile?.name` that calls `setWindowTitle(openedFile?.name ?? null)`. Render, in order: `<Toolbar onOpenFile={handleOpenFile} />`, `{error !== null && <ErrorBanner message={error} onDismiss={() => setError(null)} />}`, `<Workspace text={text} onTextChange={setText} />`. Wrap them in a vertical `flex flex-col` so the toolbar and banner sit above the workspace. Depends on T006, T007, T008.

**Checkpoint**: User Story 1 is fully functional and independently shippable. Manual `quickstart.md` steps 1–6 pass. The editor still defaults to `starterContent` until the user opens a file; the window title is `markpad` until then.

---

## Phase 4: User Story 2 — Choose how the workspace is laid out (Priority: P2)

**Goal**: A segmented control in the toolbar lets the user switch the workspace between three view modes (Editor / Split / Preview). The editor's content, cursor, and undo stack are preserved across every switch. The chosen mode persists across app restarts.

**Independent Test**: With the app running, type something distinctive into the editor (e.g., `marker-XYZ`). Click each segment (Editor → Preview → Split) and confirm the layout changes accordingly and the text is preserved every time. Quit and relaunch the app and confirm it reopens in the last-selected mode. (Maps to `quickstart.md` steps 7–9 and User Story 2 acceptance scenarios 1–5.)

### Implementation for User Story 2

- [X] T010 [P] [US2] Update [src/components/Workspace.tsx](src/components/Workspace.tsx) to accept a new `viewMode: "editor" | "preview" | "split"` prop. The editor card MUST stay mounted in all three modes — apply the Tailwind `hidden` utility (i.e., `display: none`) when `viewMode === "preview"` so CodeMirror's selection, cursor, and undo history survive the switch (per `research.md` §3 and `contracts/components.md` → "Workspace"). The preview card MAY be conditionally rendered (`{viewMode !== "editor" && <section>...<Preview />...</section>}`) since Preview is pure and cheap to remount. When only one pane is visible, that pane fills the content area; the existing `flex-col md:flex-row` responsive stacking from Feature 002 only applies when `viewMode === "split"`. Pane labels ("Editor", "Preview") remain in place.
- [X] T011 [P] [US2] Update [src/components/Toolbar.tsx](src/components/Toolbar.tsx) to add a segmented control of three `<button>` elements ("Editor", "Split", "Preview"). The active button has `aria-pressed="true"` and a visible "selected" style (e.g., the islands surface tone darkened by one step); the inactive buttons have `aria-pressed="false"`. Extend the props to `{ onOpenFile; viewMode; onSetViewMode }`. Place the segmented control to the right of the Open button (per `research.md` §7).
- [X] T012 [US2] Update [src/App.tsx](src/App.tsx) to add `viewMode` state, initialised via `useState(() => preferences.getViewMode())`. Define `handleSetViewMode(mode)` that calls `setViewMode(mode)` and `preferences.setViewMode(mode)` (best-effort write per Foundational T005). Pass `viewMode` and `handleSetViewMode` into `<Toolbar>`. Pass `viewMode` into `<Workspace>` (which now consumes it per T010). Depends on T010, T011, and T005 from Phase 2.

**Checkpoint**: User Stories 1 AND 2 both work — `quickstart.md` steps 1–9 pass. Closing and reopening the app restores the last view mode (but the previously opened file is NOT restored — see `data-model.md` "Opened File Reference").

---

## Phase 5: User Story 3 — Switch between light and dark theme (Priority: P3)

**Goal**: A theme toggle in the toolbar flips the entire UI between light and dark variants — editor, preview, toolbar, banner, pane labels — with no element stuck in the previous palette. On first launch, the theme follows the OS appearance preference; thereafter, the user's explicit choice wins. The choice persists across restarts.

**Independent Test**: With the app running, note the current theme. Click the theme toggle in the toolbar. Confirm every visible surface flips to the opposite theme within ~500 ms. Close and reopen the app and confirm it opens in the chosen theme. Manually clear `localStorage["markpad.theme"]` (Tauri devtools → Application → Local Storage), set the OS to dark, relaunch, and confirm the app opens dark; repeat with OS = light. (Maps to `quickstart.md` steps 10–12 and User Story 3 acceptance scenarios 1–5.)

### Implementation for User Story 3

- [X] T013 [P] [US3] Update [src/styles.css](src/styles.css) to replace the `@media (prefers-color-scheme: dark) { :root { ... } }` block with a `:root[data-theme="dark"] { ... }` selector (the dark-palette CSS variable values inside are unchanged). The light-palette `:root { ... }` block stays as-is — it is the default when no `data-theme` is set or when `data-theme="light"`. This change is behaviorally identical to the existing media query UNTIL `<html data-theme>` is set by T014/T016 — at which point the user choice takes over (per `research.md` §2).
- [X] T014 [P] [US3] Update [index.html](index.html) to add a tiny inline bootstrap `<script>` in `<head>` (before the `<script type="module" src="/src/main.tsx">`) that reads `localStorage.getItem("markpad.theme")` inside try/catch, falls back to `window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"` (or `"light"` on failure), and writes `document.documentElement.dataset.theme = <value>`. Total ~15 lines. This prevents a flash of the wrong theme before React mounts (per `research.md` §2 and `contracts/components.md` → "index.html (UPDATED)"). The duplication with `lib/preferences.ts` is intentional — the script runs before any module can be imported.
- [X] T015 [P] [US3] Update [src/components/Toolbar.tsx](src/components/Toolbar.tsx) to add a theme-toggle `<button>` to the right of the segmented control. Inline-SVG icon: render a moon when `theme === "light"` (the button will switch to dark) and a sun when `theme === "dark"`. `aria-label` updates between `"Switch to dark theme"` and `"Switch to light theme"` to match. Extend the props to `{ onOpenFile; viewMode; onSetViewMode; theme; onToggleTheme }`.
- [X] T016 [US3] Update [src/App.tsx](src/App.tsx) to add `theme` state initialised via `useState(() => preferences.getTheme())`. Define `handleToggleTheme()` that flips `"light" ⇄ "dark"`, sets state, and calls `preferences.setTheme(next)`. Add a `useEffect` keyed on `theme` that writes `document.documentElement.dataset.theme = theme` (this overrides whatever the inline bootstrap set on first paint, in case the user toggles). Pass `theme` and `handleToggleTheme` into `<Toolbar>`. Depends on T013, T015, and T005 from Phase 2. (T014 is independent of the React code; it prevents the flash but the feature works without it.)

**Checkpoint**: All three user stories are independently functional. `quickstart.md` steps 1–12 pass. Theme + view mode persist across relaunches; the previously opened file does not.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Run the type-check gate, walk the manual acceptance script end-to-end, and structurally verify the encapsulation contracts (no module outside `lib/fileOpen.ts` reaches the Tauri plugins; no module outside `lib/preferences.ts` touches `localStorage`).

- [X] T017 Run `npm run build` from the repo root and confirm zero TypeScript errors and a reasonable production bundle size (Constitution Principle IX — `tsc` gate). Must complete before the manual walkthroughs in T018–T021 so any compile regressions surface here, not as runtime confusion.
- [ ] T018 Manually walk through [specs/003-core-ui-controls/quickstart.md](specs/003-core-ui-controls/quickstart.md) steps 1–6 (User Story 1 — Open file: toolbar visible, happy-path open, cancel, filter-to-all-files, binary-file error, recovery). Use the Tauri window (`npm run tauri dev`), not the web-only dev server — the file dialog and window title require the Tauri runtime.
- [ ] T019 [P] Manually walk through [specs/003-core-ui-controls/quickstart.md](specs/003-core-ui-controls/quickstart.md) steps 7–9 (User Story 2 — View modes: three-mode switching, content preservation across switches, narrow-window single-pane behavior)
- [ ] T020 [P] Manually walk through [specs/003-core-ui-controls/quickstart.md](specs/003-core-ui-controls/quickstart.md) steps 10–12 (User Story 3 — Theme: toggle, persistence across relaunch, first-launch system-preference fallback by deleting `localStorage["markpad.theme"]`)
- [ ] T021 [P] Manually walk through [specs/003-core-ui-controls/quickstart.md](specs/003-core-ui-controls/quickstart.md) steps 13–15 (cross-cutting: discoverability of all three controls within 30 s, sanitizer-still-holds regression with `<script>` and `javascript:` URLs inside an opened file, and the Feature 002 regression sweep of live preview + responsive layout + independent scrolling)
- [X] T022 [P] Encapsulation grep checks — verify (a) no module outside [src/lib/fileOpen.ts](src/lib/fileOpen.ts) imports `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`, or `@tauri-apps/api/window`, and (b) no module outside [src/lib/preferences.ts](src/lib/preferences.ts) references `localStorage`. The only legitimate exception for (b) is the inline bootstrap `<script>` in [index.html](index.html) (per `research.md` §2 — duplication is intentional). These are structural checks future contributors can re-run to confirm Principles VI (local-first) and VIII (contributor-friendly seams) are still in force.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. T001, T002, T003, T004 all touch different files and can land in any order, but the project will only build cleanly once all four are in: T001 makes the JS bindings importable; T002 + T003 together make the Rust plugins compile and register; T004 grants the runtime permission for the dialog and read calls to succeed.
- **Foundational (Phase 2)**: Independent of Phase 1 (does not touch Tauri plugins). Blocks US2 and US3, but NOT US1 (which never reads preferences).
- **User Story 1 (Phase 3)**: Depends on Phase 1 (needs the dialog + fs plugins). Does NOT depend on Phase 2.
- **User Story 2 (Phase 4)**: Depends on Phase 2 (preferences). Also depends on US1 because it modifies Toolbar.tsx, which US1 creates.
- **User Story 3 (Phase 5)**: Depends on Phase 2 (preferences). Also depends on US1 (modifies Toolbar.tsx) and is **independent** of US2 (touches a disjoint set of CSS + index.html + a different region of Toolbar.tsx and App.tsx).
- **Polish (Phase 6)**: T017 (`npm run build`) gates T018–T022. T022 (grep check) can run any time after the corresponding lib modules exist.

### User Story Dependencies

- **US1 (P1)**: Independent of US2 and US3. After Phase 1 lands, US1 can ship as the MVP on its own. Without US2/US3, the toolbar holds just the Open button — that is intentional and valid (the spec lists three controls but each story stands alone).
- **US2 (P2)**: Builds on US1's Toolbar.tsx and App.tsx files. Cannot start in true parallel with US1 because it edits files US1 creates. Pick it up immediately after US1's checkpoint.
- **US3 (P3)**: Same Toolbar.tsx / App.tsx dependency on US1. US2 and US3 modify disjoint regions of Toolbar.tsx and App.tsx (segmented control vs theme toggle; viewMode state vs theme state), so the two stories CAN proceed in parallel by different contributors after US1 lands, with a light merge at the Toolbar.tsx and App.tsx edits.

### Within Each User Story

- Helpers (`lib/`) and leaf components (`Toolbar`, `ErrorBanner`) before the App-level wiring task.
- No tests in this feature (deferred — see `plan.md` Complexity Tracking).
- Commit after each task or each logical group; stop at any checkpoint to validate the story independently.

---

## Parallel Opportunities

### Within Phase 1 (Setup)

T001, T002, T003, T004 all touch different files (`package.json`, `Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`) and can land in parallel:

```text
Task T001: npm install @tauri-apps/plugin-dialog @tauri-apps/plugin-fs
Task T002: Add tauri-plugin-dialog and tauri-plugin-fs to src-tauri/Cargo.toml
Task T003: Register both plugins in src-tauri/src/lib.rs
Task T004: Add dialog:default and fs:allow-read-text-file to src-tauri/capabilities/default.json
```

### Within Phase 3 (US1)

T006, T007, T008 all create brand-new files in different locations with no cross-dependencies:

```text
Task T006: Create src/lib/fileOpen.ts (openMarkdownFile + setWindowTitle)
Task T007: Create src/components/Toolbar.tsx (Open button only)
Task T008: Create src/components/ErrorBanner.tsx (dismissible message bar)
```

T009 (App.tsx wiring) depends on all three and must come last in US1.

### Within Phase 4 (US2)

T010 (Workspace.tsx) and T011 (Toolbar.tsx) touch different files — both [P]. T012 (App.tsx) depends on both.

### Within Phase 5 (US3)

T013 (styles.css), T014 (index.html), T015 (Toolbar.tsx) all touch different files — all [P]. T016 (App.tsx) depends on T013 and T015 (T014 is independent — it prevents flash but is not a code dependency).

### Across Phases 4 and 5 (after US1 lands)

US2 and US3 touch disjoint regions of Toolbar.tsx and App.tsx and otherwise touch entirely different files (Workspace.tsx for US2; styles.css + index.html for US3). A second contributor can pick up US3 as soon as US1's checkpoint passes.

### Within Phase 6 (Polish)

T018 (US1 manual), T019 (US2 manual), T020 (US3 manual), T021 (cross-cutting manual), and T022 (grep check) are independent of each other. T017 (`npm run build`) is the only one that gates the others — once it passes, the verifications can run in any order on the same running app instance.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: install the two Tauri plugins on both sides, register them, grant the minimum permissions.
2. Skip Phase 2 if shipping only US1 — preferences.ts is not needed yet. (Or land it anyway as cheap shared infrastructure; no harm.)
3. Complete Phase 3: ship `fileOpen.ts`, `Toolbar.tsx` (Open-only), `ErrorBanner.tsx`, and App.tsx wiring.
4. **STOP and VALIDATE**: walk `quickstart.md` steps 1–6. Confirm Open / Cancel / error-banner / window title all behave per spec.
5. This is shippable as an MVP — the feature's headline value ("turn the demo into a tool that opens real files") is met.

### Incremental Delivery

1. Setup + (optional) Foundational → US1 → demo/MVP.
2. Add Phase 2 (preferences) + US2 → independently re-verify view-mode switching and persistence (`quickstart.md` 7–9).
3. Add US3 → independently re-verify theme toggle, persistence, and first-launch system preference (`quickstart.md` 10–12).
4. Run Phase 6 polish: tsc gate, all four manual walkthroughs, and the encapsulation grep check. Then open the PR (or merge the third in a sequence of PRs if shipping incrementally per `plan.md` Constitution Check note on Principle IV).

### Parallel Team Strategy

After US1 (P1) merges and Phase 2 (preferences) is in place:

- Contributor A picks up US2 (Workspace responsive viewMode + Toolbar segmented control + App viewMode wiring).
- Contributor B picks up US3 (styles.css refactor + index.html bootstrap + Toolbar theme toggle + App theme wiring).

The two streams touch Toolbar.tsx and App.tsx in different regions and can land in either order with a small merge. All other files in the two streams are disjoint.

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks in the same phase.
- `[Story]` label maps each user-story task back to spec.md for traceability.
- No automated tests in this feature (manual acceptance only — see `plan.md` Complexity Tracking).
- Each user story should be independently mergeable; if review pressure is high, split US1, US2, US3 into three PRs along the checkpoints above (`plan.md` Constitution Check note on Principle IV).
- Avoid: vague task descriptions; two `[P]` tasks editing the same file; cross-story dependencies that break independence; reaching for `localStorage` or `@tauri-apps/plugin-*` from anywhere except the two designated `lib/` modules.
