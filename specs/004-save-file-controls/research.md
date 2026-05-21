# Phase 0 — Research: Save Controls and Active File Header

This document resolves the open technical questions for Feature 004. Each section captures the **decision**, the **rationale**, and the **alternatives considered**, so future contributors can re-open a choice with full context. Foundations laid by Feature 002 (CodeMirror 6 editor, markdown-it+DOMPurify preview, Tailwind CSS v4 islands aesthetic, prop-drilled React state) and Feature 003 (Open file via `tauri-plugin-dialog` + `tauri-plugin-fs`, theme + view-mode preferences in `localStorage`, single chokepoints in `src/lib/preferences.ts` and `src/lib/fileOpen.ts`) are assumed; this feature extends them.

## 1. Deriving the "modified" state — store `savedText`, compute the flag

**Decision**: Hold the last-successfully-saved text as a new `useState` field `savedText` in `App.tsx`, initialised to the same value `text` is initialised with (`starterContent`). After a successful open, set `savedText = openedContent`. After a successful save (manual or auto), set `savedText = textAtSaveTime`. The modified flag is **not stored** — it is computed at render time as `isModified = text !== savedText` and passed down to `<FileHeader />` and `<Toolbar />` as a derived prop.

**Rationale**:
- A single source of truth (`savedText`) means there is exactly one place that has to be updated when the document hits disk; nothing else can drift. The classic "modified flag stuck on after save" bug becomes structurally impossible — there is no separate flag to forget to clear.
- The derivation is cheap. `text !== savedText` on each render is a string-identity compare; React renders only run when state changes; the editor's text is already in React state for the preview.
- Behaviour is automatically correct for every edit pathway — keystroke, paste, undo, programmatic replace, open-replaces-text — because the entire mutation surface goes through `setText`.
- Pure derivation also gives FR-006 ("track a 'modified since last successful save' state") and FR-009 (header shows the indicator iff modified) for free, with no extra wiring.

**Alternatives considered**:
- **A separate `isModified: boolean` flag**: requires updating at three call sites (open, edit, save) and creates a class of bugs where the flag and the underlying text fall out of sync. Rejected for the same reason React encourages derived data.
- **`useReducer` with explicit `OPEN`, `EDIT`, `SAVE` actions**: more code, same outcome. The reducer pattern earns its keep when several related fields move together; here only one field (`text`) moves and one (`savedText`) snapshots it on save.
- **A "dirty" counter that increments on every keystroke**: pointless; the spec needs a boolean, not a count.

**Implementation notes**:
- `savedText` lives alongside `text` in `App.tsx`. Both are plain `useState<string>`.
- The "no file open" case: when `openedFile === null`, the Save control is disabled and `isModified` is still computed but does not surface in the header (because the header shows `Untitled` without an asterisk — FR-008 is silent on a modified marker for the empty state, and showing one would be misleading since there is no file to save).
- After a successful auto-save, `savedText` is set to the snapshot of `text` at the moment the write was kicked off — not the current `text`. If the user typed more characters while the write was in flight, those characters legitimately remain unsaved and the modified flag remains true. The next auto-save cycle handles them.

---

## 2. Auto-save: trailing-edge debounce inside one `useEffect`

**Decision**: Implement auto-save as a single `useEffect` in `App.tsx` keyed on `[text, autoSave, openedFile?.path, savedText, saving]`. When `autoSave === true` AND `openedFile !== null` AND `isModified` AND `!saving`, schedule a `setTimeout(performSave, 1500)`. The effect's cleanup function calls `clearTimeout`. The 1500 ms interval is the midpoint of the spec's 1–3 s allowance and well inside SC-004's 5 s budget.

