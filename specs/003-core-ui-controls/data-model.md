# Phase 1 — Data Model: Core Workspace Controls

This feature adds a small amount of state on top of Feature 002's `Document`. The new state divides into two groups: **session state** (lives only in React for the current window — file name, error banner) and **persisted preferences** (mirrored to `localStorage` so they survive a relaunch — theme, view mode). No data lives on the Rust side.

## Entities

### Document (unchanged from Feature 002)

The `text` field continues to live in React state in `App.tsx`. This feature adds two new ways it can be mutated:

1. The "Open" flow replaces `text` wholesale with the contents of the chosen file.
2. The view-mode switch must not touch `text`.

See [Feature 002 data-model.md](../002-split-pane-editor-layout/data-model.md) for the full Document description. Nothing else about it changes here.

### Preferences (NEW, persisted)

A small, flat set of user choices that the app reads on launch and writes when the user changes them.

| Field | Type | Default | Notes |
|---|---|---|---|
| `theme` | `"light" \| "dark"` | resolved from system on first launch | FR-014, FR-016, FR-018. Stored under `localStorage["markpad.theme"]`. |
| `viewMode` | `"editor" \| "preview" \| "split"` | `"split"` | FR-008, FR-019. Stored under `localStorage["markpad.viewMode"]`. |

**Validation rules**:
- On read, any value outside the allowed set (including `null`, malformed JSON, an old key the app no longer recognises) is treated as **absent** and the documented default is used instead (FR-020). The app does not throw, and does not block launch.
- On write, only values from the allowed set are written. Writes are best-effort: a failure (e.g., quota exceeded, storage disabled) MUST NOT crash the app — the change still applies in-memory for the current session and the next launch reverts to the previous persisted value.

**State transitions**:

```text
                       app launch
                            │
                            ▼
              read localStorage["markpad.theme"]
                            │
              ┌────────────┴────────────┐
              ▼                         ▼
       valid value found        nothing valid stored
              │                         │
              ▼                         ▼
       theme = stored        theme = system preference
                                    via matchMedia
                                  (fallback: "light")
              │                         │
              └────────────┬────────────┘
                            ▼
               user clicks theme toggle
                            │
                            ▼
           theme = "light" ⇄ "dark"
                            │
                            ▼
        write localStorage["markpad.theme"]
        set <html data-theme="...">
```

The `viewMode` transition is the same shape, with the default branch returning `"split"` instead of a system query and the user action being one of three explicit choices instead of a toggle.

### Opened File Reference (NEW, session-only)

A lightweight record of which file currently backs the editor's content. This is **not persisted** — relaunching the app does not "remember the last file" (that is explicitly out of scope per spec Assumptions).

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | Basename of the file (no directory) — what is shown in the window title. |
| `path` | `string` | Absolute path returned by the dialog. Kept only so the window title and any future "Save" feature have somewhere to find it. Not displayed directly. |

`OpenedFileReference` is `null` when the editor holds starter content or unsaved user edits with no on-disk origin.

**State transitions**:

```text
        initial (starter content)
                  │
                  ▼
       openedFile = null
        title = "markpad"
                  │
        user picks file (success)
                  │
                  ▼
       openedFile = { name, path }
        title = `${name} — markpad`
                  │
        user picks another file
                  │
                  ▼
       openedFile = new { name, path }   (text replaced too)
        title = `${name} — markpad`
                  │
        user cancels dialog
                  │
                  ▼
        no change
                  │
        open fails (permission / not text / vanished)
                  │
                  ▼
        no change to openedFile or text
        error banner shown
```

There is intentionally **no "user has edited a loaded file" / dirty state** in this feature. Without a Save layer, "dirty" is not meaningful to the user. Adding it would be visible UX dead weight.

### Error Banner (NEW, session-only)

A single error string driven by the file-open path.

| Field | Type | Notes |
|---|---|---|
| `error` | `string \| null` | Human-readable message, e.g. "Could not open this file. It may not be a text file, or you may not have permission to read it." `null` means the banner is hidden. |

**State transitions**:

```text
        initial
          │
          ▼
       error = null
          │
       open fails (not cancel)
          │
          ▼
       error = <message>     ── banner visible ──┐
                                                  │
                                user clicks ✕ on banner
                                                  │
                                user opens a different file successfully
                                                  │
                                                  ▼
                                       error = null
```

Only one error is held at a time; a new error overwrites the previous one. Successful opens always clear it.

## Relationships

```text
App
 ├── state: text                  (Document.text — unchanged from 002)
 ├── state: theme                 (Preferences)         ──persisted──▶ localStorage["markpad.theme"]
 ├── state: viewMode              (Preferences)         ──persisted──▶ localStorage["markpad.viewMode"]
 ├── state: openedFile            (OpenedFileReference) ──session only
 ├── state: error                 (Error Banner)        ──session only
 │
 ├── effect: write data-theme to <html> when theme changes
 ├── effect: setWindowTitle when openedFile changes
 │
 ├── renders ──▶ Toolbar
 │                ├── reads:  theme, viewMode
 │                └── emits:  onOpenFile(), onSetViewMode(mode), onToggleTheme()
 │
 ├── renders ──▶ ErrorBanner (when error !== null)
 │                ├── reads:  error
 │                └── emits:  onDismiss()
 │
 └── renders ──▶ Workspace
                  ├── reads:  text, viewMode
                  ├── emits:  onTextChange(next)
                  ├── renders Editor       (always mounted; hidden in preview-only)
                  └── renders Preview      (mounted in split / preview-only)
```

Single-direction data flow throughout: leaf components emit events, App mutates the relevant piece of state, and the new value flows down on the next render. The `data-theme` write and the window-title call are the only side effects, both wired through `useEffect`.

## Non-entities (explicit)

These are NOT in the data model for this feature and should not be introduced silently in the tasks phase:

- **Dirty / modified flag** on the Document. (Out of scope; no Save layer.)
- **Recent files list**, **file history**, **last opened path**. (Out of scope.)
- **Tab** / multi-document state.
- **Theme palettes** beyond binary light/dark; **accent colour preference**.
- **Continuous split-ratio value** (e.g., `splitRatio: 0.5`). View mode is a three-state enum; the split width is implicit in the CSS layout.
- **User profile / settings file / Rust-side preference store**. Preferences live in webview `localStorage`.
- **Per-file preferences** (e.g., "this file opens in preview-only").
- **Keyboard shortcut bindings configuration**.
