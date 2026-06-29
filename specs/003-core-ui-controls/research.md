# Phase 0 — Research: Core Workspace Controls

This document resolves the open technical questions for Feature 003. Each section captures the **decision**, the **rationale**, and the **alternatives considered**, so future contributors can re-open a choice with full context. The foundation laid by Feature 002 (CodeMirror 6 editor, markdown-it+DOMPurify preview, Tailwind CSS v4 islands aesthetic, prop-drilled React state) is assumed; this feature extends it.

## 1. Persisting user preferences (theme, view mode)

**Decision**: Persist preferences via `window.localStorage` under a small set of stable keys (`markpad.theme`, `markpad.viewMode`). Read on app mount with a defensive `try { JSON.parse(...) } catch` and `if (allowed.includes(value))` guard; fall back to the documented defaults (theme = system; viewMode = `split`) on any failure. Wrap reads/writes in `src/lib/preferences.ts` so the rest of the app never touches `localStorage` directly.

**Rationale**:
- Tauri's webview already exposes `localStorage`. It is per-app, persistent across launches, and requires zero new dependencies. For two scalar preferences it is the minimum-complexity answer.
- Localising all access through one module gives us a single seam for FR-020 (fallback on unreadable preference) and a single place to evolve the format later (e.g., versioning, or migrating to a Tauri Store).
- Synchronous read on mount means we can pick the initial theme before first paint — no flash of wrong theme.

**Alternatives considered**:
- **`@tauri-apps/plugin-store`**: a Tauri-managed JSON file in the app data directory. Real strengths (filesystem-backed, survives webview storage clearing, accessible from Rust). But adds a runtime dep and a capability, and requires async reads — which forces us to deal with "what colour scheme do we render on the first paint?". Rejected for two scalar values; revisit when we need to share preferences with the Rust side or sync across processes.
- **Custom file via `plugin-fs`**: we already need `plugin-fs` for "open file", so this seemed natural. Rejected: it inherits the async-on-mount problem above, requires picking a path convention we'd then have to maintain, and is strictly more complex than the Tauri Store plugin without being any more capable.
- **React Context + cookie**: cookies are not a great fit for a desktop webview, and we already have local React state for the rest of the app.

**Implementation notes**:
- Module shape: `getTheme()`, `setTheme(theme)`, `getViewMode()`, `setViewMode(mode)`, each fully synchronous.
- Whitelist the allowed values inside the module so a hand-edited localStorage entry cannot crash the app — it just falls back to the default (FR-020).
- Storage keys are prefixed (`markpad.*`) so we have a clean migration path if we change the surface later.

---

## 2. Dark / light theme: CSS strategy

**Decision**: Switch from the existing CSS `@media (prefers-color-scheme: dark)` block to a **data-attribute-driven** strategy: set `<html data-theme="light">` or `<html data-theme="dark">` from React on mount and whenever the user toggles. In `styles.css`, replace `@media (prefers-color-scheme: dark) { :root { ... } }` with `:root[data-theme="dark"] { ... }`. The "system" first-launch behaviour is implemented in TypeScript via `window.matchMedia('(prefers-color-scheme: dark)')` to compute the initial value when no stored preference exists, then write that resolved value to `data-theme`.

**Rationale**:
- The foundation's CSS variables (`--islands-bg-from`, `--islands-text`, `--islands-cursor`, etc.) are already the source of truth for both Tailwind utility usage and CodeMirror's `EditorView.theme(...)`. We only need to change **what selector** flips them — the variables themselves stay the same. This keeps the diff tiny.
- A data attribute on `<html>` lets us flip the entire app — including CodeMirror, which reads CSS vars at render time — in a single DOM write. No prop-drilling a theme value into every styled subtree.
- Resolving "system" once at app start (instead of letting CSS do it via media query) is what FR-016 asks for. After a user explicitly toggles, their choice MUST win over the OS preference; that is only expressible if the choice is a concrete `light` or `dark` value, not a "follow system" state.
- Using a `data-*` attribute rather than the class `dark` keeps options open if we later want a third state (e.g., `data-theme="sepia"`) without colliding with Tailwind's own `dark` class convention.

**Alternatives considered**:
- **Keep the CSS media query and add a class override**: e.g. `:root.dark { ... }` plus the media query. Works, but the precedence rules get fiddly (a stored "light" preference on a system set to dark requires the class to win), and we end up with two parallel sources of truth.
- **Tailwind v4's `dark` variant with class strategy**: in v4 this would be `@custom-variant dark (&:where(.dark, .dark *))` plus `<html class="dark">`. Roughly equivalent to data-attribute in capability. Rejected only because we currently use **CSS variables driven by a `:root[...]` selector**, not Tailwind's `dark:` variant — so a data-attribute approach matches our existing pattern more directly. Either would work; data-attribute is the smaller diff.
- **Pure media query, ignoring user preference**: rejected outright — FR-014 mandates a user toggle.