**Rationale**:
- A trailing-edge debounce is exactly the spec's "save shortly after the user stops typing" requirement (FR-013, US3 AS2). React's `useEffect` cleanup gives us cancel-on-rerender for free, so a flurry of keystrokes coalesces to a single timer.
- Keying on `text` ensures every keystroke resets the timer. Keying on `autoSave` and `openedFile?.path` ensures the timer is cancelled when the user toggles auto-save off (FR-017) or opens a different file. Keying on `saving` ensures we never schedule a second write while one is in flight.
- 1500 ms is unobtrusive enough that bursty typing doesn't churn (the spec assumes 1–3 s) and short enough that the user perceives "saved" almost as soon as they pause (well inside SC-004's 5 s). Anything below ~500 ms starts to feel like per-keystroke writes; anything above ~3 s starts to feel forgetful.
- No external debounce library is needed. `setTimeout` + `clearTimeout` inside `useEffect` is the canonical React idiom; ~12 lines including comments.

**Alternatives considered**:
- **`lodash.debounce` / `use-debounce` / similar**: a new runtime dep for an idiom React expresses natively. Rejected on dependency justification (Principle I, constitution Tech Constraints).
- **A custom `useDebouncedSave()` hook**: fine in principle, but premature abstraction at one call site. Extract the hook when a second consumer appears.
- **Leading-edge debounce** (save immediately, then suppress further saves for an interval): doesn't match user expectation. The user pauses to think — saving while they're still composing is the opposite of helpful.
- **Save on a fixed interval** (e.g., every 10 s regardless of typing): churns disk when nothing changed, fails to capture the "I just typed something important" moment.
- **Save on focus loss / window blur / view-mode change**: explicitly out of scope per spec ("Auto-save fires only on idle… does NOT fire on focus loss, on view-mode switch, on theme toggle…"). Listed as candidates for follow-up.

**Implementation notes**:
- The effect's body sketch (pseudocode):
  ```ts
  useEffect(() => {
    if (!autoSave) return;
    if (openedFile === null) return;
    if (text === savedText) return;
    if (saving) return;
    const id = setTimeout(() => { void performSave(); }, 1500);
    return () => clearTimeout(id);
  }, [text, autoSave, openedFile, savedText, saving]);
  ```
- `performSave` is the same function the manual Save button calls. It is the single place that handles the in-flight flag, the actual `writeTextFile`, the success path (clear modified), and the error path (set the error banner, leave modified true).
- The 1500 ms constant lives in `App.tsx` as a named local (`AUTO_SAVE_DEBOUNCE_MS = 1500`). Not exposed as a user setting; the spec explicitly says the interval is "an implementation choice within reasonable bounds and does not need to be exposed to the user."

---

## 3. Concurrency: serialise writes via an in-flight flag + ref mutex

**Decision**: Track `saving: boolean` in React state and a `pendingSaveRef: { current: boolean }` ref. `performSave()` does the following:
1. If `saving` is already true, set `pendingSaveRef.current = true` and return immediately.
2. Otherwise, set `saving = true`, snapshot `text` as `outboundText`, call `saveMarkdownFile(path, outboundText)`.
3. On resolve: set `savedText = outboundText` (clears modified). On reject: set the error banner; do NOT update `savedText`.
4. Finally: set `saving = false`. If `pendingSaveRef.current` is true, clear it and immediately schedule another `performSave()` so the latest text gets a chance to be written.

This is the simplest correct mutex for a single-renderer webview with at most two concurrent triggers (manual save click + auto-save timer). It satisfies FR-018 (at most one effective write per logical save) and SC-005 (100 consecutive auto-save cycles with no corruption / partial / duplicate writes).

**Rationale**:
- The webview's JS engine is single-threaded; the only concurrency comes from awaiting `writeTextFile`. Between scheduling and resolution, the `saving` flag is enough to prevent a second JS-side write from being initiated.
- The "pending follow-up" ref handles the case where the user types during an in-flight save: the post-write check kicks off one more write so the latest text reaches disk. Without this, a user typing during auto-save would have their last keystrokes stuck in memory until the next debounce fired (which would also be cancelled-then-rescheduled by their typing — eventually convergent but slower).
- Coalescing concurrent requests into one follow-up write — not a queue — directly implements the spec's "at most one effective write per logical save". Two concurrent triggers do NOT produce two disk writes; they produce one write of the latest text, plus optionally one more if more text arrived during that write.
- Using a `ref` (not state) for `pendingSaveRef` avoids a re-render and a render-loop hazard. The ref's value is read inside the `finally` block of `performSave`, which is already inside an event handler / effect; no React subscription is needed.

