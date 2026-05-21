# Phase 1 — Data Model: Save Controls and Active File Header

This feature extends Feature 003's data model with two new pieces of session state (`savedText`, `saving`) and one new persisted preference (`autoSave`). It does not introduce any data on the Rust side. All extensions live in React state inside `App.tsx`; persistence is still webview `localStorage` through the existing `src/lib/preferences.ts` chokepoint.

## Entities

### Document — extended from Feature 002 / 003

The Document continues to be the `text` string in React state in `App.tsx`. This feature adds **one companion field** that snapshots the last-successfully-saved value, and **one derived projection** computed at render time.

| Field | Type | Default | Notes |
|---|---|---|---|
| `text` | `string` | `starterContent` | The editor's current text, unchanged from Features 002 / 003. Mutated by the editor, by Open (replaces wholesale), and by no one else. |
| `savedText` | `string` | `starterContent` | Snapshot of `text` at the moment of the last successful write to disk (or the moment of a successful Open, which counts as "in sync with disk" for a freshly loaded file). Mutated only by `handleOpenFile` (success branch) and by `performSave` (success branch). |

**Derived (not stored)**:

| Derivation | Type | Formula |
|---|---|---|
| `isModified` | `boolean` | `text !== savedText` |

`isModified` is computed at render time in `App.tsx` and passed down as a prop to `<FileHeader />` (drives the asterisk) and `<Toolbar />` (informs the disabled-when-clean affordance for Save — actually the Save button is disabled only when no file is open OR a save is in flight; saving an unchanged file is allowed per FR-003 Acceptance Scenario 2).

**Mutation surface — exhaustive list**:

