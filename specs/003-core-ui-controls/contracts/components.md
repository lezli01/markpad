# Phase 1 — Component Contracts: Core Workspace Controls

markpad's primary external interface is still its UI. This feature adds two new components (`<Toolbar />`, `<ErrorBanner />`), two new `lib/` modules (`preferences.ts`, `fileOpen.ts`), and updates `<App />` and `<Workspace />` to wire them in. No new Tauri custom commands are introduced; we configure the official `tauri-plugin-dialog` and `tauri-plugin-fs` plugins instead.

## Conventions (carried over from Feature 002)

- All components are function components in TypeScript with explicit prop types.
- Each component lives in its own file under `src/components/` and stays under the Constitution's ~150-line ceiling.
- No component holds non-trivial business logic; helpers live in `src/lib/`.

---

## `<App />` (UPDATED from Feature 002)

**File**: `src/App.tsx`

**Owns** (now): `text`, `theme`, `viewMode`, `openedFile`, `error`. See `data-model.md` for full semantics. App is the sole owner of all five.

**Props**: none.

**Behavior**:
- On mount, initialises:
  - `text` from `starterContent` (unchanged from 002),
  - `theme` from `preferences.getTheme()` (which resolves system preference when no value is stored — see `lib/preferences.ts`),
  - `viewMode` from `preferences.getViewMode()`,
  - `openedFile = null`,
  - `error = null`.
- Runs a `useEffect` that writes `document.documentElement.dataset.theme = theme` whenever `theme` changes. (The same value is also set by an inline bootstrap script in `index.html` before React mounts, to avoid a flash of the wrong theme on first paint.)
- Runs a `useEffect` that calls `setWindowTitle(openedFile?.name ?? null)` whenever `openedFile` changes.
- Defines three handlers:
  - `handleOpenFile()` — calls `openMarkdownFile()` from `lib/fileOpen.ts`. On `kind: "ok"`, sets `text`, `openedFile`, and clears `error`. On `kind: "error"`, sets `error` (and leaves `text` / `openedFile` unchanged). On `kind: "cancelled"`, does nothing.
  - `handleSetViewMode(mode)` — sets `viewMode` and writes it via `preferences.setViewMode(mode)`.
  - `handleToggleTheme()` — flips between `"light"` and `"dark"`, writes via `preferences.setTheme(next)`.
- Renders, in order: `<Toolbar />`, `<ErrorBanner />` (only when `error !== null`), `<Workspace />`.

**Contract assertions**:
- App is the only place that calls into `preferences.*` and `fileOpen.*`.
- App does NOT import `markdown-it`, `DOMPurify`, `@tauri-apps/plugin-dialog`, or `@tauri-apps/plugin-fs` directly — those imports live in the respective `lib/` modules.
- App stays under ~80 lines of TSX; if it grows past that, extract a `useWorkspaceState()` custom hook rather than introducing Context.

---

## `<Toolbar />` (NEW)

**File**: `src/components/Toolbar.tsx`

**Role**: The thin horizontal chrome above the workspace that holds the Open button, the view-mode segmented control, and the theme toggle.

**Props**:

```ts
type ViewMode = "editor" | "preview" | "split";
type Theme = "light" | "dark";

type ToolbarProps = {
  viewMode: ViewMode;
  theme: Theme;
  onOpenFile: () => void;
  onSetViewMode: (mode: ViewMode) => void;
  onToggleTheme: () => void;
};
```

**Behavior**:
- Lays out three control groups left-to-right inside a rounded "islands" surface.
- The Open button is a button with an icon (folder/open SVG) and the text "Open". Clicking it calls `onOpenFile()`.
- The view-mode control is a segmented group of three buttons ("Editor", "Split", "Preview"). The active button has `aria-pressed="true"` and a visible "selected" style (e.g., the islands surface tone darkened by one step). Clicking a button calls `onSetViewMode(...)`.
- The theme toggle is a single button showing a sun icon when `theme === "dark"` (it would switch *to* light) and a moon icon when `theme === "light"`. Clicking it calls `onToggleTheme()`.

**Accessibility**:
- All three controls are real `<button>` elements with discernible text (either visible label or `aria-label`).
- The active view-mode segment uses `aria-pressed`.
- The theme toggle has an `aria-label` such as "Switch to dark theme" / "Switch to light theme" that updates with the current `theme`.

**Contract assertions**:
- Toolbar holds no state of its own. It is a pure function of its props.
- Toolbar does NOT call `preferences.*`, `fileOpen.*`, or any Tauri API directly. All side effects flow through the handlers App passes in.
- Toolbar does NOT import any icon-library package — icons are inline SVG.

---

