---

description: "Task list for Split-Pane Editor Layout Foundation"
---

# Tasks: Split-Pane Editor Layout Foundation

**Input**: Design documents from `/specs/002-split-pane-editor-layout/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/components.md, quickstart.md

**Tests**: NOT included. Per `plan.md` (Technical Context / Complexity Tracking), no automated test suite is wired up in this repo yet, and standing one up is explicitly out of scope for this feature. Manual acceptance is via `quickstart.md`.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently against the spec.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Each task includes the exact file path it touches

## Path Conventions

Single-project Tauri + React layout (per `plan.md` "Project Structure"):

- Frontend: `src/` (React + TypeScript, Vite)
- Backend: `src-tauri/` (Rust — untouched in this feature aside from an optional window default tweak)
- New UI components go under `src/components/`, pure helpers under `src/lib/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies, wire Tailwind v4 into Vite, and clear the Tauri starter boilerplate so subsequent phases build on a clean canvas.

- [X] T001 Install runtime dependencies in [package.json](package.json): `npm install codemirror@^6 @codemirror/state@^6 @codemirror/view@^6 @codemirror/lang-markdown@^6 @codemirror/commands@^6 markdown-it@^14 dompurify@^3`
- [X] T002 Install dev dependencies in [package.json](package.json): `npm install -D tailwindcss@^4 @tailwindcss/vite@^4 @types/markdown-it @types/dompurify`
- [X] T003 Register the Tailwind v4 plugin in [vite.config.ts](vite.config.ts) — import `tailwindcss from "@tailwindcss/vite"` and add it to the `plugins` array alongside `react()`
- [X] T004 Create [src/styles.css](src/styles.css) containing `@import "tailwindcss";` plus CSS custom properties for the "islands" palette (background gradient stops, surface, ring, muted text) so CodeMirror's theme and component utilities share one source of truth (per `research.md` §3, §5)
- [X] T005 Update [src/main.tsx](src/main.tsx) to `import "./styles.css"` (replacing any existing CSS import indirectly pulled from `App.tsx`)
- [X] T006 [P] Delete [src/App.css](src/App.css) — its starter styles conflict with Tailwind's reset and are no longer referenced after T005
- [X] T007 [P] Update the `<title>` in [index.html](index.html) from `Tauri + React + Typescript` to `MILF`, and remove the `/vite.svg` favicon `<link>` so no Vite branding ships in the chrome
- [X] T008 [P] Prune unused Tauri starter logos: delete [src/assets/react.svg](src/assets/react.svg), [public/tauri.svg](public/tauri.svg), and [public/vite.svg](public/vite.svg)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Strip the default Tauri greeter so the App root is an empty canvas the user-story phases can build into.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [X] T009 Replace [src/App.tsx](src/App.tsx) with a minimal placeholder that removes the `useState<greetMsg>` / `useState<name>`, the `invoke("greet", ...)` call, the React/Tauri/Vite logos, and the greet form. The new body should render a single root `<div className="h-screen w-screen" />` (or equivalent) so the window is blank and ready for `<Workspace>` to land in US1.

**Checkpoint**: Foundation ready — user story phases can now proceed.

---

## Phase 3: User Story 1 — Write Markdown and See Live Preview (Priority: P1) 🎯 MVP

**Goal**: A two-pane workspace where the user types markdown in the left pane and a sanitized, formatted preview appears in the right pane and updates as they type.

**Independent Test**: Launch the app at a desktop window size (≥ 768 px). Type `# Hello` and `**bold**` in the left pane. Confirm the right pane shows a heading and bold text reflecting the input, and the empty editor produces an empty-but-tidy preview.

### Implementation for User Story 1

