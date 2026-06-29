# Phase 1 — Component Contracts: Save Controls and Active File Header

markpad's primary external interface is still its UI. This feature adds **one new component** (`<FileHeader />`), updates `<App />` and `<Toolbar />`, extends **two existing lib modules** (`preferences.ts`, `fileOpen.ts`), and adds **one capability entry** (`fs:allow-write-text-file`). No new Tauri custom commands, no new npm or cargo dependencies, no new lib modules.

## Conventions (carried over from Features 002 and 003)

- All components are function components in TypeScript with explicit prop types.
- Each component lives in its own file under `src/components/` and stays under the Constitution's ~150-line ceiling.
- No component holds non-trivial business logic; helpers live in `src/lib/`.
- Tauri I/O lives in `src/lib/fileOpen.ts` (the single chokepoint). `localStorage` lives in `src/lib/preferences.ts` (the single chokepoint).

---

## `<App />` (UPDATED from Feature 003)

**File**: `src/App.tsx`

**Owns** (after this feature): `text`, `savedText`, `theme`, `viewMode`, `autoSave`, `openedFile`, `error`, `saving`. App is the sole owner of all eight, and the sole holder of the `pendingSaveRef` ref.

**Props**: none.

**Behavior**:
- On mount, initialises:
  - `text` from `starterContent` (unchanged from 002/003),
  - `savedText` from `starterContent` (so `isModified === false` at launch with no file open — there is nothing to save and no asterisk to show),
  - `theme` from `preferences.getTheme()` (unchanged from 003),
  - `viewMode` from `preferences.getViewMode()` (unchanged from 003),
  - `autoSave` from `preferences.getAutoSave()` (NEW; defaults to `false` per FR-019/FR-020),
  - `openedFile = null` (unchanged from 003),
  - `error = null` (unchanged from 003),
  - `saving = false` (NEW),
  - `pendingSaveRef = useRef({ current: false })` (NEW).
- Runs a `useEffect` that writes `document.documentElement.dataset.theme = theme` whenever `theme` changes (unchanged from 003).
- Runs a `useEffect` that calls `setWindowTitle(openedFile?.name ?? null)` whenever `openedFile` changes (unchanged from 003).
- Runs a NEW `useEffect` that implements the auto-save debounce:
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
  with `AUTO_SAVE_DEBOUNCE_MS = 1500` declared as a module-local constant.
- Defines `performSave()` — the single function both manual Save and the auto-save effect call (per `research.md` §3):
  - If `openedFile === null`: no-op (defensive; callers should not reach this).
  - If `saving === true`: set `pendingSaveRef.current = true` and return.
  - Otherwise: set `saving = true`, snapshot `outbound = text`, await `saveMarkdownFile(openedFile.path, outbound)`.
  - On `kind: "ok"`: `setSavedText(outbound)`, `setError(null)`, `setSaving(false)`. If `pendingSaveRef.current` is true, clear it and schedule another `performSave` via `queueMicrotask` (or a 0 ms `setTimeout`) so it runs against the latest `text`.
  - On `kind: "error"`: `setError(result.message)`, `setSaving(false)` (do NOT update `savedText` — modified flag stays true per FR-004). Clear `pendingSaveRef.current` so a failed save doesn't trigger an infinite retry loop.
- Updates `handleOpenFile` so the success branch also resets `savedText` to the file's content (so the freshly opened file is correctly considered unmodified). No other handler changes.
- Defines a NEW `handleSave()` handler that simply calls `performSave()`. This thin wrapper exists so the prop signature passed to `<Toolbar />` is `onSave: () => void` rather than exposing the async `performSave` directly.
- Defines a NEW `handleToggleAutoSave(next: boolean)` handler that calls `setAutoSaveState(next)` and `preferences.setAutoSave(next)`. Mirrors `handleToggleTheme` from Feature 003.
- Renders, in order: `<FileHeader />`, `<Toolbar />`, `<ErrorBanner />` (only when `error !== null`), `<Workspace />`. Note the new ordering: header above toolbar (`research.md` §6).

**Derived values** (computed inline at render time):
- `const isModified = text !== savedText;`
- `const saveEnabled = openedFile !== null && !saving;`

These are not stored. They are passed down as props.