## `<ErrorBanner />` (NEW)

**File**: `src/components/ErrorBanner.tsx`

**Role**: A dismissible, non-modal message that surfaces file-open errors.

**Props**:

```ts
type ErrorBannerProps = {
  message: string;
  onDismiss: () => void;
};
```

**Behavior**:
- Renders a single horizontal bar (rounded, islands-styled, with a warning accent — see `research.md` §6) above the workspace.
- Shows `message` as text plus a close button (✕). Clicking the close button calls `onDismiss()`.
- Uses `role="status"` so assistive tech announces the message politely. (Not `role="alert"` — that interrupts; the user is not in immediate danger.)

**Contract assertions**:
- Renders nothing when not present in the tree. App is responsible for conditionally rendering it.
- Holds no state. Pure function of `message`.
- Does not auto-dismiss (no timer). Only `onDismiss` or an App-driven unmount clears it.

---

## `<Workspace />` (UPDATED from Feature 002)

**File**: `src/components/Workspace.tsx`

**Role**: Layout shell — now responsible for switching between editor-only / preview-only / split layouts while always keeping `<Editor>` mounted.

**Props**:

```ts
type WorkspaceProps = {
  text: string;
  viewMode: ViewMode;
  onTextChange: (next: string) => void;
};
```

**Behavior**:
- Container: same `islandsBackground` and `flex` layout as in 002, with the toolbar/banner sitting outside it (above) inside the App tree.
- In `split` mode: renders Editor card and Preview card side-by-side, with the same `flex-col md:flex-row` stacking behaviour as 002.
- In `editor` mode: hides the Preview card and lets the Editor card take the full content width. The Editor card stays mounted.
- In `preview` mode: hides the Editor card (`display: none` via the Tailwind `hidden` utility) but keeps it in the DOM so CodeMirror's state is preserved. The Preview card takes the full content width.
- The pane labels ("Editor", "Preview") from 002 stay; they help users orient themselves regardless of mode (FR-013 visual cue is in the Toolbar, but the in-pane labels still aid context).

**Contract assertions**:
- Workspace MUST hide the editor pane via CSS, not by unmounting (`research.md` §3). Failing this loses cursor / undo history on every view-mode switch.
- Workspace forwards `text` and `onTextChange` to the existing Editor and Preview without modification.
- Workspace has no JS resize listeners and reads no localStorage.

---

## `<Editor />` (UNCHANGED from Feature 002)

No prop changes. The existing prop-driven `value` sync (Editor.tsx lines 85–94) already handles the "open file replaces text" case correctly: when App's `text` state changes to the file's content, the `useEffect` in Editor dispatches the replacement into CodeMirror.

---

## `<Preview />` (UNCHANGED from Feature 002)

No prop changes. Preview is unmounted when `viewMode === "editor"` and remounted when the user switches back to `split` or `preview`. Remount is cheap because Preview is pure.

---

## `lib/preferences.ts` (NEW)

**File**: `src/lib/preferences.ts`

**Role**: The single chokepoint for reading and writing user preferences. The rest of the app never touches `localStorage` directly.

**Exports**:

```ts
export type Theme = "light" | "dark";
export type ViewMode = "editor" | "preview" | "split";

export function getTheme(): Theme;
export function setTheme(theme: Theme): void;

export function getViewMode(): ViewMode;
export function setViewMode(mode: ViewMode): void;
```

**Behavior**:
- `getTheme()`:
  1. Read `localStorage.getItem("markpad.theme")` inside a try/catch.
  2. If the value is `"light"` or `"dark"`, return it.
  3. Otherwise, return `window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"`.
  4. If `matchMedia` is unavailable (defensive), return `"light"`.
- `setTheme(theme)`:
  - Validates `theme` is in the allowed set; throws a `TypeError` if not (this is an internal invariant — App-supplied values are typed).
  - Writes `localStorage.setItem("markpad.theme", theme)` inside try/catch — a write failure is logged with `console.warn` but does not throw to the caller.
- `getViewMode()` / `setViewMode(mode)`: same shape, with allowed values `"editor" | "preview" | "split"` and the default branch returning `"split"`.

**Contract assertions**:
- Only this module imports/calls `localStorage`. Reviewers can grep for `localStorage` to confirm.
- All four functions are synchronous and safe to call during React render or in `useState` initialisers.
- The allowed-value whitelists are exported as TypeScript types AND duplicated as runtime arrays inside the module, so a hand-edited storage entry cannot poison the app.

---

## `lib/fileOpen.ts` (NEW)

**File**: `src/lib/fileOpen.ts`

**Role**: Encapsulates the entire "show open dialog → read file → return result" flow, and the side effect of updating the OS window title.

