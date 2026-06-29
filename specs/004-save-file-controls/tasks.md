---

description: "Task list for Feature 004 — Save Controls and Active File Header"
---

# Tasks: Save Controls and Active File Header

**Input**: Design documents from `/specs/004-save-file-controls/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/components.md](contracts/components.md), [quickstart.md](quickstart.md)

**Tests**: Not requested by the spec. Acceptance is exercised manually via [quickstart.md](quickstart.md) (steps 1–25 map directly to FR/SC IDs). The pre-existing Principle IX gap (no test runner, no ESLint, no Prettier, no CI) is carried over from Features 002/003 and is explicitly out of scope here (see plan.md Complexity Tracking).

**Organization**: Tasks are grouped by user story so each story can be implemented, reviewed, and shipped as its own PR — matching plan.md's recommended decomposition (PR 1 = P1, PR 2 = P2, PR 3 = P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in the same phase)
- **[Story]**: User-story tag (US1, US2, US3) — present on user-story phase tasks only
- All paths are repository-relative; absolute paths begin at the repo root `C:/opswat/home/markpad/`

## Path Conventions

- **Frontend**: `src/` (React + TypeScript + Vite)
- **Rust / Tauri**: `src-tauri/`
- **Specs**: `specs/004-save-file-controls/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: One Tauri capability change so the webview is allowed to call `writeTextFile`. No npm/cargo dependencies are added.

