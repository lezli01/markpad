# Quickstart — Core Workspace Controls

Use this guide to verify Feature 003 locally during implementation and at review time. It assumes Feature 002 (split-pane workspace) is already in place and the implementation of 003 has been completed per `plan.md`, `data-model.md`, and `contracts/components.md`.

## Prerequisites

- Node.js (the version matching the repo's `.nvmrc` or otherwise the latest LTS) and npm.
- Rust toolchain (`rustup`) — required by Tauri's dev/build commands.
- Platform-specific Tauri prerequisites: see https://tauri.app/start/prerequisites/ if first-time setup.

## Install

```bash
npm install
```

This installs the new frontend deps added by this feature:

- `@tauri-apps/plugin-dialog`
- `@tauri-apps/plugin-fs`

On the Rust side, `tauri-plugin-dialog` and `tauri-plugin-fs` are added to `src-tauri/Cargo.toml`; they are fetched the first time you run `npm run tauri dev`.

## Run in dev mode

Web-only (faster iteration on UI; note: file-open requires Tauri to run, so test that in the Tauri window):

```bash
npm run dev
```

Full Tauri dev (runs the actual desktop window — **required for file-open testing**):

```bash
npm run tauri dev
```

The first Rust compile may take several minutes because two new plugins are being built.

## Production build (smoke check)

```bash
npm run build           # type-checks via tsc, then builds the web bundle
npm run tauri build     # produces a platform-native bundle
```

`npm run build` must succeed with zero TypeScript errors before opening the PR (Constitution Principle IX).

## Pre-flight: prepare a fixture

Save a small file to your Desktop named `mvp-test.md` with this content:

```markdown
# Hello from disk

This is **bold**, this is _italic_, and here is a [link](https://example.com).

- item one
- item two
```

You will reference this file in step 2 below.

Also save a binary file with a misleading extension: copy any `.png` from your machine and rename it `not-text.md` somewhere accessible.

## Manual acceptance walkthrough

These steps map directly to the "UI acceptance contract" in `contracts/components.md`. Run them in the Tauri window (`npm run tauri dev`) so the file dialog and window title behave natively.

### User Story 1 — Open a markdown file from disk (P1)

1. **Toolbar visible** — Launch the app. Confirm a thin toolbar is visible above the workspace with three controls: Open, view-mode segmented control, theme toggle. The Open control is a clear button (icon + label or icon-only with `aria-label`).

2. **Happy path (FR-001–FR-004, FR-007, SC-001)** — Click **Open**. In the native dialog, navigate to your Desktop, observe that `mvp-test.md` is visible by default (filter is set to Markdown). Pick `mvp-test.md` and confirm:
   - The Editor's content is replaced by the file's text.
   - The Preview shows the rendered output (heading, bold, italic, list, link).
   - The OS window title now reads `mvp-test.md — markpad`.
   - The entire operation completes in well under 2 seconds.

3. **Cancel (FR-005, US1 Acceptance Scenario 2)** — Edit the editor a bit. Click **Open**. In the dialog, hit Cancel. Confirm the editor and preview are exactly as they were before the click; no error appears.

4. **Filter to all files (FR-002, US1 Acceptance Scenario 5)** — Click **Open**. In the dialog's filter dropdown, switch to "All Files". Confirm non-markdown text files become selectable.

5. **Error path — binary file (FR-006, FR-008–FR-009, edge cases)** — Click **Open**, broaden the filter to "All Files", pick the renamed `not-text.md` (the PNG). Confirm:
   - The editor's content is unchanged.
   - The window title is unchanged.
   - A dismissible error banner appears above the workspace explaining that the file could not be opened.
   - Clicking the banner's ✕ dismisses it.

6. **Recovery (US1 Acceptance Scenario 3)** — Click **Open** again, pick `mvp-test.md` normally. Confirm:
   - The editor + preview update with the file content.
   - Any previous error banner is cleared automatically (not just dismissed).
   - The window title updates to `mvp-test.md — markpad`.

### User Story 2 — Choose how the workspace is laid out (P2)

7. **Three modes (FR-008–FR-013, SC-003, US2 Acceptance Scenarios 1–3)** — In the toolbar's view-mode segmented control:
   - Click **Editor** — the preview pane disappears, the editor expands to fill the content area.
   - Click **Preview** — the editor pane disappears, the preview expands to fill the content area.
   - Click **Split** — both panes return to side-by-side (the original Feature 002 layout).
   - At every state, the active segment is visually highlighted and announced as `aria-pressed="true"` to assistive tech.
   - Each transition settles in well under 200 ms with at most one layout reflow.

8. **Content preservation (FR-012, US2 Acceptance Scenario 4, SC-004)** — Switch to **Editor**, type some unique text (e.g., `marker-${Date.now()}`). Switch through all three modes several times. Confirm:
   - The text remains exactly where you left it.
   - Your cursor position is preserved across switches into and out of editor-only mode (it may move when you switch back from preview-only, since the editor was hidden — but the text is intact).
   - The undo stack still works after switching modes (Ctrl/Cmd+Z reverses the typed text).

9. **Narrow window in single-pane modes (edge cases)** — Drag the window to a very narrow width (~400 px). In **Editor** mode, confirm the editor uses the full width and remains usable. Same in **Preview** mode. In **Split** mode at that width, the panes stack vertically as established in Feature 002.

### User Story 3 — Switch between light and dark theme (P3)

10. **Toggle (FR-014–FR-015, FR-017, SC-005, US3 Acceptance Scenarios 1–2, 5)** — Note the current theme. Click the theme toggle in the toolbar. Confirm:
    - The page background, the islands cards, the toolbar, the editor (CodeMirror) and the preview all switch to the opposite theme.
    - No element is stuck in the previous theme (toolbar icons, banner if visible, pane labels — everything flips).
    - The transition completes in under 500 ms.
    - The editor's content and the rendered preview content are unchanged.

11. **Persistence (FR-018–FR-019, SC-006, US2 AS5, US3 AS3)** — With theme = dark and viewMode = preview-only, close the application completely and reopen it. Confirm:
    - The app opens directly in dark theme and preview-only mode.
    - Starter content is back in the editor (the previously opened file is NOT restored — out of scope).
    - The OS window title is `markpad` (no file loaded).

12. **First-launch system preference (FR-016, US3 AS4)** — Quit the app. Manually delete `markpad.theme` from the app's local storage (via Tauri devtools: right-click → Inspect Element → Application → Local Storage → delete the `markpad.theme` key). Set your OS to dark mode. Relaunch the app and confirm it opens in dark theme. Repeat with OS in light mode and confirm it opens in light theme.

### Cross-cutting

13. **Discoverability (FR-021, SC-007)** — Imagine you have never seen markpad before. Without touching the keyboard, can you locate, in under 30 seconds, the controls to (a) open a file, (b) change the view mode, (c) change the theme? All three should be visible in the toolbar from the moment the app launches.

14. **Sanitizer still holds (Constitution VII; regression check)** — Open a markdown file that contains:
    ```markdown
    <script>alert('xss')</script>

    <img src="x" onerror="alert('xss')" />

    [click](javascript:alert('xss'))
    ```
    Confirm no alert appears and the malicious payloads are stripped, exactly as in Feature 002 step 6.

15. **Sanity: existing 002 behaviour intact** — Run steps 2–5 of `specs/002-split-pane-editor-layout/quickstart.md` (live preview, empty state, responsive layout, independent scrolling). All should still pass.

If all 15 steps pass, Feature 003 matches `spec.md` and is ready for review.

## What this feature deliberately does NOT include

(Per `spec.md` Assumptions and `research.md` §9 — do not be alarmed if the following are missing.)

- No Save / Save As / autosave / export. The app reads files but does not write them.
- No "Reload from disk" or external-change detection.
- No Recent Files menu, no "Restore last session", no persisted open-file path.
- No drag-and-drop file opening; no OS "Open with…" association.
- No tabs / multi-document editing.
- No continuous draggable split divider.
- No custom theme palettes (only binary light/dark).
- No keyboard-shortcut wiring (implementers MAY add `Ctrl/Cmd+O` and view shortcuts if free, but not required).
- No automated tests added by this feature; the quality gate setup follow-up from Feature 002 still applies.