**Alternatives considered**:
- **A queue (`Array<{ text, resolve }>`)**: collects every save request and writes each one in order. Over-engineered for this feature; two queued writes of the same text waste a disk write, and the spec only requires the file to end up correct, not that every requested save be honoured.
- **A `Promise`-chain mutex** (each call awaits the previous): correct but doesn't coalesce — N concurrent triggers produce N writes. Wasteful, and fails the spec's "at most one effective write per logical save" reading.
- **No serialisation, trust the OS**: `writeTextFile` on most platforms is not atomic for large files, and two overlapping writes can interleave bytes. Rejected outright.
- **Atomic write via temp file + rename**: would require a custom Rust command (Tauri's `plugin-fs` does not currently expose atomic rename in its public API for arbitrary paths). The added code, capability, and platform-specific edge cases (Windows rename-over-existing semantics, macOS resource forks) are not worth it for the 100 KB / 1 MB scale this spec calls out. Re-open this decision if real-world reports of corruption arrive.

**Implementation notes**:
- The Save button's `disabled` prop is `openedFile === null || saving`. While the write is in flight (typically <100 ms for ≤1 MB files), the button is disabled. The disabled state acts as visual feedback that a save is happening.
- The auto-save `useEffect` already keys on `saving`, so it never schedules a write while one is in flight. The post-write check in `performSave` is what wakes it up when the in-flight save completes with newer text waiting.
- "Snapshot `text` as `outboundText`" matters: we must save the value of `text` at the moment we kicked off the write, not at the moment it resolves. If we update `savedText` to the *current* `text` post-resolve, we'd falsely clear the modified flag for text the user typed during the write.

---

## 4. Persisting the auto-save preference

**Decision**: Store under `localStorage["milf.autoSave"]` as the string `"on"` or `"off"`. Reuse the `preferences.ts` module: add `getAutoSave(): boolean` and `setAutoSave(on: boolean): void`. Default is `false` ("off") for first-launch and for any unreadable / unrecognised stored value, per FR-019 and FR-020. The exposed type is `boolean` (cleaner caller API); the on-disk encoding is `"on" / "off"` (cleaner human-debuggable storage and matches the existing pattern of writing string enums, not booleans).

**Rationale**:
- Reusing `preferences.ts` is mandated by Principle VIII (single chokepoint for `localStorage`) and by the existing module comment. Adding a third preference is one short function pair; no new file.
- The `"on" / "off"` encoding is consistent with Feature 003's `"light" / "dark"` and `"editor" / "preview" / "split"`. A reader looking at the localStorage panel in devtools sees three string values, not "true / false / editor / dark" — same shape across keys.
- Defaulting to OFF on first launch matches user expectation for a feature most people will discover and enable deliberately. It also matches FR-020's "if the preference cannot be read, fall back to OFF" — same semantics for "unknown" and "explicitly off".
- The internal `getAutoSave` returns a `boolean` so callers in `App.tsx` can use it directly in `useState<boolean>` and `if (autoSave) …` without an extra mapping.

**Alternatives considered**:
- **Store as the literal string `"true" / "false"`**: works, but mixes string-with-boolean-semantics into a module whose other functions return string enums. Pick one shape.
- **Default to ON**: rejected. A user who doesn't understand auto-save would have their files silently overwritten on first edit — friction at the wrong moment for a first-time user.
- **Store on the Rust side via `plugin-store` or a custom command**: same trade-offs as Feature 003 §1 evaluated — overkill for one scalar boolean. Re-open if we ever need to share preferences between webview and Rust.

**Implementation notes**:
- `preferences.ts` gains:
  ```ts
  const AUTO_SAVE_KEY = "milf.autoSave";
  const ALLOWED_AUTO_SAVE = ["on", "off"] as const;

  export function getAutoSave(): boolean {
    try {
      const stored = window.localStorage.getItem(AUTO_SAVE_KEY);
      if (stored === "on") return true;
      if (stored === "off") return false;
    } catch { /* fall through */ }
    return false;
  }

  export function setAutoSave(on: boolean): void {
    try {
      window.localStorage.setItem(AUTO_SAVE_KEY, on ? "on" : "off");
    } catch (err) {
      console.warn("Failed to persist auto-save preference:", err);
    }
  }
  ```
- App initialises `const [autoSave, setAutoSaveState] = useState<boolean>(() => getAutoSave())` — same lazy initialiser pattern as theme and view mode.
- `handleToggleAutoSave(next)` sets local state and calls `setAutoSave(next)`, mirroring `handleToggleTheme` from Feature 003.

---

## 5. Writing the file: `tauri-plugin-fs.writeTextFile` + the matching capability

**Decision**: Save via `writeTextFile(path, content)` imported from `@tauri-apps/plugin-fs` (already installed in Feature 003). The matching capability `fs:allow-write-text-file` is added to `src-tauri/capabilities/default.json` alongside the existing `fs:allow-read-text-file`. Wrap the call in a new `saveMarkdownFile(path: string, content: string): Promise<SaveResult>` exported from `src/lib/fileOpen.ts`, returning a discriminated union (`{ kind: "ok" } | { kind: "error", message }`). Update the module's header comment from "open" to "the Tauri dialog, fs, and window APIs" — the module is already the chokepoint for all three.

**Rationale**:
- `writeTextFile` is the symmetric partner of `readTextFile` we already use for open. Same plugin, same scope mechanism (Tauri 2 scopes the path the user picked via the dialog; reading and writing that path are both governed by the explicit capability flags). No new dependency, no new dialog, no custom command.
- `fs:allow-write-text-file` is the narrowest available permission for this operation. Granting `fs:default` opens an array of operations we don't use; granting `fs:allow-write-file` permits binary writes we don't need. The narrow permission keeps Principle VI tight.
- The discriminated-union return type forces callers to handle the error branch (which is the only branch besides success — there is no "cancelled" because the user already picked the file via Open; we are writing to the previously-known path).
- Keeping every Tauri import in `fileOpen.ts` (and updating the comment to match) preserves the chokepoint Principle VIII established. A reviewer can still grep `@tauri-apps/plugin-fs` and find exactly one importing module.

**Alternatives considered**:
- **A separate `src/lib/fileSave.ts` module**: splits the chokepoint into two files for purely organisational reasons. Rejected — the chokepoint principle is about *containment* (one place to grep), not *file count*.
- **A new Rust command `save_markdown_file(path, content)`**: more code (Rust + IPC wrapper + a registered handler) for no extra capability or behaviour. Re-open only if we adopt atomic write semantics that the plugin doesn't expose.
- **Encode the file with an explicit encoding parameter**: `writeTextFile` writes UTF-8 by default, which matches `readTextFile`'s UTF-8 read. The spec assumes UTF-8 round-trip (Feature 003); we do not introduce encoding choice here.
- **Auto-create a backup `.bak` file before writing**: out of scope. The spec explicitly lists crash recovery / backups as candidates for a follow-up feature.

**Implementation notes**:
- `saveMarkdownFile` shape:
  ```ts
  export type SaveResult =
    | { kind: "ok" }
    | { kind: "error"; message: string };

  export async function saveMarkdownFile(
    path: string,
    content: string,
  ): Promise<SaveResult> {
    try {
      await writeTextFile(path, content);
      return { kind: "ok" };
    } catch (err) {
      console.warn("Failed to save file:", err);
      return { kind: "error", message: friendlyMessage(err) };
    }
  }
  ```
- `friendlyMessage` already exists in `fileOpen.ts` for the open path. Its existing mappings (permission denied, not found) apply unchanged to write errors. A generic write failure message is the fallback; the spec only requires "plain language" (FR-004).
- The capability JSON entry is exact, not wildcarded:
  ```json
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file"
  ]
  ```
- No change to `src-tauri/src/lib.rs`; the plugin is already registered.

---

## 6. Active-file header: placement, truncation, and tooltip

**Decision**: A new `<FileHeader />` component placed **above** the `<Toolbar />` inside the `<App />` shell — the very top row of the workspace, outside the workspace card itself. The header shows the file's basename (or `Untitled` when no file is open), an asterisk prefix when modified, and the full absolute path in a `title` attribute (native browser tooltip on hover). Long names are truncated with `text-ellipsis` + `overflow-hidden` on a `min-w-0` flex parent; the tooltip surfaces the untruncated full path. The header inherits the islands styling — same surface and ring colours as the toolbar — but has no buttons and no interactivity beyond the hover tooltip.

**Rationale**:
- Placing the header above the toolbar matches Feature 003's "the user scans the chrome top-down" rationale (research.md §7). The order from top to bottom becomes: file name → controls → error → workspace. The user sees *what they are editing* before they see *how they can edit it*.
- A separate component (not a slot inside Toolbar) keeps each component single-purpose: Toolbar is interactive controls; FileHeader is informational state. They render side by side in the App tree, both leaves.
- The asterisk-prefix convention is what every major desktop text editor uses (VS Code, Sublime, Notepad++, TextEdit). The spec explicitly endorses the asterisk convention in Assumptions.
- `title` attribute is the simplest portable tooltip — no library, no custom hover logic, no positioning bugs at narrow widths. It is the same affordance every browser's URL bar uses for truncated URLs. The spec says progressive disclosure is the assumed pattern and does not prescribe a specific mechanism.
- The header MUST stay visible across view modes (FR-011): putting it outside `<Workspace />` ensures Workspace's internal layout never hides it. The view-mode segmented control is itself inside Toolbar, not Workspace, for the same reason.

**Alternatives considered**:
- **Put the file name inside `<Toolbar />` as a non-interactive label on the right**: mixes informational and interactive concerns in one component, eats horizontal space that the controls need on narrow widths, and bloats the Toolbar past its single-purpose ceiling.
- **Bottom status bar (file name at the very bottom of the window)**: more "IDE-like", but the spec explicitly says "top of the workspace". Also adds a new horizontal band at a less-natural read-first location.
- **Inside the editor pane (above the CodeMirror surface)**: would disappear in preview-only mode (FR-011 violation).
- **A custom React-managed tooltip with positioning logic**: nice-to-have; not required by the spec; would add ~30 lines and a hover state machine for a feature where the native `title` attribute already works.
- **Marquee or fade-truncation instead of ellipsis**: novelty without benefit; ellipsis + tooltip is the universal pattern.

**Implementation notes**:
- Component shape:
  ```tsx
  type FileHeaderProps = {
    fileName: string | null;
    fullPath: string | null;
    isModified: boolean;
  };
  ```
- The display string is `(isModified && fileName ? "* " : "") + (fileName ?? "Untitled")`. The asterisk is suppressed when `fileName === null` (i.e., no file open) because there is no file to be "modified relative to".
- Truncation: container is `flex items-center gap-2 min-w-0`; the file-name span is `truncate` (Tailwind shorthand for `overflow-hidden text-ellipsis whitespace-nowrap`). The tooltip target is the file-name span; `title={fullPath ?? "No file open"}`.
- Accessibility: the header uses `role="status"` with `aria-live="polite"` so screen readers announce file-name changes (open → save → switch) without interrupting. The visual modified indicator is paired with `aria-label="modified"` on the asterisk span so it isn't just visual.

---

## 7. Save button placement and visual state

**Decision**: Add the Save button to the left of the existing Open button inside `<Toolbar />`, with the auto-save checkbox immediately to its right (so the two save-related affordances sit together). The Save button is disabled when `openedFile === null` OR `saving === true`. The auto-save checkbox is always visible (FR-014: "the toggle remains visible and its setting is retained for the next time a file is opened") and its checked state is bound to the `autoSave` boolean. Saving is reflected by the Save button's disabled state — no separate spinner — because typical save durations are under 100 ms and a spinner would barely render.

**Rationale**:
- Grouping the two save controls together makes them legible as a pair: "Save now" and "Save automatically". The Open button stays to their right (or left of the view-mode segmented control — exact left-to-right order is a layout detail finalised in `contracts/components.md`).
- Disabling the button when no file is open implements FR-005 unambiguously. The disabled state is communicated via the standard `disabled` attribute (browser-native styling cue) plus a reduced opacity in the existing islands button class.
- The auto-save checkbox stays visible even with no file open (FR-014). Its setting is retained; it just has no observable effect until a file is opened. This avoids the "the checkbox disappeared, did my setting get lost?" confusion.
- A separate spinner for `saving` is over-engineered for the 100 KB / 1 MB scale. The button's disabled state already prevents a second click; the modified marker clearing on success is the user-visible confirmation. SC-001 (1 s budget) and SC-008 (responsive at 1 MB) both put saves well inside spinner-noise territory.

**Alternatives considered**:
- **A floating Save button (like Google Docs' cloud icon)**: more iconography to design, less discoverable. The spec calls for a "clearly discoverable Save control in the primary chrome" (FR-001) — a labelled toolbar button is the path of least surprise.
- **A spinner / progress indicator on the Save button while saving**: nice-to-have, not required by the spec, and would re-render constantly for sub-100 ms operations. Add only if telemetry shows saves taking long enough for it to register.
- **Two separate buttons "Save" and "Save & Auto"**: confuses the model. Auto-save is a preference, not an alternate save action.
- **Hide the auto-save checkbox when no file is open**: fails FR-014 and creates the "where did my toggle go?" problem.

**Implementation notes**:
- Toolbar props grow to:
  ```ts
  type ToolbarProps = {
    viewMode: ViewMode;
    theme: Theme;
    autoSave: boolean;
    saveEnabled: boolean;     // computed by App: openedFile !== null && !saving
    saving: boolean;          // for ARIA / future spinner
    onOpenFile: () => void;
    onSave: () => void;
    onToggleAutoSave: (next: boolean) => void;
    onSetViewMode: (mode: ViewMode) => void;
    onToggleTheme: () => void;
  };
  ```
- The Save button uses the same `buttonBase` Tailwind class chain Open uses. The disabled state adds `opacity-50 cursor-not-allowed` and `aria-disabled="true"` plus the native `disabled` attribute.
- The auto-save control is a `<label>` wrapping a real `<input type="checkbox">` so the checkbox + label are clickable as a unit and accessible by default. No custom checkbox styling beyond the islands ring.

---

## 8. Error path: reuse `<ErrorBanner />`

**Decision**: Save failures (manual and auto) surface through the same `error: string | null` state field and `<ErrorBanner />` component Feature 003 introduced. The `friendlyMessage` helper in `fileOpen.ts` already handles permission-denied and not-found cases; its existing mappings apply to write errors unchanged. No second banner, no banner stack, no distinction between "open failed" and "save failed" — one error at a time is the right grain.

**Rationale**:
- Feature 003's research §6 deliberately chose a single dismissible banner over a toast system; that choice still holds. Save failures are infrequent and the user is at the keyboard when they occur — interrupting nothing is the right behaviour.
- Routing both error types through the same `setError` call site means the banner is a single point to evolve later (icons, retry button, etc.) without scattering state.
- The user can distinguish save-fail from open-fail from the message text: open errors mention opening, save errors mention saving. No structural distinction is needed in the state.

**Alternatives considered**:
- **A separate save-error banner with retry**: nice-to-have; not required by the spec. Could be added later by extending the existing banner with an optional `actions` prop.
- **A toast / notification queue**: rejected for the same reason Feature 003 rejected it.
- **A modal dialog on save failure**: interrupts the user — exactly what the spec says to avoid.

**Implementation notes**:
- On save success, `setError(null)` clears any previous save / open error.
- On save failure, `setError(result.message)` shows the banner. The modified marker is intentionally NOT cleared (FR-004) so the user can see the file is still out of sync.
- No change to `<ErrorBanner />`'s code.

---

## 9. Cross-cutting interactions: open replaces buffer, view-mode unchanged, theme unchanged

**Decision**: Three small invariants worth stating up front:

1. **Open after edits**: Feature 003 already replaces the editor's text on open (no merge, no preserve). This feature does NOT silently auto-save before that replace, even if auto-save is on. Auto-save fires on idle, not on "about to discard buffer" (per spec Edge Cases). The user can lose unsaved edits by opening a different file with auto-save off and no prior save — this matches Feature 003's behaviour and the spec's explicit non-promise of crash recovery.
2. **View-mode switch**: the active-file header MUST be visible in all three modes (FR-011). Putting the header outside `<Workspace />` (in the `<App />` shell) makes this structural, not conditional.
3. **Theme switch**: the header, Save button, and auto-save checkbox MUST use the same `--islands-*` CSS variables as the rest of the chrome, so a theme flip from Feature 003 re-skins them automatically. No new theme tokens are introduced.

**Rationale**:
- These are not "research" decisions in the strict sense — they're invariants the spec implies but doesn't restate at every section. Capturing them here prevents the tasks phase from accidentally adding a "save before open" prompt or breaking the visible-across-modes guarantee.
- Tying header colours to the existing CSS variables means Feature 003's theme work continues to do its job without modification.

**Alternatives considered**:
- **Prompt-on-unsaved-edits before Open**: explicitly out of scope per spec Assumptions ("save-on-quit / prompt-on-quit-when-unsaved [are] candidates for follow-up features").
- **Different colour palette for the header (e.g., accent colour)**: violates the islands aesthetic and creates a new design token. Not warranted.

**Implementation notes**:
- The `handleOpenFile` in `App.tsx` (already exists) calls `setText(result.content)` AND now must also call `setSavedText(result.content)` so the freshly opened file is correctly considered unmodified. This is the only change needed in the existing open handler.
- After successful open, `setError(null)` is already called — no change.

---

## 10. Out-of-scope confirmations (re-stated from spec for the tasks phase)

These are intentionally **not** addressed in this feature; planning here ensures the tasks phase does not silently expand scope:

- **Save As / Save a Copy / "save to a different path"**: out of scope. Save always writes to the path Open returned.
- **New file from inside MILF / "create a fresh document"**: out of scope. The Save control is unavailable until a file is opened via Feature 003.
- **Prompt-on-quit when there are unsaved edits / save-on-blur / save-on-view-mode-switch**: out of scope. Auto-save fires only on idle.
- **Crash recovery / automatic backups / atomic write via temp file**: out of scope. The user is responsible for saving (or enabling auto-save) before quitting.
- **Detecting external file changes / "reload from disk" / file watch**: out of scope. The next save trusts the path Open returned; if the file moved or was modified by another program, save fails through the standard error path.
- **Restoring the last opened file at launch / persisting the open-file path**: out of scope (still — same status as Feature 003).
- **Keyboard shortcut for Save (Ctrl/Cmd+S)**: not required and not prohibited. Implementers MAY add it for free; it is not part of acceptance.
- **Multiple documents / tabs / multiple windows editing different files**: out of scope.
- **Recent files list**: out of scope.
- **Wiring up ESLint / Prettier / test runner / CI**: still a pre-existing gap from 002 and 003; this feature does not regress it and does not address it.
