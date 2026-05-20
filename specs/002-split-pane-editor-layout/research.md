# Phase 0 — Research: Split-Pane Editor Layout Foundation

This document resolves the open technical questions in `plan.md`. Each section captures the **decision**, the **rationale**, and the **alternatives considered**, so future contributors can re-open a choice with full context.

## 1. CodeMirror 6 integration with React 19

**Decision**: Build a small `Editor.tsx` that mounts an `EditorView` imperatively inside a `useRef` div, wires a `ViewPlugin` / `EditorView.updateListener` to call back into React when the doc changes, and exposes `value` + `onChange` props. Use the official packages: `codemirror`, `@codemirror/state`, `@codemirror/view`, `@codemirror/lang-markdown`, `@codemirror/commands`. Configure with `markdown()` language, basic keymap, line wrapping, and an "islands" theme via `EditorView.theme(...)`.

**Rationale**:
- CodeMirror 6 has no first-party React wrapper, but the imperative-mount pattern is ~60 lines, very stable, and the official recommendation. It keeps us off third-party wrappers we'd have to track.
- Controlling the editor as `(value, onChange)` matches how every other React form input behaves — Principle VIII (Contributor-Friendly).
- The official `@uiw/react-codemirror` wrapper exists but adds another runtime dep and another upgrade path. For an editor we'll customize heavily later (themes, keybindings, slash commands), owning the mount code is cheaper than fighting a wrapper.

**Alternatives considered**:
- `@uiw/react-codemirror`: convenient, but yet another dep and indirection. Rejected for Principle I + dependency justification.
- Textarea with manual highlighting: trivial to write, but loses everything CodeMirror gives us for free (selection, soft-wrap, multi-cursor, IME, accessibility). Rejected — we'd just be reinventing CodeMirror badly.
- Monaco Editor: heavyweight (multi-megabyte), VS-Code-flavored, designed for IDE workloads. Overkill for a markdown editor and not on the approved stack.

**Implementation notes for tasks phase**:
- The CodeMirror `EditorState` is the source of truth inside CM; React holds a mirror in `useState` and re-syncs on prop change only when the change did not originate from the editor itself, to avoid feedback loops.
- Use `EditorView.lineWrapping` so long lines don't horizontally scroll the editor pane.
- Theme tokens (background, gutter, selection) should derive from Tailwind CSS variables when practical so light/dark theming stays consistent with the rest of the UI.

---

## 2. Markdown rendering and sanitization

**Decision**: Use `markdown-it` with defaults (`html: false`, `linkify: true`, `typographer: true`, `breaks: false`) and run the resulting HTML through `DOMPurify.sanitize(...)` before assigning it via `dangerouslySetInnerHTML` in `Preview.tsx`. Encapsulate both steps in `src/lib/markdown.ts` so no caller can render markdown without sanitization.

**Rationale**:
- `markdown-it` is on the approved stack (Constitution). It is CommonMark-aligned, plugin-friendly, fast, and battle-tested.
- `html: false` already strips raw HTML at the parser level, which is the first layer of defence. DOMPurify is the second layer that catches anything that slips through later plugins (e.g., when we eventually enable raw HTML for power users behind a flag).
- DOMPurify is the de-facto standard sanitizer in the JS ecosystem. Maintained by Cure53, audited, minimal API.
- Centralizing this in `markdown.ts` means Principle VII is enforced by code structure, not by reviewer vigilance: any future `Preview` variant must go through this module.

**Alternatives considered**:
- `marked` + `sanitize-html`: viable, but `marked` removed its built-in sanitizer and `sanitize-html` is heavier and Node-oriented. markdown-it wins on plugin ecosystem.
- `remark` / `rehype`: lovely architecture, but bundle cost and complexity are higher than this foundation needs. Worth revisiting if we add AST-level transforms later.
- Skip sanitizer because `html: false` is "enough": rejected. Principle VII says rendered HTML "MUST be sanitized before being inserted into the DOM" — period. Defence in depth is the cheap default.

