# Phase 1 — Component Contracts

markpad's primary external interface is its UI. There is no public library API, no HTTP endpoint, and no custom Tauri command in this feature. The contracts below define the React component boundaries so the tasks phase has unambiguous "shapes" to implement against.

## Conventions

- All components are function components in TypeScript with explicit prop types.
- Each component lives in its own file under `src/components/` and stays under the Constitution's ~150-line ceiling.
- No component holds non-trivial business logic; helpers live in `src/lib/`.

---

## `<App />`

**File**: `src/App.tsx`
**Owns**: the single `Document.text` state.

**Props**: none.

**Behavior**:
- On mount, initializes `text` to the value exported by `src/lib/starterContent.ts`.
- Renders exactly one `<Workspace>` and passes `text` / `onTextChange` through.
- No conditional rendering, no routing — this is the only screen in the foundation.

**Contract assertions**:
- The DOM tree contains exactly one Editor and exactly one Preview.
- `App` does NOT import `markdown-it` or `DOMPurify` directly; rendering belongs in `Preview` via the `lib/markdown.ts` helper.

---

## `<Workspace />`

**File**: `src/components/Workspace.tsx`
**Role**: Layout shell — places Editor and Preview as two "islands" inside the application window.

**Props**:

```ts
type WorkspaceProps = {
  text: string;
  onTextChange: (next: string) => void;
};
```

**Behavior**:
- Renders a full-viewport container (`h-screen w-screen`) with the islands background (see `research.md` §5).
- Lays out two child cards using Tailwind flex utilities: `flex-col md:flex-row gap-4 p-4 md:p-6`.
- Each child card is a rounded, soft-shadow container holding a small pane label and either the Editor or the Preview.
- Editor card and Preview card are siblings with `flex-1 min-w-0 min-h-0 overflow-hidden`; internal scrollers live in the Editor and Preview themselves.

**Contract assertions**:
- Workspace does NOT read or parse markdown; it only forwards `text` to Preview and passes `onTextChange` to Editor.
- Workspace handles no resize events in JS — all responsiveness is CSS.
- At a viewport width below 768 px, the panes stack vertically (verified via the Tailwind `md:` responsive variant).

---

## `<Editor />`

**File**: `src/components/Editor.tsx`
**Role**: Controlled markdown text input powered by CodeMirror 6.

**Props**:

```ts
type EditorProps = {
  value: string;
  onChange: (next: string) => void;
};
```

**Behavior**:
- Mounts a CodeMirror 6 `EditorView` on first render into a `useRef<HTMLDivElement>`.
- Configures: markdown language, line wrapping, basic keymap and history, an "islands" theme that uses the palette defined in `styles.css`.
- Listens for document changes via `EditorView.updateListener` and calls `onChange(view.state.doc.toString())` when the doc has actually changed.
- If `value` prop changes from outside and differs from the current editor doc, replaces the editor doc with the new value (guarded to avoid feedback loops with the listener).
- Tears down the `EditorView` on unmount.

**Contract assertions**:
- Editor does NOT render Preview or parse markdown; it only emits text.
- Editor has no side effects beyond mounting/unmounting CodeMirror and calling `onChange`.
- The editor's internal scroller is independent (FR-008).

---

## `<Preview />`

**File**: `src/components/Preview.tsx`
**Role**: Render sanitized HTML from markdown source.

**Props**:

```ts
type PreviewProps = {
  markdown: string;
};
```

**Behavior**:
- Computes `html = renderMarkdown(markdown)` from `src/lib/markdown.ts` (memoized on `markdown` via `useMemo`).
- Renders `<div className="prose-like-classes" dangerouslySetInnerHTML={{ __html: html }} />`.
- When `markdown` is empty, renders a low-contrast hint (e.g., "Preview will appear here.") instead of an empty `<div>` so the empty state is clear (FR-002, FR-004 edge case, Acceptance Scenario 4).

**Contract assertions**:
- `Preview` MUST go through `renderMarkdown` from `lib/markdown.ts` — never call `markdown-it` directly and never bypass DOMPurify (Constitution VII).
- Preview's container scrolls independently of the Editor (FR-008).

---

## `lib/markdown.ts`

**File**: `src/lib/markdown.ts`
**Role**: Single chokepoint for markdown → safe HTML.

**Exports**:

```ts
export function renderMarkdown(source: string): string;
```

**Behavior**:
- Initializes a module-scoped `markdown-it` instance with options `{ html: false, linkify: true, typographer: true, breaks: false }`.
- Calls `md.render(source)` to produce raw HTML.
- Passes that HTML through `DOMPurify.sanitize(...)` and returns the result.

**Contract assertions**:
- This is the ONLY module that imports `markdown-it` or `dompurify`. Reviewers and future contributors can grep for these imports to verify Principle VII has not been bypassed.
- The function is pure: same `source` → same output. Safe to memoize.

---

## `lib/starterContent.ts`

**File**: `src/lib/starterContent.ts`
**Role**: Provide the first-run markdown sample.

**Exports**:

```ts
export const starterContent: string;
```

**Behavior**:
- Default export is a multi-line markdown string covering heading, bold, italic, list, link, inline code (see `research.md` §6).
- No logic — just a string constant.

**Contract assertions**:
- No imports from anywhere except (optionally) nothing.
- Length is short enough to render fully inside the editor pane at the default window size without scrolling.

---

## UI acceptance contract (cross-cutting)

A reviewer verifying this feature visually should be able to confirm, in order:

1. App opens to a workspace; **no Tauri/Vite/React boilerplate** is visible (no logos, no greet form, no default `Tauri + React + Typescript` title).
2. Two distinct rounded, soft-shadow "island" panes are visible side by side, with small labels "Editor" (left) and "Preview" (right).
3. The editor contains the starter content; the preview shows its rendered form, with the heading, bold, italic, list, link, and code visible.
4. Typing in the editor updates the preview immediately and continuously.
5. Resizing the window to ≤ 767 px wide stacks the panes vertically without breaking layout. Resizing wider returns to side-by-side.
6. Pasting a `<script>` tag inside markdown into the editor does NOT execute it in the preview (sanitizer check).
7. System color scheme switching (light ↔ dark) flips the workspace palette without manual reload.