**Implementation notes**:
- Initial value resolution at mount (single function, in `src/lib/preferences.ts`):
  1. Read `markpad.theme` from localStorage. If it is `"light"` or `"dark"`, use it.
  2. Otherwise, return `window.matchMedia('(prefers-color-scheme: dark)').matches ? "dark" : "light"`. If `matchMedia` is unavailable (extremely unlikely in a Tauri webview), return `"light"` per the FR-016 fallback.
- Write `<html data-theme="...">` in a tiny inline-script bootstrap in `index.html` **before** React mounts. This prevents the brief flash of the wrong theme during React's hydration window. The script is ~5 lines and reads the same localStorage key.
- After React mounts, a `useEffect` in the app re-applies `data-theme` so subsequent toggles stay in sync.

---

## 3. View modes: rendering strategy that preserves editor state

**Decision**: Always **mount** the `<Editor>` component; in `"preview only"` mode, hide it with CSS (`hidden` Tailwind utility → `display: none`). Conditionally render `<Preview>` (i.e., do not mount it in `"editor only"` mode), since the preview holds no internal state worth preserving and re-renders cheaply. The Workspace's outer flex container switches between `flex-row` (split) and a single full-width child (editor-only / preview-only) using Tailwind utilities.

**Rationale**:
- CodeMirror's `EditorView` owns the document state, selection, cursor position, undo history, and a live mount on a DOM node. Tearing the `<Editor>` down via conditional rendering and re-mounting it would discard the undo history and cursor — failing FR-012 in spirit even if the text round-trips through React state. Hiding via `display: none` keeps the DOM node attached and CodeMirror happy.
- `<Preview>` is pure (`markdown: string → HTML`). Mounting it or not has no behavioural difference; not mounting it in editor-only mode is the slightly cheaper option and reads cleanly.
- Pure CSS for the layout shift matches Feature 002's approach to responsive panes — no JS layout math, no resize observers.

**Alternatives considered**:
- **Conditionally render both panes**: simplest code but breaks editor undo / cursor on every view-mode switch. Rejected for FR-012.
- **Lift all editor state into React**: would survive remounts, but means rebuilding `EditorView` (including history) from scratch each time — slow and discards everything except the text. Rejected for the same reason.
- **CSS `visibility: hidden` instead of `display: none`**: preserves layout space, which is the opposite of what we want when one pane should fill the workspace.
- **Two separate routes / two separate component trees**: way overkill for three modes that differ only by which child is shown.

**Implementation notes**:
- Editor visibility: `<section class={viewMode === "preview" ? "hidden" : "..."}>` — Tailwind's `hidden` is `display: none`.
- Preview visibility: conditionally `{viewMode !== "editor" && <Preview .../>}`.
- Layout shape: when only one pane is shown, that pane gets the full content area — drop the `flex-1` on a single child and let it grow naturally inside the flex container. Or render only the visible pane inside the flex container.
- The narrow-window vertical stacking from Feature 002 (`flex-col md:flex-row`) only applies in `split` mode; in single-pane modes there is nothing to stack.

---

## 4. Opening a file: Tauri plugin choice and capabilities

**Decision**: Use the official Tauri 2 plugins:
- `@tauri-apps/plugin-dialog` (frontend) + `tauri-plugin-dialog` (Rust) for the native open-file dialog.
- `@tauri-apps/plugin-fs` (frontend) + `tauri-plugin-fs` (Rust) for reading the file as text.

Grant the minimum permissions in `src-tauri/capabilities/default.json`:
- `dialog:default` (which includes `dialog:allow-open`),
- `fs:allow-read-text-file` scoped to the path the user explicitly picked via the dialog.

Wrap the entire "show dialog → user picks file → read file → return result" sequence in a single TypeScript function `openMarkdownFile()` in `src/lib/fileOpen.ts` that returns a discriminated union (`{ kind: "ok", name, path, content } | { kind: "cancelled" } | { kind: "error", message }`).

**Rationale**:
- These are the official Tauri 2 plugins for this exact purpose. They handle OS-native dialogs and async file I/O via the Tauri command bridge — no custom Rust commands needed for this feature.
- Scoping `fs:allow-read-text-file` to the user-picked path keeps us aligned with Principle VI (Local-First & Private by Default): the app does not gain blanket filesystem access. Tauri 2's permission model supports this directly via the "dialog returns a scoped path" pattern.
- A discriminated-union return type forces the caller (and reviewers) to handle every branch — success, cancel, error — which directly satisfies FR-005, FR-006.
- Encapsulation in `src/lib/fileOpen.ts` keeps the React tree free of Tauri imports; if we ever need to mock this for tests, the seam is in one place.