**Implementation notes**:
- `markdown.ts` exports one function: `renderMarkdown(source: string): string` returning sanitized HTML.
- The `markdown-it` instance is module-scoped (one instance reused across renders) so plugin setup happens once.
- DOMPurify config: defaults are fine for CommonMark output. Only relax if a later feature spec demands it.

---

## 3. Tailwind CSS v4 setup with Vite

**Decision**: Install `tailwindcss@^4` and `@tailwindcss/vite@^4`. Add the plugin to `vite.config.ts`. Create `src/styles.css` containing only `@import "tailwindcss";` plus any minimal global resets that don't belong in components. Import `styles.css` once from `src/main.tsx`. Use the `dark:` variant with `@media (prefers-color-scheme: dark)` mode for the islands aesthetic in both schemes; no manual theme toggle in this foundation.

**Rationale**:
- Tailwind v4's `@tailwindcss/vite` plugin removed PostCSS configuration, content scanning config, and the separate `tailwind.config.js` for default cases. Setup is essentially "install + plugin + one CSS import". This matches Principle I.
- v4's design-token system (CSS variables) makes it easy to share a color palette with CodeMirror's theme.
- Tailwind is on the approved stack; we're using the simplest current incarnation.

**Alternatives considered**:
- Tailwind v3 with PostCSS: extra config files (`tailwind.config.js`, `postcss.config.js`) and a `content` glob to maintain. Rejected because v4 deletes that work.
- Plain CSS Modules: viable for this small feature but loses the utility-first iteration loop the islands UI relies on (spacing, radius, shadow, dark-variant). We'd reinvent half of Tailwind's atoms by hand.
- Vanilla CSS in `App.css` (current): blocks scalable theming and dark mode for free. Rejected.

**Implementation notes**:
- Delete the existing `src/App.css` once `styles.css` is in place; it conflicts with Tailwind's reset and is starter-template noise.
- Configure dark-mode via the default `prefers-color-scheme` strategy — no explicit `darkMode` setting needed in v4.

---

## 4. Responsive split-pane layout

**Decision**: Implement the workspace as a CSS flexbox container with `flex-row` at and above the `md` breakpoint (≥ 768 px) and `flex-col` below it. Each pane is `flex-1` with `min-w-0 min-h-0` so it can shrink, and `overflow-auto` so internal content scrolls independently (FR-008). The 50/50 split is implicit from equal `flex-1` siblings; a small gap (`gap-4`) creates the visible separation between islands. No draggable divider in this foundation.

**Rationale**:
- Pure CSS satisfies FR-006, FR-009, FR-010 with zero JS, zero resize listeners, zero reflow logic.
- The `md` breakpoint is Tailwind's default for "tablet up"; at 480–767 px the panes stack vertically, keeping each usable per FR-010 and Spec SC-003 (480 px floor).
- `min-w-0 min-h-0` is the standard fix for flex children that contain `overflow-auto` content — without it, the children would refuse to shrink below their content's intrinsic size.

**Alternatives considered**:
- CSS Grid (`grid-cols-2`): equally valid; flex feels marginally simpler for two siblings that just split available space and reflow to column.
- `react-split-pane` / `allotment`: third-party split components with draggable handles. They solve a problem (user-resizable split) we explicitly deferred in the spec. Rejected on Principle I and dependency justification.
- JS-driven layout with `useEffect` + `ResizeObserver`: unnecessary; CSS handles it.

**Implementation notes**:
- The Workspace's root element should use `h-screen w-screen` (or `min-h-screen` if scrollbar gutter matters) so the panes fill the Tauri window.
- Apply a min-height of, say, `min-h-[200px]` on each pane when stacked, so a very short window doesn't compress one pane to invisibility.

---

## 5. "Modern islands" visual aesthetic

**Decision**: Define a small set of utility-class conventions for the foundation:

- **Background**: subtle two-stop gradient on the page (`bg-gradient-to-br from-slate-50 to-slate-100` light, `from-slate-900 to-slate-950` dark). Padding around the panes (`p-4 md:p-6`) so the cards visibly float.
- **Pane**: `rounded-2xl` (large radius), `bg-white/80` (light) / `bg-slate-800/60` (dark), `backdrop-blur` for the soft glassy feel, `shadow-sm` with `ring-1 ring-black/5` for the hairline. Internal padding `p-4 md:p-6`.
- **Header strip per pane**: tiny label ("Editor" / "Preview") in `text-xs uppercase tracking-wide text-slate-500` so users immediately know which side is which (supports SC-004).
- **Typography**: system sans for chrome; CodeMirror's mono in the editor; Tailwind's `prose` (when we install `@tailwindcss/typography`) or hand-tuned classes for the preview's rendered markdown. For the foundation, hand-tuned classes are sufficient — `prose` is a candidate add later.
- **Accent color**: a single calm accent (e.g., `indigo-500`) reserved for future interactive bits; the foundation doesn't expose it yet beyond CodeMirror's selection highlight.
- **Motion**: no animations on resize or initial render in the foundation. Avoids the "lots happening at once" feel and meets SC-005 (no flicker).

**Rationale**:
- The user explicitly asked for "modern islands style, very intuitive and easy to digest." Floating rounded cards with generous gutters and soft surfaces is the de facto vocabulary of that aesthetic (Linear, Arc, Raycast).
- Two small labels solve the "which pane is which" question explicitly rather than relying purely on starter content (SC-004 directly).
- Keeping motion minimal protects perceived performance and aligns with Principle I.

**Alternatives considered**:
- Flat full-bleed editor and preview separated only by a 1 px divider: more "IDE", less "intuitive and easy to digest." Rejected per user direction.
- Heavy glassmorphism (large blur, neon accents): trendy but visually busy — opposite of "easy to digest".
- Skipping pane labels and relying on starter content alone: works for known users but fails first-time intuition under SC-004.

**Implementation notes**:
- Pick the exact palette in `styles.css` as CSS variables so CodeMirror's theme and the rest of the UI can reference one source of truth.
- Tailwind's `dark:` variants handle the auto theme — no `next-themes` or theme provider needed for the foundation.

---

## 6. Starter content (FR-007, User Story 3)

**Decision**: Ship a short, friendly markdown document in `src/lib/starterContent.ts` exported as a default string. It introduces MILF in one sentence, demonstrates a heading, bold/italic, a list, a link, and an inline code span — enough to make the preview visually distinct from the raw text and let a new user immediately see the correspondence.

**Rationale**:
- A static string is the simplest possible source. No JSON, no fetch, no i18n machinery (out of scope per spec Assumptions).
- Covering several markdown features in the sample, rather than just a heading, increases the chance the first-time user understands "what I type on the left becomes formatted on the right" within SC-004's 10-second window.

**Alternatives considered**:
- Empty editor with a placeholder: discoverable but less obvious; weaker for SC-004.
- Loading from `public/starter.md` at runtime: extra network/file I/O for no benefit at this stage.
- Localised starter content via i18n: explicitly out of scope (spec Assumptions).

**Implementation notes**:
- Keep the string under ~30 lines so it doesn't dominate the screen.
- End the sample with a short call-to-action like "Try editing this text — the preview updates as you type." to nudge engagement.

---

## 7. Out-of-scope confirmations (re-stated from spec for the tasks phase)

These are intentionally **not** addressed in this feature; planning here ensures the tasks phase does not silently expand scope:

- **Draggable divider between panes**: deferred to a follow-up feature.
- **File open / save / autosave / export**: deferred; the document is in-memory.
- **Toolbar, menus, command palette**: deferred.
- **User-toggleable theme switch**: the foundation honors `prefers-color-scheme` only.
- **Test runner, ESLint, Prettier, CI**: deferred (see plan.md Complexity Tracking).
- **Tauri commands for the foundation**: none added; `src-tauri/` is untouched aside from possibly a window-size default tweak in `tauri.conf.json`.
- **Localization of UI strings or starter content**: deferred.
