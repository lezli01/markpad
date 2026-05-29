# MILF

<p align="center">
  <img src="public/favicon.svg" alt="MILF icon" width="128" height="128" />
</p>

**Markdown Interface & Live Formatter**

MILF is a lightweight, cross-platform Markdown viewer and editor for Windows, Linux, and macOS.

![MILF showing two open tabs above the toolbar, with starter markdown in the editor pane and its live rendering in the preview pane, in the dark theme](docs/images/screenshot.png)

## Status

Early development, but already usable day-to-day. The split-pane workspace, multi-file tabs, file open/save, view modes, theming, auto-save, OS file-association handling, single-instance routing, and session restore are working today. Specs for shipped and in-progress features live under [`specs/`](specs); open issues and follow-ups are in the [issue tracker](https://github.com/lezli01/milf/issues).

## Features

- **Live split-pane preview.** Edit Markdown on the left, see it rendered on the right, with each pane scrolling independently.
- **Formatting toolbar.** One-click Markdown formatting from the editor header — bold, italic, strikethrough, inline code, headings, bullet/numbered lists, quotes, links, images, code blocks, tables, and horizontal rules — with shortcuts for the common ones (`Ctrl/⌘+B`, `+I`, `+E`, `+K`, and more). Buttons toggle the mark off when reapplied and light up to show the formatting at the cursor.
- **Three view modes.** Editor-only, preview-only, or side-by-side — switch at any time without losing the editor's content, selection, or undo history.
- **Multiple files in tabs.** Open many `.md` files at once; each tab keeps its own content, modified indicator, and cursor/scroll position so switching feels instant.
- **New empty file.** Start a fresh markdown document from the toolbar or `Ctrl+N` / `⌘N`; the first Save prompts for a path.
- **Light and dark theme.** Honors the operating system's appearance preference by default, with a manual toggle in the toolbar.
- **Open files from disk.** Native file picker biased toward `.md` and `.markdown`, with a fallback to all files.
- **Open files from your file manager.** Set MILF as the default for `.md` and a double-click opens MILF (or routes to the running instance).
- **One window per user.** MILF runs as a single instance; new file requests bring the existing window to the foreground.
- **Save back to disk.** Manual Save plus a visible modified indicator next to the file name so you always know whether your edits are on disk.
- **Optional auto-save.** Tick the box once and edits land on disk shortly after you stop typing, while a file is open.
- **Close-tab guard.** Closing a tab with unsaved edits prompts to Save, Discard, or Cancel so reflex clicks don't lose work.
- **Resumes where you left off.** All open tabs are remembered between launches, including which one was active; files that have been moved or deleted are silently dropped.
- **Persistent preferences.** Theme, view mode, and auto-save choice are remembered between launches, stored locally.
- **Responsive layout.** Side-by-side on a normal window, stacks vertically at narrow widths.
- **Safe preview.** Rendered HTML is sanitized with DOMPurify before display.

## Stack

- [Tauri 2](https://tauri.app/) — native desktop shell and filesystem access
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/) — dev server and build
- [CodeMirror 6](https://codemirror.net/) — editor
- [markdown-it](https://github.com/markdown-it/markdown-it) — Markdown rendering
- [DOMPurify](https://github.com/cure53/DOMPurify) — preview sanitization
- [Tailwind CSS](https://tailwindcss.com/) — styling

For a high-level overview, see [`docs/architecture.md`](docs/architecture.md).

## Quick start

Prerequisites: Node.js LTS, npm, Rust + Cargo, and Tauri 2's [platform prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

Install dependencies:

```sh
npm ci
```

Launch the desktop app:

```sh
npm run tauri dev
```

Or run just the frontend in a browser:

```sh
npm run dev
```

## Development checks

Frontend:

```sh
npm run lint
npm run build
```

Rust / Tauri (from `src-tauri/`):

```sh
cargo fmt --all --check
cargo clippy --all-targets --all-features -- -D warnings
cargo check --all-targets --all-features
```

## Project layout

```
src/             React + TypeScript UI (editor, preview, workspace, toolbar)
src-tauri/       Rust crate that hosts the Tauri desktop runtime
specs/           Feature specifications (one folder per feature)
docs/            Architecture notes and supporting docs
```

## How we work

MILF is spec-driven: every meaningful feature begins with a short spec under [`specs/`](specs) before implementation, with acceptance criteria the work has to meet. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full issue-to-PR workflow and the checks expected before a pull request.

## Privacy

MILF is local-first. Files stay on your machine and the application does not send your content over the network. Preferences are stored in the local browser storage of the desktop runtime. Session state (the list of open files) is stored locally in your platform's standard application-data directory; nothing is sent over the network.

## Security

Please do not open public issues for suspected vulnerabilities. See [`SECURITY.md`](SECURITY.md).

## License

[MIT](LICENSE)