**Alternatives considered**:
- **Write a custom Tauri command** (`#[tauri::command] fn open_markdown_file(...)`) that does dialog + read in Rust: more code, less idiomatic for Tauri 2, and doesn't buy anything for this feature. The plugin approach is what the Tauri docs steer you to. Rejected for Principle I.
- **Browser `<input type="file">`**: works in webviews but gives a clipped, browsery experience and does not return a real filesystem path on every platform. The user explicitly asked for "open file" in the desktop sense — native dialog is the right answer. Rejected.
- **Drag-and-drop only**: spec lists drag-and-drop as a follow-up; we need a button-driven path first.
- **Use `plugin-fs` alone with a path the user types**: terrible UX. Rejected.

**Implementation notes**:
- `npm install @tauri-apps/plugin-dialog @tauri-apps/plugin-fs` (frontend bindings).
- `cargo add tauri-plugin-dialog tauri-plugin-fs` (Rust deps in `src-tauri/Cargo.toml`).
- Register both plugins in `src-tauri/src/lib.rs` alongside the existing `tauri_plugin_opener::init()`.
- Capabilities JSON entries are exact, not wildcarded:
  ```json
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default",
    "fs:allow-read-text-file"
  ]
  ```
- The dialog filter list: `[{ name: "Markdown", extensions: ["md", "markdown"] }, { name: "All Files", extensions: ["*"] }]` — satisfies FR-002.
- For files larger than ~1 MB, read still happens via the same plugin call; SC-008 only requires the app to remain responsive, not that the preview render instantly.
- On error from `readTextFile`, surface a short user-facing message ("Could not open this file. It may not be a text file, or you may not have permission to read it.") rather than the raw error string.

---

## 5. Showing which file is loaded (window title)

**Decision**: After a successful open, call `getCurrentWebviewWindow().setTitle(`${fileName} — markpad`)` from `@tauri-apps/api/window`. When no file is loaded (starter content), the title is the bare app name (`"markpad"`). The current `fileName` lives in React state in `App.tsx` alongside the text.

**Rationale**:
- The OS-native title bar is the universal "what document am I editing?" affordance on every desktop platform. Reusing it costs us nothing in screen real-estate and is immediately discoverable (supports FR-007 and SC-007).
- `@tauri-apps/api/window` is already a transitive dependency via the existing `@tauri-apps/api` package — no new package needed.
- Keeping the file name as React state (not in localStorage) is deliberate: "what file is open right now" is session state, not preference state. We do not persist open file references in this feature (no "restore last session" — explicitly out of scope per spec).

**Alternatives considered**:
- **An in-app banner / breadcrumb** showing the filename inside the workspace chrome: nice but redundant with the title bar, and competes with the existing pane labels for screen real-estate. Could be added later if usability testing shows the title bar is overlooked.
- **No indicator at all**: rejected — FR-007 explicitly requires one.
- **Persist the last-opened path so the title reflects it after relaunch**: out of scope; nothing else in the spec persists a file path, and that overlaps with "recent files" / "restore session" which are explicitly deferred.

**Implementation notes**:
- A small helper `setWindowTitle(label: string | null)` in `src/lib/fileOpen.ts` (or a sibling) wraps the Tauri call so failures (e.g., during tests) don't blow up.
- Truncate very long filenames in the title (e.g., show the basename only, never the full path) — most OS title bars truncate anyway, but we should do it ourselves so the displayed value is predictable.

---

## 6. Error messaging UX

**Decision**: A single dismissible banner mounted at the top of the workspace (above both panes), driven by a `error: string | null` field in App state. When non-null, the banner shows the message and a close button; clicking close or successfully opening another file clears it. No toast library, no notification queue.

