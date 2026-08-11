# MarkPad Architecture

MarkPad is a cross-platform desktop app for editing Markdown (and the data
languages JSON and YAML) with a live preview. This is the high-level map;
feature-level specs live under [`specs/`](../specs).

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

CodeMirror 6 provides the editing surface for every language, with line numbers
and code folding. The per-language extensions live in a compartment, so a buffer
can switch between Markdown, JSON and YAML (`src/lib/documentLanguage.ts`)
without losing its content or undo history. Markdown documents get the
formatting keymap and toolbar commands (`src/lib/formatActions.ts`); the two
data languages get linting, folding, typing comforts
(`src/lib/jsonAutoEdit.ts`, `src/lib/yamlAutoEdit.ts`) and their own rewrite
actions, dispatched onto the view by `src/lib/dataActions.ts` over the pure text
transformations in `src/lib/jsonActions.ts` and `src/lib/yamlActions.ts`. YAML's
rewrites and diagnostics go through the `yaml` package's document model, which is
what keeps comments and anchors alive across a Format.

## Markdown Rendering

markdown-it renders the preview HTML, stamping heading anchor ids for
in-document links; DOMPurify sanitizes every render before display. Scroll sync
between the editor and preview maps positions through source-line anchors
(`src/lib/scrollSync.ts`) rather than pixel ratios, so tall images and long
code blocks don't drift.

## Diagrams

A fenced block in a diagram language (`src/lib/diagrams.ts` decides which)
renders as a placeholder rather than as code, and `<Preview />` fills it in once
the markdown is in the DOM — the engines measure their labels against real
layout, and they are megabytes, so they are loaded with a dynamic import the
first time a document actually uses one. `src/lib/diagramRenderer.ts` owns the
engines, sanitizes their SVG, and caches results by source, theme and engine so
typing does not redraw the whole document; `src/lib/diagramMount.ts` owns the
DOM side. Both mermaid and Graphviz run in-process, keeping the app offline.

## State Management

Local React state first. Avoid global state libraries until necessary.

## Design Goals

- Lightweight
- Easy to understand
- Easy to contribute to
- AI-friendly project structure
