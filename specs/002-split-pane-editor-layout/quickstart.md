# Quickstart — Split-Pane Editor Layout Foundation

Use this guide to verify the foundation locally during implementation and at review time. It assumes the implementation has been completed per `plan.md`, `data-model.md`, and `contracts/components.md`.

## Prerequisites

- Node.js (the version matching the repo's `.nvmrc` or otherwise the latest LTS) and npm.
- Rust toolchain (`rustup`) — required by Tauri's dev/build commands.
- Platform-specific Tauri prerequisites: see https://tauri.app/start/prerequisites/ if first-time setup.

## Install

```bash
npm install
```

If new dependencies have been added per `plan.md` (CodeMirror 6 packages, `markdown-it`, `dompurify`, `tailwindcss@^4`, `@tailwindcss/vite`), they will be installed by this command.

## Run in dev mode

Web-only (faster iteration on UI):

```bash
npm run dev
```

Then open `http://localhost:1420`.

Full Tauri dev (runs the actual desktop window):

```bash
npm run tauri dev
```

The first run compiles the Rust side and may take several minutes; subsequent runs are fast.

## Production build (smoke check)

```bash
npm run build           # type-checks via tsc, then builds the web bundle
npm run tauri build     # produces a platform-native bundle
```

`npm run build` must succeed with zero TypeScript errors before opening the PR (Constitution Principle IX).

## Manual acceptance walkthrough

These steps map directly to the "UI acceptance contract" in `contracts/components.md`. Run them in either the dev server or the Tauri window.

1. **Initial render** — Launch the app. Confirm:
   - No Tauri / Vite / React logos appear.
   - The window title is "markpad" (not "Tauri + React + Typescript").
   - Two rounded "island" panes are visible: Editor on the left, Preview on the right, each with a small label.
   - Starter markdown is in the Editor; the Preview shows it rendered with heading, bold, list, link, and inline code visible.

2. **Live preview (User Story 1, FR-002–FR-004)** — Click into the Editor. Type at the end:
   ```markdown
   ## Live update test
   - item **alpha**
   - item _beta_
   ```
   Confirm the Preview updates as you type, with no visible lag, and the new heading + list appear correctly.

3. **Empty state** — Select all (`Ctrl+A` / `Cmd+A`) in the Editor and delete. Confirm:
   - Preview shows a clearly empty hint (not a broken layout, not a crash).
   - Editor remains usable; you can start typing again and Preview comes back.

4. **Responsive layout (User Story 2, FR-006, FR-009, FR-010, SC-003, SC-005)** — Resize the application window:
   - At desktop widths (≥ 768 px), the two panes sit side by side and share space proportionally.
   - At narrow widths (< 768 px, e.g., 480 px), the panes stack vertically; both remain usable, neither is squeezed into invisibility.
   - Resizing repeatedly does not flicker, glitch, or leave the layout in an inconsistent state.

5. **Independent scrolling (FR-008)** — Paste a long markdown block (or repeat the starter content several times) so the Editor must scroll. Confirm the Editor and Preview each scroll independently and the surrounding islands chrome stays put.

6. **Sanitizer check (Constitution VII)** — In the Editor, type:
   ```markdown
   <script>alert('xss')</script>

   <img src="x" onerror="alert('xss')" />

   [click me](javascript:alert('xss'))
   ```
   Confirm:
   - No alert dialog appears.
   - The `<script>` tag does not execute (it should be stripped or rendered as inert text).
   - The malicious `onerror` attribute is removed.
   - The `javascript:` URL on the link is neutralized (the link is either inert or its href is sanitized).

7. **Color scheme (research.md §5)** — Toggle your OS color scheme between Light and Dark. Confirm the workspace palette flips automatically; both panes remain readable in either scheme.

If all seven steps pass, the foundation matches `spec.md` and is ready for review.

## What this foundation deliberately does NOT include

(Per `spec.md` Assumptions and `research.md` §7 — do not be alarmed if the following are missing.)

- No File menu, no open / save / autosave / export.
- No draggable divider between Editor and Preview.
- No toolbar, command palette, or settings.
- No in-app theme toggle (system preference only).
- No automated tests (deferred — see `plan.md` Complexity Tracking).