**Rationale**:
- One error at a time is realistic for this feature: file-open errors are the only error path introduced. A queue / toast system is over-engineered.
- A banner inside our own DOM (rather than a native dialog) avoids stealing focus, fits the islands aesthetic, and dismisses the moment the user fixes the problem by opening a different file.
- Keeping the error in App state means it survives view-mode and theme changes (and doesn't leak between features).

**Alternatives considered**:
- **Native `alert()`** or Tauri's `message` dialog: modal, interrupts flow, looks dated.
- **A toast library** (`react-hot-toast`, `sonner`): one new runtime dep for one error path. Rejected on dependency justification.
- **Console-only**: invisible to users, fails SC-002's "surface a clear error" half.

**Implementation notes**:
- The banner uses the existing `--islands-*` CSS vars plus a warning accent (e.g., amber) so it reads as a clear alert without looking out of place.
- ARIA: role=`status` (or `alert` if we want screen readers to announce it immediately) so the message is announced.

---

## 7. Discoverability: where do the new controls live?

**Decision**: Add a thin horizontal toolbar above the workspace card area, inside the same `islandsBackground` container. The toolbar holds three controls, left to right:
1. **Open** button (icon + label).
2. **View mode** segmented control (three options: Editor / Split / Preview).
3. **Theme** toggle (sun / moon icon).

The toolbar uses the same islands styling (rounded card, soft surface), separated from the workspace by the existing `gap-4`/`p-4` rhythm.

**Rationale**:
- One predictable, always-visible chrome area is the simplest way to satisfy FR-021 ("reachable from the application's primary visible chrome"). A first-time user scans the chrome top-down — toolbar at the top is the most common convention for this kind of app and aligns with SC-007.
- A segmented control for view mode communicates "three mutually exclusive states" better than three separate icon buttons, and shows the active state inline (FR-013).
- Keeping the toolbar in the same container as the workspace means it inherits the islands gradient background and stays visually consistent.

**Alternatives considered**:
- **Native OS menu bar** (File → Open, View → Editor/Preview/Split, Appearance → Light/Dark): more "real desktop app", but Tauri's menu API is more involved to wire up cross-platform, less discoverable for casual users, and not visible to a beginner who never opened a menu. Worth revisiting once the feature set grows beyond what fits in a toolbar.
- **Hover-revealed or collapsed toolbar**: hides the controls from new users — fails SC-007.
- **A floating action button**: works for one primary action; awkward for three different controls of different kinds.

**Implementation notes**:
- Place the toolbar as a new component `src/components/Toolbar.tsx` (~80 lines budget per constitution).
- Icons can be inline SVGs (no icon-library dep) — three icons total (folder/open, layout, sun-moon) is well within hand-rolled territory.
- The segmented control is three buttons with `aria-pressed` reflecting the active mode.

---

## 8. State organisation: keep prop-drilling or introduce Context?

**Decision**: Stay with prop-drilling from `App.tsx`. App owns the canonical state for: `text`, `currentFileName`, `theme`, `viewMode`, `error`. Each is passed down only to the components that need it (`<Toolbar />` gets all five toggle handlers; `<Workspace />` gets `text`, `viewMode`, and `onTextChange`). The `useEffect` that writes `data-theme` to `<html>` lives in App.

**Rationale**:
- The constitution states: "Global state libraries (Redux, Zustand, Jotai, MobX, etc.) MUST NOT be introduced until local state and React context have demonstrably failed." React Context is allowed, but only if `useState` becomes painful first.
- We have ~5 state fields and one level of prop passing (App → Toolbar / Workspace). That is well below the threshold where prop-drilling starts to hurt.
- A future feature (e.g., a Save layer with a "dirty" flag, or a settings panel with many preferences) is a good moment to introduce Context. Doing it now is premature abstraction.

**Alternatives considered**:
- **React Context for preferences**: tempting, but the only consumers are `<html data-theme>` (a single `useEffect`) and `<Toolbar>` (single component). Context buys nothing yet.
- **Zustand / Jotai**: explicitly disallowed by the constitution without prior demonstrated need.
- **Stash everything in localStorage and read it from each component**: scatters reads, makes testing harder.

**Implementation notes**:
- `App.tsx` will grow from ~10 lines to ~50–60 lines. Still well under the 150-line component soft cap.
- If `App.tsx` exceeds the cap, the right move is to extract a `useWorkspaceState()` custom hook, not to introduce Context.

---

## 9. Out-of-scope confirmations (re-stated from spec for the tasks phase)

These are intentionally **not** addressed in this feature; planning here ensures the tasks phase does not silently expand scope:

- **Save / Save As / autosave**: the file is read-only from the app's perspective.
- **Reload from disk / external change detection**: not in this feature.
- **Recent files / restore session / persisted open file path**: out of scope.
- **Drag-and-drop file opening; OS "Open with…" associations**: out of scope.
- **Multiple documents (tabs, side-by-side files)**: out of scope.
- **Draggable split divider / continuously adjustable widths**: out of scope.
- **Custom themes / accent colours / sepia / high-contrast**: out of scope; theme is binary light/dark.
- **Keyboard shortcuts for the three controls**: not required, and not prohibited — implementers MAY add `Ctrl/Cmd+O` and view-mode shortcuts if they come for free, but they are not tested as part of this feature's acceptance.
- **Localisation of UI strings, error messages, or starter content**: out of scope.
- **Wiring up ESLint / Prettier / test runner / CI**: still a pre-existing gap from 002; this feature adds no new CI requirement beyond what already exists.