- [X] T010 [P] [US1] Create [src/lib/markdown.ts](src/lib/markdown.ts) exporting `renderMarkdown(source: string): string`. Use a module-scoped `markdown-it` instance configured with `{ html: false, linkify: true, typographer: true, breaks: false }`, render `source`, then pass the HTML through `DOMPurify.sanitize(...)` before returning. This module must be the ONLY place that imports `markdown-it` or `dompurify` (per `contracts/components.md` and Constitution VII).
- [X] T011 [P] [US1] Create [src/components/Editor.tsx](src/components/Editor.tsx) — a controlled `(value, onChange)` React component that mounts a CodeMirror 6 `EditorView` into a `useRef<HTMLDivElement>` on first render. Configure: `markdown()` language, `EditorView.lineWrapping`, history + default keymap from `@codemirror/commands`, and an "islands" `EditorView.theme(...)` referencing the CSS variables defined in [src/styles.css](src/styles.css). Subscribe to doc changes via `EditorView.updateListener` and call `onChange(view.state.doc.toString())` only when the doc actually changed. When the `value` prop changes from outside and differs from the editor doc, dispatch a transaction to replace the doc (guarded to avoid feedback loops). Tear down the `EditorView` on unmount.
- [X] T012 [P] [US1] Create [src/components/Preview.tsx](src/components/Preview.tsx) — accepts `{ markdown: string }`, computes `const html = useMemo(() => renderMarkdown(markdown), [markdown])`, renders `<div dangerouslySetInnerHTML={{ __html: html }} />` with hand-tuned typography utility classes (headings, lists, code, links). When `markdown === ""`, render a low-contrast hint (`"Preview will appear here."`) instead so the empty state is obviously empty rather than broken (FR-002 / Acceptance Scenario 4).
- [X] T013 [US1] Create [src/components/Workspace.tsx](src/components/Workspace.tsx) — accepts `{ text: string; onTextChange: (next: string) => void }`. Render a full-viewport (`h-screen w-screen`) container with the islands background gradient, holding two sibling card `<section>`s, each `rounded-2xl bg-white/80 dark:bg-slate-800/60 ring-1 ring-black/5 shadow-sm backdrop-blur` with a small `text-xs uppercase tracking-wide text-slate-500` label ("Editor" left, "Preview" right). Render `<Editor value={text} onChange={onTextChange} />` in the left card and `<Preview markdown={text} />` in the right card. Workspace MUST NOT import `markdown-it`/`dompurify`/`@codemirror/*` directly (per `contracts/components.md`). For this story the outer flex can be plain `flex flex-row gap-4 p-4` — responsive behavior is added in US2. Depends on T011, T012.
- [X] T014 [US1] Update [src/App.tsx](src/App.tsx) to own the single `Document.text` state: `const [text, setText] = useState("")`, then render `<Workspace text={text} onTextChange={setText} />`. Remove the placeholder root `<div>` left over from T009. Depends on T013.

**Checkpoint**: User Story 1 is fully functional and independently testable at desktop window sizes — manual quickstart steps 1, 2, and 3 should pass.

---

## Phase 4: User Story 2 — Adapt Layout to Window Size (Priority: P2)

**Goal**: The workspace remains usable from 480 px to 3840 px wide. Panes share horizontal space proportionally at desktop widths and stack vertically below ~768 px without clipping or overlap. Each pane scrolls independently when its content overflows.

**Independent Test**: With the app running, drag the window from wide (~1200 px) to narrow (~480 px) and back. Confirm the panes adjust proportionally above 768 px, stack vertically below it, and that resizing does not flicker or strand the layout in an inconsistent state. Paste a long markdown block and confirm Editor and Preview each scroll independently.

### Implementation for User Story 2

- [X] T015 [US2] Update [src/components/Workspace.tsx](src/components/Workspace.tsx) outer flex container to `flex flex-col md:flex-row gap-4 p-4 md:p-6` so the panes stack vertically below the Tailwind `md` (768 px) breakpoint and sit side-by-side at and above it (per `research.md` §4)
- [X] T016 [US2] Update [src/components/Workspace.tsx](src/components/Workspace.tsx) pane cards to `flex-1 min-w-0 min-h-0 overflow-hidden min-h-[200px]` so each card can shrink within a flex parent (the `min-*-0` reset is required for children that contain `overflow-auto` content), grows to fill available space, and stays at a usable height when stacked at narrow widths (FR-010)
- [X] T017 [P] [US2] Update [src/components/Preview.tsx](src/components/Preview.tsx) outer container to `h-full overflow-auto` so the preview pane scrolls independently of the editor (FR-008). CodeMirror's own `cm-scroller` already handles editor-side scrolling.