| Trigger | Effect on `text` | Effect on `savedText` |
|---|---|---|
| User keystroke (CodeMirror → `onTextChange`) | overwritten with new value | unchanged |
| User paste | overwritten | unchanged |
| User undo / redo | overwritten | unchanged |
| Successful Open (`handleOpenFile` `kind: "ok"`) | replaced with file content | replaced with file content (file is in sync at this moment) |
| Successful Save (`performSave` resolves OK) | unchanged | set to the `text` snapshot the save was kicked off with |
| Failed Save (`performSave` rejects) | unchanged | unchanged (the on-disk file is, from MILF's perspective, still the previous saved value) |
| Cancelled Open dialog | unchanged | unchanged |
| Failed Open | unchanged | unchanged |
| Theme / view-mode / auto-save toggle | unchanged | unchanged |

**Validation rules**:
- Neither `text` nor `savedText` is validated for content. They are arbitrary user-controlled strings. The 1 MB scale referenced in SC-008 is a performance target, not a hard cap; the spec does not impose a maximum size.
- `text === savedText` is the canonical "clean" condition. Any other definition (heuristic dirty-tracking, edit count) is explicitly rejected (see `research.md` §1).

---

### Opened File Reference — unchanged from Feature 003

Feature 003 already defined this entity with the exact fields this feature needs:

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | Basename of the file. Shown in the active-file header (FR-007) and the OS window title (Feature 003 FR-007). |
| `path` | `string` | Absolute path returned by the dialog. Reused as the write target for Save (FR-002). |

`OpenedFileReference` is `null` when the editor holds starter content or content never associated with a file. The Save control is disabled in that state (FR-005); the header shows `Untitled` (FR-008).

**Mutation surface** (unchanged from Feature 003):
- Set by `handleOpenFile` on `kind: "ok"`.
- Never set to `null` once a file has been opened in the current session — opening a *different* file replaces it with a new `{ name, path }`. (No "Close file" affordance exists yet.)

This feature uses `openedFile.path` in exactly one place: `performSave` passes it to `saveMarkdownFile(path, content)`. The path is never displayed directly — only `openedFile.name` is shown in the header text; the full `path` is exposed via the header's hover tooltip (FR-010).

---

### Save State — NEW, session-only

A small piece of session state that drives the Save button's disabled state and the auto-save effect's gating condition.

| Field | Type | Default | Notes |
|---|---|---|---|
| `saving` | `boolean` | `false` | `true` between the moment `performSave` calls `saveMarkdownFile` and the moment that promise resolves (success or failure). Used to disable the Save button (FR-003 — don't block the editor, but DO prevent a second concurrent click from starting a second write) and to gate the auto-save effect (FR-018 — at most one effective write per logical save). |

**State transitions**:

```text
        idle (saving = false)
              │
        user clicks Save  OR  auto-save timer fires
              │
              ▼
        saving = true
              │
        saveMarkdownFile(path, text) resolves
              │
              ▼
        saving = false
        (+ if savedText !== text and pendingSaveRef.current is true,
           schedule another performSave to capture trailing edits)
```

Plus an auxiliary mutation-free signal — a React `ref`, not state — that lives outside the data model proper but is documented here for completeness:

| Ref | Type | Purpose |
|---|---|---|
| `pendingSaveRef` | `{ current: boolean }` | Set to `true` when a save was requested while another was already in flight. Read in the `finally` block of `performSave`; if true, kicks off one more save with the latest text. This is the "coalesce concurrent requests" half of `research.md` §3. Held as a ref (not state) so reading and writing it doesn't trigger renders. |

The ref is not part of the data model in the strict sense — it carries no user-visible information and no persistence semantics — but its presence is necessary for the spec's FR-018 guarantee.

---

### Preferences — extended from Feature 003

Feature 003 introduced `theme` and `viewMode`. This feature adds **one** new preference:

| Field | Type | Default | Notes |
|---|---|---|---|
| `theme` | `"light" \| "dark"` | resolved from system on first launch | Unchanged from Feature 003. |
| `viewMode` | `"editor" \| "preview" \| "split"` | `"split"` | Unchanged from Feature 003. |
| `autoSave` | `boolean` | `false` | FR-019, FR-020. Stored under `localStorage["milf.autoSave"]` as `"on"` / `"off"`. Exposed to TypeScript callers as `boolean`. |

**Validation rules** for `autoSave`:
- On read, any value other than the literal strings `"on"` or `"off"` (including `null`, malformed values, an old key the app no longer recognises) is treated as **absent** and the default `false` is used (FR-020). The app does not throw and does not block launch.
- On write, only `"on"` or `"off"` are written. Write failures (e.g., quota exceeded, storage disabled) MUST NOT crash the app — the change still applies in-memory for the current session and the next launch reverts to the previous persisted value. Same best-effort pattern as `theme` and `viewMode` in Feature 003.

**State transitions**:

```text
                       app launch
                            │
                            ▼
              read localStorage["milf.autoSave"]
                            │
              ┌────────────┴────────────┐
              ▼                         ▼
       valid value found        nothing valid stored
              │                         │
              ▼                         ▼
       autoSave = (stored === "on")    autoSave = false
              │                         │
              └────────────┬────────────┘
                            ▼
               user toggles checkbox
                            │
                            ▼
        autoSave = !autoSave  (boolean flip)
                            │
                            ▼
        write localStorage["milf.autoSave"] = "on" | "off"
                            │
                            ▼
        if autoSave === true AND openedFile !== null AND text !== savedText:
            the auto-save useEffect will (re-)schedule the next idle save
        else:
            no further automatic saves until conditions change
```

---

### Error Banner — unchanged from Feature 003

The single `error: string | null` field continues to drive the dismissible `<ErrorBanner />`. This feature widens the *set of triggers* — save failures (manual and auto) now also set `error` — but does NOT change the shape of the state or the component.

**State transitions** (extended from Feature 003 §Error Banner):

```text
        error = null
              │
              ▼
  ┌───────────────────────────────────────────────────────┐
  │  triggered by ANY of:                                 │
  │   - Open failed (Feature 003 path)                    │
  │   - Manual Save failed (NEW)                          │
  │   - Auto-save failed (NEW)                            │
  └────────────────────┬──────────────────────────────────┘
                       ▼
        error = <friendlyMessage(err)>     ── banner visible ──┐
                                                                │
                                       user clicks ✕            │
                                       user opens a different file successfully
                                       successful save (manual or auto)
                                                                │
                                                                ▼
                                                       error = null
```

Only one error is held at a time; a new error overwrites the previous one. Any successful Open or successful Save clears the banner.

---

## Relationships

```text
App
 ├── state: text                   (Document.text — unchanged)
 ├── state: savedText              (Document — NEW; snapshots `text` on open/save success)
 ├── state: openedFile             (OpenedFileReference — unchanged from 003)
 ├── state: theme                  (Preferences — unchanged from 003)        ──persisted──▶ localStorage["milf.theme"]
 ├── state: viewMode               (Preferences — unchanged from 003)        ──persisted──▶ localStorage["milf.viewMode"]
 ├── state: autoSave               (Preferences — NEW)                       ──persisted──▶ localStorage["milf.autoSave"]
 ├── state: saving                 (Save State — NEW)
 ├── state: error                  (Error Banner — extended trigger set)
 ├── ref:   pendingSaveRef         (Save State helper — NEW; not state)
 │
 ├── derived: isModified           = text !== savedText
 ├── derived: saveEnabled          = openedFile !== null && !saving
 │
 ├── effect: write data-theme to <html> when theme changes                   (unchanged from 003)
 ├── effect: setWindowTitle when openedFile changes                          (unchanged from 003)
 ├── effect: auto-save debounce when autoSave/openedFile/text/savedText/saving changes   (NEW)
 │
 ├── renders ──▶ FileHeader (NEW)
 │                ├── reads:  openedFile?.name, openedFile?.path, isModified
 │                └── emits:  nothing (informational only)
 │
 ├── renders ──▶ Toolbar
 │                ├── reads:  viewMode, theme, autoSave, saveEnabled, saving
 │                └── emits:  onOpenFile(), onSave(), onToggleAutoSave(next), onSetViewMode(mode), onToggleTheme()
 │
 ├── renders ──▶ ErrorBanner (when error !== null)
 │                ├── reads:  error
 │                └── emits:  onDismiss()
 │
 └── renders ──▶ Workspace (unchanged from 003)
                  ├── reads:  text, viewMode
                  ├── emits:  onTextChange(next)
                  ├── renders Editor       (always mounted; hidden in preview-only)
                  └── renders Preview      (mounted in split / preview-only)
```

Single-direction data flow throughout. The only side effects are the three `useEffect`s in App: the existing `<html data-theme>` write, the existing window-title call, and the new auto-save scheduler.

## Persistence summary

| Key | Value encoding | Decoded type | Default on read failure | Introduced by |
|---|---|---|---|---|
| `milf.theme` | `"light" \| "dark"` | string enum | system preference via `matchMedia` (fallback `"light"`) | Feature 003 |
| `milf.viewMode` | `"editor" \| "preview" \| "split"` | string enum | `"split"` | Feature 003 |
| `milf.autoSave` | `"on" \| "off"` | `boolean` (mapped at the chokepoint) | `false` | **Feature 004 (NEW)** |

All three keys are read on launch via the `preferences.ts` chokepoint. All three keys are written best-effort; write failures log via `console.warn` and do not crash.

## Non-entities (explicit)

These are NOT in the data model for this feature and should not be introduced silently in the tasks phase:

- **A separate `isModified: boolean` state field**. Modified state is derived from `text !== savedText`. See `research.md` §1.
- **A save queue / list of pending writes**. Concurrency is handled by `saving` + `pendingSaveRef`. See `research.md` §3.
- **A history of save attempts / "last saved at" timestamp**. Out of scope; the spec only requires the modified marker to track in-sync vs out-of-sync, not when the last sync happened.
- **A per-file auto-save preference**. The auto-save toggle is global, not per-file (FR-014 says the *toggle* is retained when no file is open, implying one shared setting).
- **A backup-file or temp-file record**. Atomic-write-via-temp is explicitly out of scope per `research.md` §3.
- **A persisted open-file path** ("reopen last file on launch"). Still out of scope (was also out of scope in Feature 003).
- **A Rust-side preference store or save log**. Preferences live in webview `localStorage`; saves go through `plugin-fs` with no Rust-side bookkeeping.
- **A "Save As" path**. Out of scope per spec Assumptions.
- **A "new file" buffer with no backing path that auto-save would write somewhere**. Out of scope per spec Assumptions and FR-014.
