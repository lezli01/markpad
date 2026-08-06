# MarkPad Architecture

MarkPad is a cross-platform desktop app for editing Markdown (and JSON) with a
live preview. This is the high-level map; feature-level specs live under
[`specs/`](../specs).

## Frontend

React 19 + TypeScript render the UI: the workspace (editor, preview, format
toolbar), the recent-files sidebar, and the app toolbar. State is plain React
state lifted into `App` — there is no global state library.

## Desktop Runtime

Tauri 2 provides the native shell, filesystem and dialog access, OS
file-association routing, and single-instance behavior. Session state — the
recents list, the active document, and unsaved drafts — is owned by the Rust
side (`src-tauri/src/session.rs`) and stored in the platform's standard
application-data directory. User preferences (theme, view mode, auto-save,
sidebar width/collapsed state) live in `localStorage` behind the single
chokepoint `src/lib/preferences.ts`.

## Editor

CodeMirror 6 provides the editing surface for both languages, with line numbers
and code folding. The per-language extensions live in a compartment, so a
buffer can switch between Markdown and JSON (`src/lib/documentLanguage.ts`)
without losing its content or undo history. Markdown documents get the
formatting keymap and toolbar commands (`src/lib/formatActions.ts`); JSON
documents get linting, folding, typing comforts, and the Format / Minify /
Sort keys actions.

## Markdown Rendering

markdown-it renders the preview HTML, stamping heading anchor ids for
in-document links; DOMPurify sanitizes every render before display. Scroll sync
between the editor and preview maps positions through source-line anchors
(`src/lib/scrollSync.ts`) rather than pixel ratios, so tall images and long
code blocks don't drift.

## State Management

Local React state first. Avoid global state libraries until necessary.

## Design Goals

- Lightweight
- Easy to understand
- Easy to contribute to
- AI-friendly project structure