**Checkpoint**: User Stories 1 AND 2 both work — quickstart steps 4 and 5 should pass alongside 1–3.

---

## Phase 5: User Story 3 — Orient New Users with Starter Content (Priority: P3)

**Goal**: A first-time user sees sample markdown in the editor and its rendered equivalent in the preview at launch, communicating the editor↔preview relationship at a glance (SC-004).

**Independent Test**: Launch the app cold. Confirm the editor is non-empty and contains sample markdown demonstrating heading + bold/italic + list + link + inline code, the preview shows it rendered, and selecting-all + deleting clears both panes normally (Acceptance Scenarios 1 and 2 of US3).

### Implementation for User Story 3

- [X] T018 [US3] Create [src/lib/starterContent.ts](src/lib/starterContent.ts) exporting `export const starterContent: string` — a short multi-line markdown sample (under ~30 lines per `research.md` §6) that introduces MILF in one sentence and demonstrates a heading, bold, italic, an unordered list, a link, and an inline code span, ending with a friendly call-to-action like "Try editing this text — the preview updates as you type."
- [X] T019 [US3] Update [src/App.tsx](src/App.tsx) to `import { starterContent } from "./lib/starterContent"` and initialize state with it: `const [text, setText] = useState(starterContent)`. Depends on T018.

**Checkpoint**: All three user stories are independently functional. Quickstart step 1 ("starter markdown is in the Editor; the Preview shows it rendered…") now passes alongside everything from US1 and US2.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the constitution gates, confirm the manual acceptance walkthrough end-to-end, and tidy the desktop shell.

- [X] T020 [P] Tweak the default Tauri window in [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json) — set the main window `title` to `"MILF"` and a reasonable default size (e.g., `width: 1200`, `height: 800`) so first launch lands at a comfortable desktop size
- [X] T021 Run `npm run build` from the repo root and confirm zero TypeScript errors and a reasonable production bundle size (Constitution Principle IX — `tsc` gate)
- [X] T022 [P] Manually walk through [specs/002-split-pane-editor-layout/quickstart.md](specs/002-split-pane-editor-layout/quickstart.md) steps 1–5 (initial render, live preview, empty state, responsive resize from ~1200 px → ~480 px → back, independent scroll with a long pasted document)
- [X] T023 [P] Manually walk through [specs/002-split-pane-editor-layout/quickstart.md](specs/002-split-pane-editor-layout/quickstart.md) step 6 (sanitizer check): paste `<script>alert('xss')</script>`, `<img src="x" onerror="alert('xss')" />`, and `[click me](javascript:alert('xss'))` into the editor and confirm no alert fires, the script tag is inert, the `onerror` attribute is stripped, and the `javascript:` URL is neutralized — proves Constitution VII is enforced via [src/lib/markdown.ts](src/lib/markdown.ts)
- [X] T024 [P] Manually walk through [specs/002-split-pane-editor-layout/quickstart.md](specs/002-split-pane-editor-layout/quickstart.md) step 7 (color scheme): toggle the OS color scheme between Light and Dark and confirm both panes' palettes flip automatically without a reload
- [X] T025 [P] Grep the repo to confirm no module other than [src/lib/markdown.ts](src/lib/markdown.ts) imports `markdown-it` or `dompurify` — this is a structural check that Principle VII can't be bypassed by future contributors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T001/T002 must precede anything that imports the new packages; T003 must precede `npm run dev`/`npm run build` actually working with Tailwind; T004 must precede T005; T006–T008 are independent cleanup and may run any time after T005.
- **Foundational (Phase 2)**: Depends on Phase 1 completion. Blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Phase 2. T010, T011, T012 are independent (different files) and can run in parallel. T013 depends on T011 + T012. T014 depends on T013.
- **User Story 2 (Phase 4)**: Depends on US1 (it modifies Workspace.tsx and Preview.tsx, which US1 creates). T015 → T016 are sequential (same file). T017 is parallel to T015/T016 (different file).
- **User Story 3 (Phase 5)**: Depends on US1 (it modifies App.tsx, which US1 fills in). T018 → T019 are sequential because T019 imports the symbol T018 exports.
- **Polish (Phase 6)**: T020 is independent and can run any time after Phase 1; T021–T025 should run after US1–US3 are complete since they validate the assembled product.

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2. No story dependencies. Delivers the MVP on its own.
- **US2 (P2)**: Builds on US1's Workspace and Preview files. Cannot start in true parallel with US1 because it edits files US1 creates. May be picked up immediately after US1's checkpoint.
- **US3 (P3)**: Builds on US1's App.tsx. Same constraint as US2 — pick it up after US1 lands. US2 and US3 touch disjoint files (Workspace/Preview vs App + new lib file) and CAN proceed in parallel after US1.

