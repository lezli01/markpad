# Implementation Plan: Save Controls and Active File Header

**Branch**: `004-save-file-controls` | **Date**: 2026-05-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-save-file-controls/spec.md`

## Summary

Turn markpad from "open and view" into "open and edit" by adding a Save control, an auto-save toggle, and a prominent active-file header to the workspace chrome built in Feature 003. The Save control writes the editor's current text back to the path the file was loaded from. A new `<FileHeader />` component sits at the top of the workspace and shows the file name (or `Untitled`), a modified marker, and a hover tooltip with the full path. An auto-save checkbox next to Save flips a debounced idle-saver on or off and persists that choice into the same `localStorage` namespace Feature 003 introduced.

Technical approach: stay on the approved stack and reuse Feature 003's chokepoints rather than adding new ones. `src/lib/fileOpen.ts` already owns every Tauri dialog/fs/window call — extend it with a `saveMarkdownFile(path, content)` helper (and update the header comment to reflect that the module now covers I/O, not just open). `src/lib/preferences.ts` already owns every `localStorage` access — extend it with `getAutoSave()` / `setAutoSave(on)` keyed on `markpad.autoSave`. The modified state is **derived**, not stored: hold the last-successfully-saved text in a `savedText` `useState` field, and compute `isModified = text !== savedText` at render time. Auto-save is one `useEffect` that watches `[text, autoSave, openedFile, savedText, saving]` and schedules a single `setTimeout` on the trailing edge. Concurrent writes are serialised via a `saving` flag plus a small ref-held "needs another save after this one" boolean — the simplest correct mutex for a single-renderer webview. One new capability (`fs:allow-write-text-file`) joins the existing read capability; no new npm or cargo dependencies are introduced.

## Technical Context

**Language/Version**: TypeScript 5.8 (strict mode, `react-jsx`), Rust 1.75+ via the Tauri 2 toolchain (unchanged from Feature 003). No new Rust code is added by this feature.

**Primary Dependencies**:
- Already in `package.json` (from 003 and earlier): `react@^19`, `react-dom@^19`, `@tauri-apps/api@^2`, `@tauri-apps/plugin-opener@^2`, `@tauri-apps/plugin-dialog@^2`, `@tauri-apps/plugin-fs@^2`, `vite@^7`, `@vitejs/plugin-react@^4`, `typescript@~5.8`, `codemirror@^6`, `@codemirror/*@^6`, `markdown-it@^14`, `dompurify@^3`, `tailwindcss@^4`, `@tailwindcss/vite@^4`.
- New runtime deps: **none**. `writeTextFile` is exported by the already-installed `@tauri-apps/plugin-fs`.
- New Rust deps: **none**. The already-installed `tauri-plugin-fs` exposes `writeTextFile` once the matching capability is granted.
- No new dev deps.

**Storage**:
- `localStorage` in the webview, three keys total now: the existing `markpad.theme` and `markpad.viewMode` plus the new `markpad.autoSave` (`"on" | "off"`). Same `try/catch` + whitelist pattern as Feature 003 (FR-019, FR-020).
- Read/write access to user-picked text files via `tauri-plugin-fs`. The path the dialog returned in Feature 003 is reused as the write target; no new dialog is shown.
- No new long-lived state on the Rust side. `savedText`, `saving`, and the auto-save timer all live in React state / refs in `App.tsx`.

**Testing**: No automated test suite is wired up in the repo yet — same pre-existing gap as Features 002 and 003. Per Constitution Principle IX, CI must run `tsc`, ESLint, and Prettier. `tsc --noEmit` is exercised by `npm run build`. ESLint and Prettier setup, and a test runner, remain the unaddressed pre-existing gap from earlier features — see Complexity Tracking. Manual acceptance is via `quickstart.md` (numbered steps mapped to FR / SC IDs).

**Target Platform**: Desktop — Windows, Linux, macOS — via Tauri 2 system webview. No platform-specific code is added by this feature. `tauri-plugin-fs`'s `writeTextFile` is cross-platform first-party.

**Project Type**: Desktop application (Tauri + React frontend, Rust backend). Single-project layout — frontend in `src/`, backend in `src-tauri/` — unchanged from Feature 003.

**Performance Goals**:
- Manual save of a markdown file up to 100 KB completes within 1 s on a writable location in 99% of attempts (SC-001).
- Auto-save fires within 5 s of the user pausing typing on a writable location (SC-004); the implementation aims for ~1.5 s idle debounce, well inside the budget.
- Save of a well-formed file up to 1 MB does not block the editor — the UI stays interactive while the write is in flight (SC-008). `writeTextFile` is already async; the React render loop is not awaited.
- 100 consecutive auto-save cycles produce zero corruption, zero partial writes, zero duplicate writes (SC-005). See `research.md` §3 (concurrency).
- All budgets are well above noise for a desktop app on commodity hardware; no profiling work required up front.

**Constraints**:
- All Feature 002 and 003 constraints carry over: layout usable from 480 px to 3840 px, sanitizer in the markdown render path, no network access, no new runtime deps without a written justification.
- The file-system capability MUST be tightened to the minimum needed: only `fs:allow-write-text-file` for writes, scoped via Tauri 2's dialog-pick mechanism to paths the user explicitly opened. Blanket `fs:default` or `fs:allow-write-file` is not permitted (Principle VI).
- Save MUST use the same encoding (UTF-8) and (implicitly) the same line endings the file was read with. No BOM insertion, no normalisation introduced by this feature (per spec Assumptions).
- The active-file header MUST remain visible in all three view modes (editor / preview / split — Feature 003) and at all responsive widths (Feature 002).
- Manual Save and a concurrent auto-save MUST NOT produce two overlapping writes; at most one effective write per logical save reaches disk (FR-018).
- The Save control MUST be visibly unavailable when no file is open. Activating it MUST NOT show a "Save As" dialog (spec Assumptions — Save As is out of scope).
- Editor MUST stay mounted across all view-mode switches (carried over from Feature 003); the modified-indicator derivation runs in React render and does not interact with CodeMirror's internal state.

**Scale/Scope**:
- 3 new React state fields in `App.tsx` (`savedText`, `autoSave`, `saving`) and 1 new ref (`pendingSaveRef`).
- 1 new component (`<FileHeader />`); 2 existing components updated (`<Toolbar />`, `<App />`); `<Workspace />` unchanged.
- 1 lib module extended (`fileOpen.ts` gains `saveMarkdownFile` + an updated header comment); 1 lib module extended (`preferences.ts` gains `getAutoSave` / `setAutoSave`); no new lib modules.
- 1 line added to `src-tauri/capabilities/default.json` (`fs:allow-write-text-file`); no other Rust-side changes.
- 0 new npm deps, 0 new cargo deps, 0 new Tauri commands.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Simplicity First | PASS | Three additional scalar state fields in `useState`, one new presentational component, one new `useEffect` for the auto-save debounce, one tiny ref-held mutex. No state library, no Context, no toast library, no debounce / save library — the entire auto-save is `setTimeout` + `clearTimeout`. Modified state is **derived** (`text !== savedText`), not stored. |
| II | Cross-Platform Desktop Support | PASS | `tauri-plugin-fs.writeTextFile` is cross-platform first-party. No platform-specific code is introduced. `localStorage` is universal in the webview. |
| III | Spec-Driven Development | PASS | `spec.md` exists and passed the speckit-specify checklist; this plan derives from it. |
| IV | Small, Reviewable Changes | PASS (with note) | Three user stories at P1/P2/P3 are independently shippable. Recommended decomposition: PR 1 = P1 (Save + modified indicator + capability), PR 2 = P2 (FileHeader component), PR 3 = P3 (auto-save toggle + persistence). If they ship as one PR, the diff stays small (~3 edited files, 1 new file, no new deps). |
| V | AI-Assisted but Human-Owned | PASS | This plan is AI-drafted, human-reviewed before any code lands. |
| VI | Local-First & Private by Default | PASS | No network. Auto-save preference in webview `localStorage` (per-app, never sent anywhere). File writes are scoped via `fs:allow-write-text-file` plus Tauri's dialog-pick path scope to files the user explicitly opened. No telemetry, no accounts. |
| VII | Safe Markdown Rendering | PASS | The render path is untouched by this feature. Save writes raw text from the editor to disk — it does not go through DOMPurify (DOMPurify operates on HTML, not on stored Markdown source). Quickstart includes a regression step that confirms the sanitizer still strips a malicious payload after a save round-trip. |
| VIII | Contributor-Friendly Open Source | PASS | Reuses the existing single-chokepoint pattern: `fileOpen.ts` for all Tauri I/O, `preferences.ts` for all `localStorage`. The new component is small, single-purpose, and inline-SVG (no icon-library dep). `quickstart.md` covers every acceptance scenario. |
| IX | Quality Gates: Tests, Lint, Format, CI | PARTIAL (pre-existing) | `tsc` is enforced via `npm run build`. ESLint, Prettier, test-runner, and CI are still the unaddressed pre-existing gap from Features 002 and 003 — see Complexity Tracking row "Quality gate setup". This feature does NOT regress the gap; nothing it introduces would have been caught by tools that are still not wired up. |

**Decision**: Gate passes for this feature. Principle IX gap is pre-existing and tracked.

**Post-design re-check** (after `research.md` + `data-model.md` + `contracts/` + `quickstart.md`): No new violations introduced. The design adds zero runtime dependencies, extends two existing lib modules (no new chokepoints), introduces one preference key under the established `markpad.*` namespace, and tightens the existing `fs:` capability list by adding one specifically-scoped permission rather than relaxing what is already there. State management stays on local React state (Principle I), with one new ref used as a tiny serialisation mutex — well below the threshold where Context becomes warranted (Principle VIII / constitution Tech Constraints).

## Project Structure

### Documentation (this feature)

```text
specs/004-save-file-controls/
├── plan.md              # This file (/speckit-plan command output)
├── spec.md              # Feature specification (already exists)
├── research.md          # Phase 0 output (this command)
├── data-model.md        # Phase 1 output (this command)
├── quickstart.md        # Phase 1 output (this command)
├── contracts/           # Phase 1 output (this command)
│   └── components.md    # UI component contracts
└── tasks.md             # Phase 2 output (/speckit-tasks command — NOT created here)
```

### Source Code (repository root)

```text
markpad/
├── src/                              # React + TypeScript frontend
│   ├── main.tsx                      # UNCHANGED
│   ├── App.tsx                       # UPDATE: add savedText / autoSave / saving state; handleSave + auto-save effect; render FileHeader
│   ├── styles.css                    # UNCHANGED
│   ├── components/
│   │   ├── Workspace.tsx             # UNCHANGED
│   │   ├── Editor.tsx                # UNCHANGED
│   │   ├── Preview.tsx               # UNCHANGED
│   │   ├── Toolbar.tsx               # UPDATE: add Save button + auto-save checkbox; new props (saveEnabled, saving, autoSave, onSave, onToggleAutoSave)
│   │   ├── ErrorBanner.tsx           # UNCHANGED (reused for save errors)
│   │   └── FileHeader.tsx            # NEW: file-name display, modified marker, full-path tooltip
│   ├── lib/
│   │   ├── markdown.ts               # UNCHANGED
│   │   ├── starterContent.ts         # UNCHANGED
│   │   ├── preferences.ts            # UPDATE: add getAutoSave / setAutoSave; new key markpad.autoSave
│   │   └── fileOpen.ts               # UPDATE: add saveMarkdownFile(path, content); update header comment
│   └── vite-env.d.ts                 # UNCHANGED
├── src-tauri/
│   ├── src/lib.rs                    # UNCHANGED
│   ├── Cargo.toml                    # UNCHANGED
│   └── capabilities/default.json     # UPDATE: add fs:allow-write-text-file
├── index.html                        # UNCHANGED
├── package.json                      # UNCHANGED
├── vite.config.ts                    # UNCHANGED
└── tsconfig.json                     # UNCHANGED
```

**Structure Decision**: Keep the existing single-project layout established by Feature 002 and reinforced by Feature 003. The new `<FileHeader />` slots into `src/components/` next to `<Toolbar />` and `<ErrorBanner />`. The two existing `src/lib/` modules grow by one or two exports each rather than spawning new sibling modules — this preserves the "one file per concern" chokepoint that Feature 003 set up (every `localStorage` call lives in `preferences.ts`; every Tauri I/O call lives in `fileOpen.ts`). The Rust side gains exactly one entry in `capabilities/default.json` and nothing else.

A note on the `fileOpen.ts` name: it now covers both open and save. A rename to `fileIo.ts` is tempting but is deliberately deferred — renaming a module that lives at the bottom of an import graph for an aesthetic-only reason is exactly the kind of churn Principle IV warns against. The header comment is updated to describe the broader role; if the module grows again (e.g., "save as", "watch", "atomic write") then the rename gets bundled with the real change.

## Complexity Tracking

| Violation / Note | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| New `<FileHeader />` component | FR-007 (header MUST display the file name at the top of the workspace), FR-008 (`Untitled` placeholder), FR-009 (visible modified indicator), FR-010 (truncation + tooltip), FR-011 (visible across view modes). The header is logically separate from the toolbar — it is informational, not interactive. Bundling it into `<Toolbar />` would balloon Toolbar past the 150-line cap and mix two roles in one component (Principle I / constitution Architecture). | Putting the file name inside `<Toolbar />` mixes "what am I editing?" with "what controls do I have?". Putting it inside `<Workspace />` would make it disappear when Workspace is hidden in any future re-layout. A dedicated leaf component is the simplest correct surface. |
| New `savedText` state field (derives `isModified`) | FR-006 requires a modified-since-last-save state that is visible in the chrome. Holding `savedText` and computing `text !== savedText` is the simplest correct derivation: it is automatic, race-free, and survives any text mutation (including paste, undo, and CodeMirror-driven edits). | A separate `isModified: boolean` flag has to be kept in sync at three call sites (open, edit, save) and is the classic source of "stuck modified after save" bugs. A `useReducer` with an explicit `MODIFIED` action is more code for the same outcome. |
| `saving: boolean` flag + tiny ref-held mutex | FR-018 requires that a manual Save and a concurrent auto-save cannot corrupt the file. The flag drives the Save button's disabled state; the ref-held "needs another save when this one finishes" boolean coalesces concurrent requests into at most one follow-up write. This is the simplest correct concurrency primitive for a single-renderer webview. | A queue of pending writes is over-engineered for a feature with at most two concurrent triggers (manual + auto). A library (`p-queue`, `async-mutex`) is a runtime dep for ~10 lines of inline logic. A naive "let them race" loses FR-018. |
| New `fs:allow-write-text-file` capability | Required for `writeTextFile` to be callable from the webview. The capability is the narrowest possible — it permits exactly one fs operation, on paths the user has explicitly picked via the dialog (Tauri 2 dialog-scope mechanism). | `fs:default` opens too many operations. Writing a custom Tauri command duplicates what `plugin-fs` already exposes and adds Rust code we'd have to maintain. |
| `lib/fileOpen.ts` keeps its name despite now covering Save | A rename to `fileIo.ts` is pure churn — the module's role grew but every import site would need to be touched for no behavioural reason. The header comment is updated to describe the broader role. | Renaming now means a larger diff in this feature's PR for zero user-visible benefit. Bundling the rename with a future feature that actually changes behaviour is more honest. |
| Auto-save debounce implemented inline as a single `useEffect` + `setTimeout` | Spec assumes a 1–3 s idle interval; implementation picks the midpoint (1.5 s) inside a `useEffect` body. The hook closes over the latest text, autoSave flag, and openedFile path. `clearTimeout` on cleanup handles every "cancel" case (autoSave toggled off, file closed, new keystroke before the timer fires). This is ~12 lines of code. | Adding `lodash.debounce`, `use-debounce`, or any similar package is a new runtime dep for an idiom React expresses natively. A custom `useDebouncedSave()` hook is also fine but is not warranted at one call site. |
| Quality gate setup (ESLint, Prettier, test runner, CI) STILL NOT done in this feature | Carried over from 002 and 003. Wiring up linters and CI is its own scope and decision-heavy. Bundling it into this feature would violate Principle IV. | Doing it here would balloon the PRs that ship the actual user-facing features and entangle this work with framework choices that deserve their own spec. Tracked in the project's follow-up list. |
