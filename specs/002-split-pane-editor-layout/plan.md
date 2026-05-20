# Implementation Plan: Split-Pane Editor Layout Foundation

**Branch**: `2-split-pane-editor-layout` | **Date**: 2026-05-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-split-pane-editor-layout/spec.md`

**User direction (planning input)**: "The ui should feel modern islands style, very intuitive and easy to digest." — interpreted as: two soft, rounded "card" panes floating in a calm background, balanced spacing, low-clutter typography, clear input/output affordances. No toolbar or menus in this foundation.

## Summary

Replace the default Tauri + React greeter with the foundation workspace described in `spec.md`: a single-window desktop app whose entire content area is a two-pane "islands" workspace — a markdown editor (left) and a live-rendered preview (right). The preview updates as the user types. The layout is responsive via CSS so both panes flex to fill the window, and stacks vertically below a small breakpoint to keep each pane usable on narrow widths. Starter markdown content greets first-time users in the editor and is mirrored, rendered, in the preview.

Technical approach: use CodeMirror 6 (already on the approved stack) for the editor, `markdown-it` for parsing, and `DOMPurify` to sanitize HTML before insertion — satisfying Constitution Principle VII (Safe Markdown Rendering). Styling uses Tailwind CSS v4 with `@tailwindcss/vite` to express the islands aesthetic with utility classes; no global CSS framework beyond Tailwind's base. State stays in local React state (`useState`) per the constitution's prohibition on premature global state. The Tauri Rust backend is untouched in this feature.

## Technical Context

**Language/Version**: TypeScript 5.8 (strict mode, `react-jsx`), Rust 1.75+ via Tauri 2 toolchain (backend untouched in this feature)

**Primary Dependencies**:
- Already in `package.json`: `react@^19.1.0`, `react-dom@^19.1.0`, `@tauri-apps/api@^2`, `vite@^7.0.4`, `@vitejs/plugin-react@^4.6.0`, `typescript@~5.8.3`
- New runtime: `codemirror@^6`, `@codemirror/state@^6`, `@codemirror/view@^6`, `@codemirror/lang-markdown@^6`, `@codemirror/commands@^6`, `markdown-it@^14`, `dompurify@^3`
- New dev: `tailwindcss@^4`, `@tailwindcss/vite@^4`, `@types/markdown-it`, `@types/dompurify`

**Storage**: None — the document is in-memory only for this foundation (per spec Assumptions). The editor's text content lives in React state for the lifetime of the window.

**Testing**: No automated test suite is wired up in the repo yet. Per Constitution Principle IX, CI must run `tsc`, ESLint, and Prettier. `tsc --noEmit` is exercised by `npm run build`. ESLint/Prettier/test-runner setup is **out of scope for this feature** and is tracked as a follow-up (see Complexity Tracking). Manual acceptance is via `quickstart.md`.

**Target Platform**: Desktop — Windows, Linux, macOS — via Tauri 2 system webview. No platform-specific code is added in this feature.

**Project Type**: Desktop application (Tauri + React frontend, Rust backend). Single project layout — frontend in `src/`, backend in `src-tauri/`.

**Performance Goals**:
- Keystroke→preview update under 100 ms for documents up to 10 000 characters (SC-002).
- First paint of workspace within 2 s of app launch (SC-001).
- Smooth 60 fps window-resize behavior (SC-005).

**Constraints**:
- Layout usable from 480 px to 3840 px window width (SC-003).
- Below ~640 px width, stack panes vertically to keep each usable (FR-010).
- All rendered HTML MUST pass through DOMPurify before insertion (Constitution VII).
- Bundle additions must justify themselves (Constitution Tech Constraints) — each new dep is named above with a one-line "why" in `research.md`.
- No network access introduced (Constitution VI).

**Scale/Scope**:
- Single window, two panes, one in-memory document.
- ~6–8 new TypeScript files (~150 LOC each ceiling per Constitution Architecture).
- No new Rust code, no new Tauri commands, no new Tauri capabilities.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Simplicity First | PASS | Plain `useState`, three small components (Workspace, Editor, Preview), one `markdown.ts` helper. No abstractions added that the foundation doesn't use. |
| II | Cross-Platform Desktop Support | PASS | Tauri 2 already targets all three OSes. No platform-specific code added. |
| III | Spec-Driven Development | PASS | `spec.md` exists and is validated. This plan derives from it. |
| IV | Small, Reviewable Changes | PASS (with note) | The feature is the foundation, so it adds a handful of files. Decomposable into commits along user-story priority (P1 → P3) if the PR feels large at review time. |
| V | AI-Assisted but Human-Owned | PASS | This plan is AI-drafted, human-reviewed before any code lands. |
| VI | Local-First & Private by Default | PASS | No network, no telemetry, no accounts. All processing is local. |
| VII | Safe Markdown Rendering | PASS | `DOMPurify` sanitizes markdown-it's HTML output before it is set on the DOM. No `dangerouslySetInnerHTML` without sanitizer in the same code path. |
| VIII | Contributor-Friendly Open Source | PASS | New stack pieces are well-documented mainstream libraries. `quickstart.md` covers running and verifying the feature. |
| IX | Quality Gates: Tests, Lint, Format, CI | PARTIAL | `tsc` is enforced via `npm run build`. ESLint/Prettier/test-runner/CI are not yet set up in the repo at all — this is a pre-existing gap, not introduced by this feature. See Complexity Tracking entry "Quality gate setup". |

**Decision**: Gate passes for this feature. The Principle IX gap is recorded as a follow-up and does not block planning of the foundation.

## Project Structure

### Documentation (this feature)

```text
specs/002-split-pane-editor-layout/
├── plan.md              # This file (/speckit-plan command output)
├── spec.md              # Feature specification (already exists)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── components.md    # UI component contracts
├── checklists/
│   └── requirements.md  # Already exists from /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created here)
```

### Source Code (repository root)

```text
milf/
├── src/                              # React + TypeScript frontend
│   ├── main.tsx                      # Existing; switch CSS import to ./styles.css
│   ├── App.tsx                       # REPLACE: renders <Workspace />
│   ├── styles.css                    # NEW: Tailwind v4 entry + minimal globals
│   ├── components/
│   │   ├── Workspace.tsx             # NEW: two-pane islands layout shell
│   │   ├── Editor.tsx                # NEW: CodeMirror 6 wrapper
│   │   └── Preview.tsx               # NEW: sanitized markdown HTML
│   ├── lib/
│   │   ├── markdown.ts               # NEW: markdown-it instance + DOMPurify call
│   │   └── starterContent.ts         # NEW: default first-run markdown string
│   ├── assets/                       # Existing; may be pruned of unused logos
│   ├── App.css                       # DELETE (replaced by Tailwind utilities)
│   └── vite-env.d.ts                 # Existing
├── src-tauri/                        # Tauri Rust backend (UNCHANGED in this feature)
│   ├── src/{main.rs, lib.rs}
│   ├── Cargo.toml
│   ├── tauri.conf.json               # MAY tweak window default size only
│   └── capabilities/default.json
├── index.html                        # Update <title> from default Tauri text to "MILF"
├── package.json                      # Add new deps listed in Technical Context
├── vite.config.ts                    # Add @tailwindcss/vite plugin
└── tsconfig.json                     # Unchanged
```

**Structure Decision**: Stay with the existing single-project layout. Group new UI files under `src/components/` and pure-helper modules under `src/lib/` — two small subdirectories that establish a precedent for the next features without over-engineering. The Tauri Rust backend is intentionally untouched, because the foundation does not need a custom Tauri command.

## Complexity Tracking

| Violation / Note | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Three new runtime deps (CodeMirror 6, markdown-it, DOMPurify) | Each is on the approved stack in the constitution (CodeMirror, markdown-it) or required by Principle VII (DOMPurify). | Hand-rolling an editor or sanitizer is well outside the budget of this feature and the project's "Simplicity First" principle (it is simpler to take well-maintained libraries than to write our own). |
| Tailwind CSS v4 + `@tailwindcss/vite` | Tailwind is on the approved stack; v4 is the current major and has the simplest Vite integration. The islands aesthetic relies on utility classes (rounded, shadow, gap, gradient, dark mode) that would otherwise require a hand-written CSS file we then have to maintain. | Plain CSS Modules or vanilla CSS would mean re-implementing utility classes by hand. Tailwind v3 would mean an older toolchain that v4 has explicitly simplified. |
| New `components/` and `lib/` subfolders introduced on the first feature | We are at zero files of this type; sorting them into two obvious buckets up front is cheaper than later migrating from a flat layout. | Flat `src/` works for ~3 components but invites churn the moment more land. |
| Quality gate setup (ESLint, Prettier, test runner, CI) NOT done in this feature | Wiring lint/format/CI is its own scope and decision-heavy (which lint config, which test runner). Bundling it here would violate Principle IV (Small, Reviewable Changes). | Doing it here would inflate the PR and delay shipping the actual foundation. Follow-up tracked as its own spec/issue. |