**Exports**:

```ts
export type OpenResult =
  | { kind: "ok"; name: string; path: string; content: string }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

export async function openMarkdownFile(): Promise<OpenResult>;

export function setWindowTitle(fileName: string | null): Promise<void>;
```

**Behavior**:
- `openMarkdownFile()`:
  1. Call `open` from `@tauri-apps/plugin-dialog` with options:
     ```ts
     {
       multiple: false,
       directory: false,
       filters: [
         { name: "Markdown", extensions: ["md", "markdown"] },
         { name: "All Files", extensions: ["*"] }
       ]
     }
     ```
  2. If the result is `null` (user cancelled), return `{ kind: "cancelled" }`.
  3. Otherwise, read the file with `readTextFile(path)` from `@tauri-apps/plugin-fs`.
  4. On success, return `{ kind: "ok", name: basename(path), path, content }`.
  5. On any thrown error, return `{ kind: "error", message: friendlyMessage(err) }`. The friendly message is one of a small set of plain-language strings; the raw error is logged via `console.warn` for debugging but never shown to the user.
- `setWindowTitle(name)`:
  - If `name` is null, call `getCurrentWebviewWindow().setTitle("markpad")`.
  - Otherwise, call `getCurrentWebviewWindow().setTitle(`${name} — markpad`)`.
  - Wraps the call in try/catch; a failure logs `console.warn` but does not throw.

**Contract assertions**:
- This is the only module that imports `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`, or `@tauri-apps/api/window`. Reviewers can grep for these to confirm.
- `openMarkdownFile()` never throws — it always resolves to one of the three discriminated-union variants.
- The "friendly message" function maps a small set of detectable error kinds (permission denied, file not found, not-text content) to human-readable English strings. Unknown errors fall back to a generic message.

---

## Tauri configuration changes

These are not React components but are part of the contract surface for this feature.

### `src-tauri/Cargo.toml`

Add:

```toml
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
```

### `src-tauri/src/lib.rs`

Register the two new plugins alongside the existing `tauri_plugin_opener`:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![greet])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
```

(The existing `greet` command stays for now; pruning it is a chore for a follow-up.)

### `src-tauri/capabilities/default.json`

Extend `permissions` to include the minimum needed:

```json
"permissions": [
  "core:default",
  "opener:default",
  "dialog:default",
  "fs:allow-read-text-file"
]
```

`fs:allow-read-text-file` permits reading text files at paths the user has explicitly selected via the dialog (Tauri 2's "scoped path" pattern). It does NOT grant blanket filesystem read access.

### `package.json`

Add to `dependencies`:

```json
"@tauri-apps/plugin-dialog": "^2",
"@tauri-apps/plugin-fs": "^2"
```

---

## `index.html` (UPDATED)

Add a tiny bootstrap script in `<head>` that sets `<html data-theme="...">` before React mounts, to avoid a flash of the wrong theme:

```html
<script>
  (function () {
    try {
      var stored = localStorage.getItem("markpad.theme");
      var theme =
        stored === "light" || stored === "dark"
          ? stored
          : window.matchMedia &&
              window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
      document.documentElement.dataset.theme = theme;
    } catch (e) {
      document.documentElement.dataset.theme = "light";
    }
  })();
</script>
```

This script is duplicated logic with `lib/preferences.ts` — but only the first-launch resolution. The duplication is intentional: it runs before any module loads, so it cannot import the lib module. Total size is < 20 lines and the logic is stable.

---

## UI acceptance contract (cross-cutting)

A reviewer verifying this feature visually should be able to confirm, in order:

1. The application opens to a workspace that contains everything from Feature 002 (split panes, starter content) PLUS a visible toolbar above the panes with three controls: Open, view-mode segmented control, theme toggle.
2. Clicking Open shows a native file dialog filtered for `.md` / `.markdown` files; picking a markdown file replaces the editor's content with the file's text and updates the preview. The OS window title shows the file's basename.
3. Clicking each view-mode segment switches the workspace between editor-only, split, and preview-only without losing the editor's text.
4. Clicking the theme toggle flips the entire UI between light and dark — including the editor, preview, toolbar, error banner if visible, and pane labels — with no element stuck in the previous theme.
5. Closing and reopening the application restores the last-chosen theme and last-chosen view mode. The starter content (or default split) returns; the previously opened file is NOT restored.
6. Cancelling the file dialog leaves the workspace unchanged.
7. Picking a binary file (e.g., a PNG with a `.md` extension) leaves the editor unchanged and surfaces a dismissible error banner.
8. The toolbar, error banner, and pane labels are all keyboard-reachable via Tab; the active view-mode segment is announced as "pressed" by a screen reader.
