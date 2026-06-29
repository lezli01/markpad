# Implementation Plan: Core Workspace Controls

**Branch**: `003-core-ui-controls` | **Date**: 2026-05-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-core-ui-controls/spec.md`

## Summary

Extend the Feature 002 workspace with three discoverable controls — Open file, view mode, and theme toggle — plus persistence of the latter two between launches. The workspace gains a thin toolbar above the islands cards, an inline error banner for file-open failures, and a small `lib/preferences.ts` module that mirrors two scalar choices into `localStorage`. A new `lib/fileOpen.ts` module wraps the official Tauri 2 `plugin-dialog` and `plugin-fs` plugins to present a native open dialog, read the chosen file as text, and update the OS window title. Theme switching moves from a CSS `@media (prefers-color-scheme: dark)` query to a `<html data-theme="...">` attribute so a user choice can override the system default while keeping the existing CSS-variable palette intact.

Technical approach: stay on the approved stack (Tauri 2, React 19, TypeScript, Vite, CodeMirror 6, markdown-it, Tailwind CSS v4, DOMPurify). Add only the two Tauri plugins required by "Open file" (frontend + Rust crate, each minimally scoped via `capabilities/default.json`). All preferences live in webview `localStorage`; no Tauri Store, no Rust-side state. State stays in `useState` in `App.tsx` — five scalar fields, prop-drilled to two leaf components (`<Toolbar />`, `<Workspace />`). View-mode switching hides the editor via CSS (`display: none`) rather than unmounting it, so CodeMirror's selection, cursor, and undo stack survive every switch. A tiny inline script in `index.html` sets `<html data-theme="...">` before React mounts to prevent a flash-of-wrong-theme on first paint. No new Tauri custom commands are introduced.

## Technical Context

**Language/Version**: TypeScript 5.8 (strict mode, `react-jsx`), Rust 1.75+ via Tauri 2 toolchain. Two new Rust plugin crates added (`tauri-plugin-dialog`, `tauri-plugin-fs`); no project-owned Rust code added.

**Primary Dependencies**:
- Already in `package.json` (from 002 and earlier): `react@^19`, `react-dom@^19`, `@tauri-apps/api@^2`, `@tauri-apps/plugin-opener@^2`, `vite@^7`, `@vitejs/plugin-react@^4`, `typescript@~5.8`, `codemirror@^6`, `@codemirror/*@^6`, `markdown-it@^14`, `dompurify@^3`, `tailwindcss@^4`, `@tailwindcss/vite@^4`.
- New runtime: `@tauri-apps/plugin-dialog@^2`, `@tauri-apps/plugin-fs@^2`.
- New on the Rust side: `tauri-plugin-dialog@^2`, `tauri-plugin-fs@^2`.
- No new dev deps.

**Storage**:
- `localStorage` in the webview, two keys: `markpad.theme` (`"light" | "dark"`) and `markpad.viewMode` (`"editor" | "preview" | "split"`).
- Read-only access to user-picked text files via `tauri-plugin-fs` (path-scoped per Tauri 2 capability model).
- The Document remains in-memory (unchanged from 002 — no save layer is added here).

**Testing**: No automated test suite is wired up in the repo yet. Per Constitution Principle IX, CI must run `tsc`, ESLint, and Prettier. `tsc --noEmit` is exercised by `npm run build`. ESLint/Prettier/test-runner setup remains the pre-existing gap from 002 — see Complexity Tracking. Manual acceptance is via `quickstart.md` (15 numbered steps mapped to FR/SC IDs).

**Target Platform**: Desktop — Windows, Linux, macOS — via Tauri 2 system webview. No platform-specific code is added in this feature. The two new plugins are cross-platform first-party Tauri 2 plugins.

**Project Type**: Desktop application (Tauri + React frontend, Rust backend). Single project layout — frontend in `src/`, backend in `src-tauri/`.

**Performance Goals**:
- File open (≤ 100 KB) → rendered preview in under 2 s (SC-001).
- View-mode switch settles in under 200 ms (SC-003).
- Theme toggle propagates to every surface in under 500 ms (SC-005).
- App remains responsive during open of files up to 1 MB; the preview may render more slowly but the editor stays interactive (SC-008).
- All performance budgets are well above noise for a desktop app on commodity hardware; no profiling work required up front.

**Constraints**:
- All previous Feature 002 constraints carry over: layout usable from 480 px to 3840 px, sanitizer in the markdown render path, no network access, bundle additions must justify themselves (Constitution Tech Constraints).
- Open file's filesystem capability MUST be scoped to user-picked text files; blanket `fs:default` is not permitted.
- The data-attribute theme strategy MUST coexist with the existing CSS variables — variables stay, only the selector changes.
- Editor MUST stay mounted across all view-mode switches (no remount).

**Scale/Scope**:
- 5 React state fields, 1 layout shell, 1 toolbar, 1 banner, 2 new lib modules, 1 inline script.
- ~6 new TypeScript files (~80 LOC each ceiling per Constitution Architecture); 2 existing files updated (`App.tsx`, `Workspace.tsx`).
- 1 line added to `src-tauri/src/lib.rs` (× 2 plugins).
- 1 entry added to `src-tauri/capabilities/default.json` (× 2 permissions).
- No new Tauri commands.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Simplicity First | PASS | Five scalar state fields in `useState`, two leaf components, two lib modules. No global state, no Context, no theme provider library, no toast library. The view-mode "hide via CSS" trick is one Tailwind class. |
| II | Cross-Platform Desktop Support | PASS | Tauri 2 already targets all three OSes. The two new plugins (`plugin-dialog`, `plugin-fs`) are first-party cross-platform. `matchMedia` and `localStorage` are universal in the webview. |
| III | Spec-Driven Development | PASS | `spec.md` exists, was validated against the quality checklist on first iteration, and drives this plan. |
| IV | Small, Reviewable Changes | PASS (with note) | Three user stories at P1/P2/P3 are independently shippable. Recommended decomposition: PR 1 = P1 (Open file), PR 2 = P2 (View modes), PR 3 = P3 (Theme + persistence). If they ship as one PR, the diff is still small (~6 new files, ~2 edited files, no Rust code). |
| V | AI-Assisted but Human-Owned | PASS | This plan is AI-drafted, human-reviewed before any code lands. |
| VI | Local-First & Private by Default | PASS | No network. Preferences in webview `localStorage` (per-app, never sent anywhere). File reads are user-initiated and path-scoped via `fs:allow-read-text-file`. No telemetry, no accounts. |
| VII | Safe Markdown Rendering | PASS | Unchanged from 002: all preview HTML still flows through `lib/markdown.ts` → DOMPurify. Opening a file just supplies new source text; the render path is identical. Quickstart step 14 explicitly regression-tests this. |
| VIII | Contributor-Friendly Open Source | PASS | Two new lib modules with clear single-purpose contracts (`preferences`, `fileOpen`). Inline-SVG icons keep the dep tree small. `quickstart.md` covers every acceptance scenario. |
| IX | Quality Gates: Tests, Lint, Format, CI | PARTIAL (pre-existing) | `tsc` is enforced via `npm run build`. ESLint, Prettier, test-runner, and CI are still the unaddressed pre-existing gap from 002 — see Complexity Tracking row "Quality gate setup". This feature does NOT regress the gap; it does not introduce code that any of those tools would have caught. |

**Decision**: Gate passes for this feature. Principle IX gap is pre-existing and tracked.

**Post-design re-check** (after research.md + data-model.md + contracts/ + quickstart.md): No new violations introduced. The design adds two Tauri plugins (justified individually in `research.md` §4), one new `localStorage` access point (centralised in `lib/preferences.ts` per Principle VIII), and a `<html data-theme>` strategy that keeps the existing CSS variable palette as the single source of truth (per `research.md` §2). State management stays on local React state per Principle I and the constitution's explicit state-library prohibition.

## Project Structure

### Documentation (this feature)

```text
specs/003-core-ui-controls/
├── plan.md              # This file (/speckit-plan command output)
├── spec.md              # Feature specification (already exists)
├── research.md          # Phase 0 output (this command)
├── data-model.md        # Phase 1 output (this command)
├── quickstart.md        # Phase 1 output (this command)
├── contracts/           # Phase 1 output (this command)
│   └── components.md    # UI component contracts
├── checklists/
│   └── requirements.md  # Already exists from /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks command — NOT created here)
```

### Source Code (repository root)

```text
markpad/
├── src/                              # React + TypeScript frontend
│   ├── main.tsx                      # UNCHANGED
│   ├── App.tsx                       # UPDATE: owns 5 state fields, renders Toolbar + ErrorBanner + Workspace
│   ├── styles.css                    # UPDATE: replace @media (prefers-color-scheme) with :root[data-theme="dark"]
│   ├── components/
│   │   ├── Workspace.tsx             # UPDATE: support viewMode (editor / preview / split); always keep Editor mounted
│   │   ├── Editor.tsx                # UNCHANGED
│   │   ├── Preview.tsx               # UNCHANGED
│   │   ├── Toolbar.tsx               # NEW: Open button + view-mode segmented control + theme toggle
│   │   └── ErrorBanner.tsx           # NEW: dismissible message bar above workspace
│   ├── lib/
│   │   ├── markdown.ts               # UNCHANGED
│   │   ├── starterContent.ts         # UNCHANGED
│   │   ├── preferences.ts            # NEW: getTheme/setTheme/getViewMode/setViewMode
│   │   └── fileOpen.ts               # NEW: openMarkdownFile() + setWindowTitle()
│   └── vite-env.d.ts                 # UNCHANGED
├── src-tauri/
│   ├── src/lib.rs                    # UPDATE: register plugin_dialog and plugin_fs
│   ├── Cargo.toml                    # UPDATE: add tauri-plugin-dialog, tauri-plugin-fs
│   └── capabilities/default.json     # UPDATE: add dialog:default, fs:allow-read-text-file
├── index.html                        # UPDATE: add inline bootstrap script that sets <html data-theme>
├── package.json                      # UPDATE: add @tauri-apps/plugin-dialog, @tauri-apps/plugin-fs
├── vite.config.ts                    # UNCHANGED
└── tsconfig.json                     # UNCHANGED
```

**Structure Decision**: Keep the existing single-project layout established by Feature 002. The two new components slot into `src/components/` and the two new helpers slot into `src/lib/`, mirroring the conventions already in place. No new top-level folders are introduced. The Rust side gains two crate dependencies and three lines of registration code — no new Rust modules.

## Complexity Tracking

| Violation / Note | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Two new frontend deps (`@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`) | "Open file" requires a native dialog and the ability to read the selected file. These are the official Tauri 2 plugins for that exact task and are the path the Tauri docs steer contributors toward. | A browser `<input type="file">` gives a clipped UX and does not reliably return a real path across platforms. Writing a custom Tauri command for dialog + read duplicates what `plugin-dialog` / `plugin-fs` already do and adds Rust code to maintain. |
| Two new Rust crate deps (`tauri-plugin-dialog`, `tauri-plugin-fs`) | Backend half of the two frontend plugins above; required for the JS calls to resolve. | Can't be avoided if we use the plugins; the alternative is writing custom Rust commands, which is strictly more code. |
| New `data-theme` attribute on `<html>` (replacing the CSS media query) | FR-016 requires a user choice to override the system preference; a pure media query cannot express that. The attribute is the smallest possible change — same CSS variables, different selector. | Adding a CSS class plus the media query creates two parallel sources of truth and precedence headaches. Pure media query cannot satisfy FR-014. |
| Tiny inline bootstrap script in `index.html` | Without it, React mounts in the wrong theme briefly, then flips. That flash is visible and ugly. The script duplicates the FIRST-LAUNCH resolution logic from `lib/preferences.ts` — about 15 lines. | Pre-React loading frameworks (`next-themes`, etc.) would solve this for us but add a runtime dep and a wrapper architecture that is wildly oversized for two preferences. |
| New `Toolbar.tsx` and `ErrorBanner.tsx` components | Three controls need a home (FR-021 discoverability) and file-open errors need a visible surface (FR-006, FR-009). Both are tiny, presentational, and inline-SVG-only. | Hanging the controls off `<Workspace />` would balloon Workspace past the 150-line cap; rendering errors via `alert()` is modal and dated. |
| Hide editor via `display: none` rather than unmount | CodeMirror's selection, cursor, and undo history live in the `EditorView` instance. Unmounting discards them and silently fails FR-012 ("Switching view modes MUST NOT alter, clear, or otherwise lose the editor's content"). | Lifting all of CodeMirror's state into React is a multi-week project; using `display: none` is one Tailwind class. |
| Quality gate setup (ESLint, Prettier, test runner, CI) NOT done in this feature | Carried over from 002. Wiring up linters and CI is its own scope and decision-heavy. Bundling it into this feature would violate Principle IV. | Doing it here would balloon the PRs that ship the actual user-facing features and entangle this work with framework choices that deserve their own spec. |