- [X] T001 Add the `fs:allow-write-text-file` permission to `src-tauri/capabilities/default.json` immediately after the existing `fs:allow-read-text-file` entry. This is the narrowest available permission for save and must be present before any save call is reachable from the webview (per [research.md](research.md) §5 and [contracts/components.md](contracts/components.md#tauri-configuration-changes)).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the single chokepoint helper that every save path (manual and auto) will call. This phase MUST complete before any user-story phase begins.

**CRITICAL**: T002 blocks US1 (manual save) and US3 (auto-save). US2 (FileHeader) does not strictly require T002, but the recommended order is to land T001–T002 first so all three stories can be developed in parallel afterward.

- [X] T002 Extend `src/lib/fileOpen.ts` with the new save helper and update the module header comment so the chokepoint invariant still reads truthfully:
  1. Update the top-of-file comment from "dialog, fs, and window APIs" to "dialog, fs (read AND write), and window APIs" so a future contributor grepping for `@tauri-apps/plugin-fs` still understands why this is the only importing module.
  2. Add `writeTextFile` to the existing `@tauri-apps/plugin-fs` import.
  3. Add the exported discriminated union `export type SaveResult = { kind: "ok" } | { kind: "error"; message: string };` next to the existing `OpenResult` type.
  4. Add `export async function saveMarkdownFile(path: string, content: string): Promise<SaveResult>` that calls `writeTextFile(path, content)` inside a try/catch, returns `{ kind: "ok" }` on success, and returns `{ kind: "error", message: friendlyMessage(err) }` on failure (also `console.warn` the raw err for debugging).
  5. Soften the generic fallback in `friendlyMessage` so its wording works for both open and save failures (current text says "Could not open this file…"). Either split the helper into open-/save-specific generic fallbacks or change the unmatched-error branch to a context-agnostic message that is still correct for both. Permission-denied and not-found mappings stay as-is.

**Checkpoint**: `saveMarkdownFile` is reachable from `App.tsx`; the capability allows the actual write to land on disk. All three user stories can now proceed in parallel.

---

## Phase 3: User Story 1 - Save edits back to the opened file (Priority: P1) 🎯 MVP

**Goal**: A user who opened a file (per Feature 003) can press a clearly visible Save control and have the editor's current text written back to that same file. The Save control is unavailable when no file is open; save failures are surfaced through the existing error banner without losing the editor's content; concurrent triggers cannot corrupt the file on disk.

**Independent Test**: In `npm run tauri dev`, open `save-test.md` from the desktop, type "EDIT 1" into the editor, click the Save button, quit the app, then `cat save-test.md` (or open it in any other editor) — the change is on disk. Repeat with the file marked read-only to confirm the error banner appears, the editor's text is preserved, and the in-memory "modified" state is retained. Maps to spec FR-001 through FR-006, FR-018, and SC-001, SC-002, SC-005, SC-008. (FR-006's *visible* indicator is delivered prominently in US2 via FileHeader; in US1 alone the modified state is tracked internally and verifiable via React DevTools / by triggering a successful round-trip.)

### Implementation for User Story 1

- [X] T003 [P] [US1] Update `src/components/Toolbar.tsx` to expose a Save button and accept the new props in the existing toolbar layout:
  1. Extend `ToolbarProps` with `saveEnabled: boolean`, `saving: boolean`, and `onSave: () => void` (per [contracts/components.md](contracts/components.md#toolbar--updated-from-feature-003)).
  2. Add a small inline `SaveIcon` SVG component next to the existing `FolderOpenIcon`/`MoonIcon`/`SunIcon` definitions (a floppy / disk glyph following the same stroke conventions — `viewBox="0 0 24 24"`, `strokeWidth="1.75"`).
  3. Render a Save `<button type="button">` as the **first** control in the toolbar (left of Open), using `buttonBase` for styling, `<SaveIcon />` + `<span>Save</span>` as content, and `disabled={!saveEnabled}` plus `aria-disabled={!saveEnabled}` and `aria-busy={saving}`. Reuse the existing disabled-styling convention (the codebase currently does not have a dedicated "disabled" Tailwind chain — add `aria-disabled` and rely on the native `disabled` attribute to give the browser-default greyed-out appearance; if visual disabled cue is too subtle, append `disabled:opacity-50 disabled:cursor-not-allowed` to `buttonBase`).
  4. Wire `onClick={onSave}` on the Save button.
  5. Do NOT touch the auto-save checkbox in this task — that lands in US3 (T008).

- [X] T004 [P] [US1] Update `src/App.tsx` to track the saved snapshot and drive the Save flow:
  1. Add state: `const [savedText, setSavedText] = useState(starterContent);` and `const [saving, setSaving] = useState(false);` next to the existing `text` / `openedFile` / `error` state declarations.
  2. Add a ref: `const pendingSaveRef = useRef(false);` (import `useRef` from React).
  3. Add the import for `saveMarkdownFile` from `./lib/fileOpen` next to the existing `openMarkdownFile, setWindowTitle` import.
  4. Add an async helper `performSave()` (declared inside the component) that implements [research.md](research.md) §3:
     - If `openedFile === null` → return immediately (defensive).
     - If `saving === true` → set `pendingSaveRef.current = true` and return.
     - Otherwise, set `saving = true`, snapshot `const outbound = text`, `await saveMarkdownFile(openedFile.path, outbound)`.
     - On `{ kind: "ok" }`: `setSavedText(outbound)`, `setError(null)`, `setSaving(false)`. If `pendingSaveRef.current` is true, clear it and schedule another `performSave()` via `queueMicrotask` (or `setTimeout(performSave, 0)`).
     - On `{ kind: "error", message }`: `setError(message)`, `setSaving(false)`. Clear `pendingSaveRef.current` so a failed save does not trigger a retry loop.
  5. Add `function handleSave() { void performSave(); }` so the prop signature passed to Toolbar is `() => void` rather than `Promise<void>`.
  6. Update the existing `handleOpenFile` so its success branch also calls `setSavedText(result.content)` immediately after `setText(result.content)` — a freshly opened file is in sync with disk and must read as unmodified.
  7. Compute the two derived values inline in the render body (above the `return`): `const isModified = text !== savedText;` and `const saveEnabled = openedFile !== null && !saving;`. Both are passed down as props; neither is stored.
  8. Pass `saveEnabled={saveEnabled}`, `saving={saving}`, `onSave={handleSave}` into `<Toolbar />` alongside its existing props.
  9. Do NOT add `autoSave` state, `AUTO_SAVE_DEBOUNCE_MS`, or the auto-save effect in this task — those land in US3 (T009).
  10. Do NOT add the `<FileHeader />` render in this task — that lands in US2 (T006).

**Checkpoint**: User Story 1 ships independently. Manual Save writes to disk; concurrent triggers coalesce (FR-018); save failures surface via the existing `<ErrorBanner />` without losing the editor's text (FR-004). FR-006 *tracking* is in place; the *prominent visible indicator* arrives with US2.

---

## Phase 4: User Story 2 - Always see which file you are editing at the top (Priority: P2)

**Goal**: A new `<FileHeader />` sits at the very top of the workspace, above the toolbar. It shows the open file's basename (or `Untitled`), prefixes a screen-reader-announced `*` when the document has unsaved changes, and exposes the full absolute path via a native browser tooltip on hover.

**Independent Test**: Launch the app — header reads `Untitled` and hovering shows `No file open`. Open `save-test.md` — header reads `save-test.md`; hovering shows the full path. Type a change — header reads `* save-test.md`. Save — asterisk clears. Switch between Editor / Split / Preview view modes — the header stays visible at the top in all three modes. Toggle between light and dark themes — the header re-skins along with the rest of the chrome. Maps to spec FR-007 through FR-011 and SC-003, SC-007.

### Implementation for User Story 2

- [X] T005 [P] [US2] Create `src/components/FileHeader.tsx` as a pure presentational component (per [contracts/components.md](contracts/components.md#fileheader--new)):
  1. Define `type FileHeaderProps = { fileName: string | null; fullPath: string | null; isModified: boolean };` and `export default function FileHeader(props: FileHeaderProps)`.
  2. Render a `<header>` element with `role="status"` and `aria-live="polite"` so screen readers announce file-name changes without interrupting.
  3. Style the header with the same islands-surface utility chain `<Toolbar />` uses (`rounded-2xl bg-[color:var(--islands-surface)] ring-1 ring-[color:var(--islands-ring)] shadow-sm backdrop-blur px-3 py-2`) so theme switching automatically re-skins it. Inside, use a flex row with `items-center gap-2 min-w-0` so truncation works.
  4. When `fileName === null`: render a single `<span>` showing `Untitled` with `title="No file open"`. No asterisk.
  5. When `fileName !== null`: render the name in a `<span class="truncate" title={fullPath ?? fileName}>` (Tailwind's `truncate` expands to `overflow-hidden text-ellipsis whitespace-nowrap`). If `isModified` is true, prefix it with `<span aria-label="modified">* </span>` so screen readers announce "modified" instead of spelling the asterisk character.
  6. Hold no state, call no `lib/*` modules, import no Tauri APIs — this is presentation only.
  7. Stay under the Constitution's ~150-line component ceiling (the component itself is ~30–50 lines).

- [X] T006 [US2] Update `src/App.tsx` to render the new header above the toolbar:
  1. Import `FileHeader` from `./components/FileHeader`.
  2. Inside the returned `<div className={appShell}>`, render `<FileHeader fileName={openedFile?.name ?? null} fullPath={openedFile?.path ?? null} isModified={isModified} />` as the **first** child, immediately before `<Toolbar />`. This places the header above the toolbar and outside `<Workspace />` so it remains visible in every view mode ([research.md](research.md) §6 and [contracts/components.md](contracts/components.md#app--updated-from-feature-003)).
  3. Confirm `isModified` is already in scope from T004 (computed inline in the render body). If T004 has not landed yet, derive it locally here using the existing `text` and (US2-only intermediate scenario) `starterContent` — but the recommended order is to land US1 first so `savedText` exists.
  4. Do not change `setWindowTitle` — the contracts call it unchanged ([contracts/components.md](contracts/components.md#app--updated-from-feature-003)). The header is the new in-app indicator; the OS window title behaviour stays as Feature 003 left it.

**Checkpoint**: User Story 2 ships independently. The active-file header is visible above the toolbar in every view mode and across themes; FR-007 through FR-011 all pass; the FR-006 visible indicator is now prominent (asterisk in the header).

---

## Phase 5: User Story 3 - Turn on auto-save and have that choice remembered (Priority: P3)

**Goal**: A user can tick an Auto-save checkbox next to the Save button; while ticked and a file is open, the editor's text is written back to disk after a ~1.5 second idle debounce. The preference is persisted under `markpad.autoSave` in `localStorage` and restored on next launch. Failure to read the preference falls back to OFF without crashing.

**Independent Test**: Open `auto-save-test.md`, tick Auto-save, type "auto-saved line 1", stop typing. Within ~1.5 s the asterisk in the header clears and `cat auto-save-test.md` shows the new content. Type a burst of several sentences without pausing — only one write happens after the burst (no per-keystroke churn). Quit the app and relaunch — the checkbox is still ticked. Toggle Auto-save off mid-edit — pending debounced saves cancel. Maps to spec FR-012 through FR-020 and SC-004, SC-005, SC-006.

### Implementation for User Story 3

- [X] T007 [P] [US3] Extend `src/lib/preferences.ts` with the new `autoSave` preference, following the existing pattern used for `theme` and `viewMode` (per [research.md](research.md) §4 and [contracts/components.md](contracts/components.md#libpreferencests-updated-from-feature-003)):
  1. Add module-level constants below the existing ones: `const AUTO_SAVE_KEY = "markpad.autoSave";` and `const ALLOWED_AUTO_SAVE = ["on", "off"] as const;`.
  2. Export `function getAutoSave(): boolean` that wraps `window.localStorage.getItem(AUTO_SAVE_KEY)` in try/catch: returns `true` if the stored value is exactly `"on"`, `false` if it is exactly `"off"`, and `false` for any other value (`null`, unknown, malformed) or if `localStorage` throws. This is the FR-019 / FR-020 default-OFF behaviour.
  3. Export `function setAutoSave(on: boolean): void` that wraps `window.localStorage.setItem(AUTO_SAVE_KEY, on ? "on" : "off")` in try/catch, logging a `console.warn` on failure but not throwing. Same best-effort pattern as `setTheme` / `setViewMode`.
  4. Do NOT modify the existing `getTheme`, `setTheme`, `getViewMode`, or `setViewMode` functions or their constants.

- [X] T008 [P] [US3] Update `src/components/Toolbar.tsx` to render the auto-save checkbox alongside the Save button:
  1. Extend `ToolbarProps` with `autoSave: boolean` and `onToggleAutoSave: (next: boolean) => void` (per [contracts/components.md](contracts/components.md#toolbar--updated-from-feature-003)).
  2. Render a `<label>` immediately to the right of the Save button (after the `<button>Save</button>` from T003, before the `<button>Open</button>`). The label wraps `<input type="checkbox" checked={autoSave} onChange={(e) => onToggleAutoSave(e.target.checked)} />` followed by a visible `<span>Auto-save</span>`. Style the label with the toolbar's existing palette via `flex items-center gap-2 text-sm font-medium text-[color:var(--islands-text)] cursor-pointer select-none` plus a small horizontal padding to match the buttons.
  3. The checkbox uses the existing `--islands-cursor` accent via Tailwind's `accent-[color:var(--islands-cursor)]` so it visually fits the theme.
  4. The checkbox is **always enabled**, even when `saveEnabled` is false — per FR-014, the toggle remains visible and settable when no file is open so its setting is retained for the next time a file is opened.
  5. No `aria-label` on the input is needed because the wrapping `<label>` provides the accessible name.

- [X] T009 [US3] Update `src/App.tsx` to own auto-save state and the debounce effect:
  1. Add the import for `getAutoSave, setAutoSave as persistAutoSave` from `./lib/preferences` (folded into the existing `preferences` import alongside `getTheme`, `getViewMode`, etc.).
  2. Add a module-local constant near the top of the file: `const AUTO_SAVE_DEBOUNCE_MS = 1500;` (chosen as the midpoint of the spec's 1–3 s allowance and well inside SC-004's 5 s budget — per [research.md](research.md) §2).
  3. Add state: `const [autoSave, setAutoSaveState] = useState<boolean>(() => getAutoSave());` (lazy initialiser, mirroring the existing `theme` / `viewMode` pattern).
  4. Add handler: `function handleToggleAutoSave(next: boolean) { setAutoSaveState(next); persistAutoSave(next); }` next to the existing `handleToggleTheme` and `handleSetViewMode`.
  5. Add the auto-save `useEffect` keyed on `[text, savedText, autoSave, openedFile, saving]`:
     ```ts
     useEffect(() => {
       if (!autoSave) return;
       if (openedFile === null) return;
       if (text === savedText) return;
       if (saving) return;
       const id = setTimeout(() => { void performSave(); }, AUTO_SAVE_DEBOUNCE_MS);
       return () => clearTimeout(id);
     }, [text, savedText, autoSave, openedFile, saving]);
     ```
     Place it after the existing `setWindowTitle` and `data-theme` effects.
  6. Pass `autoSave={autoSave}` and `onToggleAutoSave={handleToggleAutoSave}` into `<Toolbar />` alongside the props from T004.
  7. Do not touch `performSave` from T004 — auto-save reuses it unchanged; coalescing of "manual Save during in-flight auto-save" is already handled by `pendingSaveRef`.

**Checkpoint**: All three user stories are now functional. Auto-save fires on idle, coalesces with manual save (FR-018), persists across launches (FR-019), falls back safely on corrupted preference (FR-020), and stops immediately when toggled off (FR-017). Quickstart steps 13–21 should all pass.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the gates the Constitution requires (Principle IX type-check), exercise the manual acceptance walkthrough, and re-confirm the chokepoint invariants the contracts depend on. None of these tasks add behaviour — they are quality gates.

- [X] T010 Run `npm run build` from the repo root. Must complete with zero TypeScript errors. This satisfies the only Quality Gate currently wired up in CI-able form (Constitution Principle IX — see plan.md Complexity Tracking row "Quality gate setup"). Any `tsc` complaint about unused imports, prop-type mismatches between `<App />` and `<Toolbar />`, or missing `useRef` import is a real bug to fix before this task closes.
- [ ] T011 Execute the manual acceptance walkthrough end-to-end: open the app via `npm run tauri dev` and step through all 25 steps in `specs/004-save-file-controls/quickstart.md`. Record any deviation against the relevant FR/SC ID in a scratch note for the PR description. Pay particular attention to step 21 (concurrent Save during in-flight auto-save — the SC-005 hot spot) and step 24 (sanitizer regression after save round-trip — the Principle VII check).
- [X] T012 Verify single-chokepoint invariants by grep, per [contracts/components.md](contracts/components.md) Conventions:
  - `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`, and `@tauri-apps/api/webviewWindow` must appear **only** in `src/lib/fileOpen.ts`.
  - `localStorage` must appear **only** in `src/lib/preferences.ts` (the bootstrap script in `index.html` is the documented exception — it reads `markpad.theme` for the no-flash-of-wrong-theme effect, but it MUST NOT read `markpad.autoSave` because auto-save has no first-paint impact).
  Use `Grep` for `@tauri-apps/plugin-fs|@tauri-apps/plugin-dialog|@tauri-apps/api/webviewWindow` across `src/`, and a separate grep for `localStorage` across `src/` and `index.html`. Any extra match is a chokepoint violation to fix.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** — T001 has no dependencies; can start immediately.
- **Foundational (Phase 2)** — T002 depends on T001 (the new capability must be in place before the save call is exercised at runtime; the TypeScript change in fileOpen.ts can be written ahead of T001, but the manual test step in T002 requires T001 to have landed).
- **User Stories (Phases 3–5)** — All three depend on Phase 2 completion. US1 (T003, T004) and US3 (T007, T008, T009) require `saveMarkdownFile` from T002. US2 (T005, T006) does not strictly require T002 but is grouped with the others for ordering clarity.
- **Polish (Phase 6)** — T010 / T011 / T012 run after all user-story phases that are in scope for the current PR.

### User Story Dependencies

- **US1 (P1)** — Depends only on Phase 2. The MVP. Ships alone if needed.
- **US2 (P2)** — Depends only on Phase 2. Can ship before US1 in principle (it does not need `performSave`), but the natural order is US1 first so `isModified` already exists in `App.tsx` when `<FileHeader />` is wired up.
- **US3 (P3)** — Depends on Phase 2 AND on T004 (the `performSave` defined in `App.tsx` is what the auto-save effect calls). US3 can be developed in parallel with US1's T004 only if T009 stubs the auto-save effect to call a placeholder until T004 lands; the cleanest order is US1 first, then US3.

### Within Each User Story

- US1: T003 (Toolbar) and T004 (App.tsx) touch different files and can be implemented in parallel. They must land together (or in either order) for type-check to pass — T004 supplies props that T003 consumes.
- US2: T005 (new file) can run in parallel with anything except T006. T006 imports `FileHeader` from T005 and so requires T005 to exist first.
- US3: T007 (preferences) and T008 (Toolbar) are different files and independent — both [P]. T009 (App.tsx) imports from T007 and supplies the props T008 consumes, so it lands after both.

### Parallel Opportunities

- Within Phase 3: T003 and T004 can run in parallel (different files).
- Within Phase 5: T007 and T008 can run in parallel (different files). T009 sequentialises after them.
- Across phases with parallel staffing: once T002 lands, US1 (T003 + T004), US2 (T005 + T006), and US3 (T007 + T008 + T009) can be three concurrent work streams. The only cross-stream coupling is US3's T009 importing `performSave` from US1's T004 — schedule US1 slightly ahead of US3 to avoid a stub.

---

## Parallel Example: User Story 1

```text
# Once Phase 2 is complete, the two US1 tasks touch different files and can
# be developed in parallel:
Task T003 [P] [US1]: Update src/components/Toolbar.tsx — add Save button + SaveIcon + saveEnabled/saving/onSave props
Task T004 [P] [US1]: Update src/App.tsx — add savedText/saving state + pendingSaveRef + performSave + handleSave + update handleOpenFile + derive isModified/saveEnabled + pass props to Toolbar
```

## Parallel Example: User Story 3

```text
# Two of the three US3 tasks are in different files with no inter-dependency.
# T007 and T008 can run in parallel; T009 follows.
Task T007 [P] [US3]: Extend src/lib/preferences.ts — add getAutoSave / setAutoSave + AUTO_SAVE_KEY + whitelist
Task T008 [P] [US3]: Update src/components/Toolbar.tsx — add Auto-save <label><input type=checkbox> with autoSave + onToggleAutoSave props
# After both land:
Task T009 [US3]: Update src/App.tsx — add autoSave state + handleToggleAutoSave + AUTO_SAVE_DEBOUNCE_MS constant + auto-save useEffect; pass autoSave/onToggleAutoSave to Toolbar
```

---

## Implementation Strategy

### MVP First (User Story 1 Only — PR 1)

1. Complete Phase 1 (T001 — capability).
2. Complete Phase 2 (T002 — `saveMarkdownFile` + header-comment update).
3. Complete Phase 3 (T003 + T004 — Save button + App.tsx state and flow).
4. Run Phase 6 (T010 type-check + T011 partial quickstart: steps 1–8 + 25 + T012 chokepoint grep).
5. Open PR 1: "Save edits back to opened file". Reviewable in a single sitting (~3 edited files, no new deps).

### Incremental Delivery (Recommended — Three PRs)

1. **PR 1 (US1, P1)**: Phase 1 + Phase 2 + Phase 3 + relevant Phase 6 steps. Ships the Save button and the save flow.
2. **PR 2 (US2, P2)**: Phase 4 (T005 + T006) + Phase 6 (T010 type-check; quickstart steps 9–12). Adds the prominent in-app modified indicator. The FR-006 visible-indicator requirement is now fully satisfied.
3. **PR 3 (US3, P3)**: Phase 5 (T007 + T008 + T009) + Phase 6 (full quickstart sweep, especially step 21 concurrency, step 23 corrupt-pref fallback). Adds auto-save.

Each PR is independently testable and independently shippable. Reviewer fatigue stays low; the bisect surface for any regression stays small.

### Single PR (Acceptable for Solo Work)

If the feature is shipped as one PR, the total diff is still small (~3 edited files, 1 new file, 1 new capability entry, 0 new deps — plan.md Constitution Check). Run Phase 6 end-to-end (T010 + full T011 walkthrough + T012) before opening the PR.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in the same phase.
- [Story] label maps tasks to user stories for traceability; setup, foundational, and polish tasks have no story label.
- No automated tests are written by this feature — acceptance is the manual quickstart walkthrough plus `npm run build` for type-check. The pre-existing Principle IX gap (no test runner, no ESLint, no Prettier, no CI) is acknowledged and explicitly out of scope.
- Commit cadence: prefer one commit per task (each task is small enough). T004 and T009 are the largest tasks; they may justify two or three commits each (state additions, then handler additions, then effect / prop wiring).
- Do not introduce: a separate `isModified` boolean state field, a save queue, atomic-write-via-temp, a "Save As" path, a recent-files list, or a save-on-blur handler. All are explicitly out of scope ([research.md](research.md) §10 and [data-model.md](data-model.md#non-entities-explicit)).
- The `lib/fileOpen.ts` name stays — it now covers both open and save, and the header comment is updated to say so. Renaming to `fileIo.ts` is deferred churn ([plan.md](plan.md) Project Structure note).