**Contract assertions**:
- App is the only place that calls into `preferences.*` and `fileOpen.*`. (Same as Feature 003.)
- App does NOT import `markdown-it`, `DOMPurify`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`, or `@tauri-apps/api/webviewWindow` directly — those imports live in the respective `lib/` modules.
- App stays under ~120 lines of TSX after this feature. If it grows past ~150 lines, the right move is to extract a `useWorkspaceState()` custom hook, not to introduce Context.
- App is the only place that holds `pendingSaveRef`. Child components never see it.

---

## `<FileHeader />` (NEW)

**File**: `src/components/FileHeader.tsx`

**Role**: A small, non-interactive label at the very top of the App shell. Tells the user which file is open, whether it has unsaved changes, and (via hover) what the full path is.

**Props**:

```ts
type FileHeaderProps = {
  fileName: string | null;
  fullPath: string | null;
  isModified: boolean;
};
```

**Behavior**:
- Renders a single horizontal "islands" surface — same rounded card, same ring, same background colour as `<Toolbar />` — containing one line of text.
- The display text is computed as:
  - When `fileName === null`: `"Untitled"`. No modified marker. `title="No file open"`.
  - When `fileName !== null && !isModified`: `fileName`. `title=fullPath ?? fileName`.
  - When `fileName !== null && isModified`: `"* " + fileName`. `title=fullPath ?? fileName`. The asterisk is rendered as a separate `<span aria-label="modified">` so screen readers announce it as "modified" rather than spelling the character.
- Long names truncate with Tailwind's `truncate` utility (`overflow-hidden text-ellipsis whitespace-nowrap`) on the file-name span. The container is `min-w-0` so the truncation actually fires inside flex.
- The `title` attribute is the user-facing tooltip for FR-010's progressive disclosure of the full path.
- Uses `role="status"` with `aria-live="polite"` so screen readers announce file-name changes without interrupting the user.

**Accessibility**:
- The whole header is a `<header>` element with `role="status"` and `aria-live="polite"`.
- The asterisk (when present) is wrapped in `<span aria-label="modified">`.
- The tooltip is the native browser `title` attribute on the file-name span (no custom hover machinery — see `research.md` §6).

**Contract assertions**:
- Holds no state. Pure function of its props.
- Calls no `lib/*` module, no Tauri API, no `localStorage`. It is presentation only.
- Imports no icon-library and renders no SVGs — the asterisk is a regular character, not an icon.
- Must remain visible in all three view modes (achieved by rendering it in `<App />` outside `<Workspace />`).

---

## `<Toolbar />` (UPDATED from Feature 003)

**File**: `src/components/Toolbar.tsx`

**Role**: The thin horizontal control bar that holds Open, Save, the auto-save checkbox, the view-mode segmented control, and the theme toggle.

**Props** (extended):

```ts
type ViewMode = "editor" | "preview" | "split";
type Theme = "light" | "dark";

type ToolbarProps = {
  viewMode: ViewMode;
  theme: Theme;
  autoSave: boolean;       // NEW
  saveEnabled: boolean;    // NEW
  saving: boolean;         // NEW (informational; used for aria-busy)
  onOpenFile: () => void;
  onSave: () => void;                                    // NEW
  onToggleAutoSave: (next: boolean) => void;             // NEW
  onSetViewMode: (mode: ViewMode) => void;
  onToggleTheme: () => void;
};
```

**Layout** (left to right):
1. **Save** button (icon + label "Save"). `disabled={!saveEnabled}`. `aria-busy={saving}`. Calls `onSave()` on click.
2. **Auto-save** checkbox, wrapped in a `<label>` with the visible text "Auto-save". `checked={autoSave}`. Calls `onToggleAutoSave(event.target.checked)` on change. Always enabled — even when `saveEnabled === false` — per FR-014.
3. **Open** button (icon + label "Open"). Unchanged from Feature 003.
4. **View-mode** segmented control. Unchanged from Feature 003.
5. **Theme** toggle. Unchanged from Feature 003.

The Save / Auto-save group sits on the **left** so the "I want to write to disk" affordances are the first thing a user reaching for the toolbar sees. Open sits in the middle (still primary chrome, still discoverable). View-mode and theme stay on the right, where Feature 003 placed them.

**Behavior**:
- Save button uses the existing `buttonBase` class chain. Disabled state adds `opacity-50 cursor-not-allowed` (or whatever the existing visual disable cue is) and sets the native `disabled` attribute AND `aria-disabled="true"`.
- Auto-save uses a real `<input type="checkbox">` inside a `<label>` so the whole label is clickable. No custom checkbox styling beyond an islands-style ring and accent. The checkbox uses the existing `--islands-*` palette via Tailwind's `accent-[color:var(--islands-cursor)]` (or equivalent).
- All other controls behave exactly as in Feature 003.

**Accessibility**:
- Save button: real `<button>`, visible "Save" label, `aria-busy={saving}` while a write is in flight.
- Auto-save: real `<input type="checkbox">` inside a `<label>` whose contents are "Auto-save" — accessible name is the label text. No `aria-label` needed because the label is visible.
- All other accessibility behaviour carried over from Feature 003.

**Contract assertions**:
- Toolbar holds no state of its own. It is a pure function of its props.
- Toolbar does NOT call `preferences.*`, `fileOpen.*`, or any Tauri API directly. All side effects flow through the handlers App passes in.
- Toolbar does NOT import any icon-library package — icons are inline SVG (one new "save" icon joins the existing folder-open, sun, moon icons).
- The auto-save checkbox is visible whether or not `saveEnabled` is true (FR-014).

---

## `<ErrorBanner />` (UNCHANGED from Feature 003)

No code changes. The same component now also surfaces save errors via the same `error: string | null` state field in App. The trigger set widens; the component contract does not.

---

## `<Workspace />` (UNCHANGED from Feature 003)

No prop changes, no code changes. The header and Save button live in the App shell above Workspace; view-mode switching is still purely a Workspace concern; the editor's content is still passed in as `text` (which now happens to track modifications, but that's invisible to Workspace).

---

## `<Editor />` (UNCHANGED from Features 002 / 003)

No prop changes. The existing prop-driven `value` sync correctly handles the post-save case (no-op — `text` is unchanged after save) and the post-open case (full replacement — already exercised in Feature 003).

---

## `<Preview />` (UNCHANGED from Features 002 / 003)

No prop changes.

---

## `lib/preferences.ts` (UPDATED from Feature 003)

**File**: `src/lib/preferences.ts`

**Role**: The single chokepoint for reading and writing user preferences. Extends Feature 003's three-pref namespace (`markpad.theme`, `markpad.viewMode`) with one new key (`markpad.autoSave`).

**New exports**:

```ts
export function getAutoSave(): boolean;
export function setAutoSave(on: boolean): void;
```

**Existing exports** (unchanged): `getTheme`, `setTheme`, `getViewMode`, `setViewMode`, type `Theme`, type `ViewMode`.

**Behavior**:
- `getAutoSave()`:
  1. Read `localStorage.getItem("markpad.autoSave")` inside a try/catch.
  2. If the value is the literal string `"on"`, return `true`.
  3. If the value is the literal string `"off"`, return `false`.
  4. For any other value (including `null` and any malformed entry), return `false` (the documented default — FR-020).
  5. If `localStorage` throws (storage disabled, quota), the catch returns `false`.
- `setAutoSave(on)`:
  - No validation on `on` because the TypeScript signature already constrains it to a boolean.
  - Writes `localStorage.setItem("markpad.autoSave", on ? "on" : "off")` inside a try/catch.
  - A write failure is logged via `console.warn` but does not throw to the caller — same best-effort pattern as `setTheme` / `setViewMode`.

**Contract assertions**:
- Only this module imports/calls `localStorage`. Reviewers can grep for `localStorage` to confirm. (Carried over from Feature 003. The `index.html` bootstrap script is the documented exception — it reads `markpad.theme` directly because it must run before any module loads. The bootstrap script does NOT read `markpad.autoSave`, because auto-save has no first-paint impact.)
- All six functions are synchronous and safe to call during React render or in `useState` initialisers.
- The whitelist for `autoSave` is duplicated as a runtime check, so a hand-edited storage entry cannot poison the app — it just falls back to `false`.

---

## `lib/fileOpen.ts` (UPDATED from Feature 003)

**File**: `src/lib/fileOpen.ts`

**Role**: Single chokepoint for Tauri's dialog, fs, and window APIs. **The header comment is updated** to reflect that the module now also handles writes:

```ts
// Single chokepoint for Tauri's dialog, fs (read AND write), and window APIs.
// No other module in the app should import @tauri-apps/plugin-dialog,
// @tauri-apps/plugin-fs, or @tauri-apps/api/webviewWindow — grep for those
// module names to verify.
```

**New exports**:

```ts
export type SaveResult =
  | { kind: "ok" }
  | { kind: "error"; message: string };

export async function saveMarkdownFile(
  path: string,
  content: string,
): Promise<SaveResult>;
```

**Existing exports** (unchanged): `openMarkdownFile`, `setWindowTitle`, types `OpenResult`, `friendlyMessage` (internal).

**Behavior of `saveMarkdownFile`**:
1. Call `writeTextFile(path, content)` from `@tauri-apps/plugin-fs` inside a try/catch.
2. On success, return `{ kind: "ok" }`.
3. On any thrown error, log the raw error via `console.warn` (for debugging) and return `{ kind: "error", message: friendlyMessage(err) }`. The same `friendlyMessage` helper Feature 003 introduced handles the common cases (permission denied, file not found / vanished); unknown errors fall back to a generic write-failure message.

**Contract assertions**:
- This is still the only module that imports `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`, or `@tauri-apps/api/webviewWindow` — now extended to cover `writeTextFile`. Reviewers can grep for those module names to confirm.
- `saveMarkdownFile` never throws — it always resolves to one of the two discriminated-union variants. Callers do not need a try/catch.
- The function does NOT show any dialog. It only writes. A "Save As" affordance (which would show a dialog) is explicitly out of scope.
- The `path` parameter MUST be a path the user previously picked via `openMarkdownFile` (and that the Tauri 2 dialog-scope mechanism has consequently granted write access to). Callers must not synthesise paths. The function does not validate this — it lets the Tauri scope mechanism reject unauthorised paths through the normal error path.

**Note on `friendlyMessage` reuse**: Feature 003's `friendlyMessage` already maps "permission denied" and "not found" to user-readable strings. Those mappings apply unchanged to write errors. The generic fallback message ("Could not open this file…") will fire for write-specific errors (disk full, read-only volume). That message is technically slightly wrong wording in a save context — implementers MAY split the helper into `openErrorMessage` and `saveErrorMessage` with separate generic fallbacks if it bothers them, but it is not required by acceptance. The cheap path is to make the generic fallback context-agnostic: `"Could not save this file. The location may be read-only or out of space."` for the save call, and leave the open path's wording alone. The exact split is an implementation detail; the discriminated-union shape is the binding contract.

---

## Tauri configuration changes

### `src-tauri/capabilities/default.json`

Extend `permissions` to include `fs:allow-write-text-file`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file"
  ]
}
```

This grants `writeTextFile` access exactly to paths the user has explicitly opened via the dialog (Tauri 2's "scoped path" mechanism — the dialog plugin attaches a scope to the dialog-returned path that the fs plugin then honours).

### `src-tauri/src/lib.rs` — UNCHANGED

`tauri_plugin_fs` is already registered. No change needed.

### `src-tauri/Cargo.toml` — UNCHANGED

`tauri-plugin-fs = "2"` is already present. No change needed.

### `package.json` — UNCHANGED

`@tauri-apps/plugin-fs` is already in `dependencies`. No change needed.

### `index.html` — UNCHANGED

The bootstrap script reads only `markpad.theme` (for the no-flash-of-wrong-theme effect). Auto-save has no first-paint impact, so the bootstrap does not read `markpad.autoSave`. No change needed.

---

## UI acceptance contract (cross-cutting)

A reviewer verifying this feature visually should be able to confirm, in order:

1. The application opens to a workspace that contains everything from Features 002 and 003 PLUS, at the very top, an "islands" header row that reads `Untitled`. No asterisk. Hovering shows the tooltip "No file open".
2. Below the header, the toolbar now has: Save (disabled, greyed out), an Auto-save checkbox (unchecked), then Open / view-mode / theme as in Feature 003.
3. Clicking Open and picking a markdown file: the header now reads the file's basename (no asterisk). Hovering the file name shows the full absolute path. The Save button is now enabled.
4. Typing any change in the editor: the header gains an asterisk prefix. The Save button is enabled. Auto-save remains off; nothing is written to disk yet.
5. Clicking Save: the asterisk clears from the header (within ~1 s). Confirming on disk via an external file manager shows the typed change is now in the file.
6. Saving an unchanged file (no edits since last save): the operation either silently succeeds or the button visibly indicates "nothing to save" (per spec FR-003 AS2); the on-disk file is unchanged.
7. Picking Open on a file that, between picking and reading, has been made read-only or moved (manual setup): the save fails through the standard error banner, the editor's content is preserved, the asterisk stays, and the banner can be dismissed.
8. Ticking the Auto-save checkbox: nothing happens immediately. Typing a change: the asterisk appears, then ~1.5 s after the user stops typing the asterisk clears (file was auto-saved). Confirming on disk shows the typed change.
9. With Auto-save still on and a file still open, restarting the application: the file is NOT reopened (out of scope), but the Auto-save checkbox is still checked. Opening a file and typing: auto-save still fires after the same idle interval.
10. Switching view modes (editor / preview / split) and toggling theme: the FileHeader stays visible at all times and re-skins to match the current theme. Save / auto-save state survives all switches unchanged.
11. With Auto-save off, typing, and clicking the auto-save checkbox ON without typing further: the implementation MAY immediately save the pending change OR wait for the next keystroke + debounce. Either is acceptable per spec; no edits are lost.
12. Toggling Auto-save OFF mid-session: any pending debounced save is cancelled. Continuing to type does NOT auto-save until the box is ticked again.
