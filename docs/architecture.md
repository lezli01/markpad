# MarkPad Architecture

MarkPad is a cross-platform desktop Markdown editor/viewer.

## Frontend

React + TypeScript handles the UI.

## Desktop Runtime

Tauri 2 provides the native desktop shell and file-system access.

## Editor

CodeMirror 6 will provide the Markdown editing experience.

## Markdown Rendering

markdown-it will initially render Markdown into preview HTML.

## State Management

Use local React state first. Avoid global state libraries until necessary.

## Design Goals

- Lightweight
- Easy to understand
- Easy to contribute to
- AI-friendly project structure
