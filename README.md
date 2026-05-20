# MILF

**Markdown Interface & Live Formatter**

MILF is a lightweight, cross-platform Markdown viewer and editor for Windows, Linux, and macOS.

## Status

Early greenfield setup. The project is open for collaboration, with issues, pull requests, CI, security scanning, and contribution guidelines in place.

## Goals

- Fast local Markdown editing
- Live preview
- Clean split-pane interface
- Cross-platform desktop support
- Beginner-friendly open-source development
- AI-assisted, spec-driven workflow

## Planned Stack

- Tauri 2
- React
- TypeScript
- Vite
- CodeMirror 6
- markdown-it
- Tailwind CSS

## Development

Install dependencies:

```sh
npm ci
```

Run the frontend development server:

```sh
npm run dev
```

Run the Tauri app:

```sh
npm run tauri dev
```

Run frontend checks:

```sh
npm run lint
npm run build
```

For Rust/Tauri changes, also run the checks documented in [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributing

Before starting meaningful work, open or claim an issue and add acceptance criteria. See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, local checks, and pull request expectations.

## Security

Please do not open public issues for suspected vulnerabilities. See [SECURITY.md](SECURITY.md).