### Within Each User Story

- Helpers (`lib/`) and leaf components (`Editor`, `Preview`) before containers (`Workspace`) before screens (`App`).
- No tests in this feature (deferred — see `plan.md` Complexity Tracking).
- Commit after each task or each logical group; stop at any checkpoint to validate the story independently.

---

## Parallel Opportunities

### Within Phase 1 (Setup)

T006, T007, T008 are independent file-deletions / one-line edits and can land together once T001–T005 have run.

### Within Phase 3 (US1)

T010, T011, T012 all create brand-new files in different directories with no cross-dependencies. Launch them together:

```text
Task T010: Create src/lib/markdown.ts (renderMarkdown + DOMPurify)
Task T011: Create src/components/Editor.tsx (CodeMirror 6 wrapper)
Task T012: Create src/components/Preview.tsx (sanitized HTML renderer)
```

### Within Phase 4 (US2)

T017 (Preview.tsx scroll wrapper) is in a different file from T015/T016 (Workspace.tsx) and can run in parallel with them.

### Across Phases 4 and 5 (after US1 lands)

US2 (Workspace.tsx + Preview.tsx) and US3 (starterContent.ts + App.tsx) touch disjoint files. A second contributor can pick up US3 the moment US1 is merged while another finishes US2.

### Within Phase 6 (Polish)

T020 (`tauri.conf.json`), T022 (quickstart 1–5), T023 (sanitizer check), T024 (color scheme), T025 (grep check) are independent of each other. T021 (`npm run build`) is the only one that gates the others — once it passes, run the verifications in parallel.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: install deps, wire Tailwind, prune Tauri starter assets.
2. Complete Phase 2: empty out `App.tsx`.
3. Complete Phase 3: ship Editor + Preview + Workspace + App wiring.
4. **STOP and VALIDATE**: at a desktop window size, confirm quickstart steps 1 (minus starter content), 2, and 3.
5. This is shippable as an MVP — the core promise ("write markdown, see preview") is met.

### Incremental Delivery

1. Setup + Foundational → Phase 3 (US1) → demo/MVP.
2. Add US2 → independently re-verify responsive behavior (quickstart 4, 5).
3. Add US3 → independently re-verify first-run starter content (quickstart 1 in full).
4. Run Phase 6 polish + manual acceptance walk-through, then open the PR.

### Parallel Team Strategy

After US1 (P1) merges:

- Contributor A picks up US2 (Workspace responsive + Preview scroll).
- Contributor B picks up US3 (starterContent.ts + App init).

The two streams touch disjoint files and can land in either order.

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks in the same phase.
- `[Story]` label maps each user-story task back to spec.md for traceability.
- No automated tests in this feature (manual acceptance only — see `plan.md` Complexity Tracking).
- Each user story should be independently mergeable; if review pressure is high, split US1, US2, US3 into three PRs along the checkpoints above (`plan.md` Constitution Check note on Principle IV).
- Avoid: vague task descriptions, two `[P]` tasks editing the same file, cross-story dependencies that break independence.
