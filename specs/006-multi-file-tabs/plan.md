# Implementation Plan: Multi-File Editing with Tabs

**Branch**: `006-multi-file-tabs` | **Date**: 2026-05-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-multi-file-tabs/spec.md`

## Summary

Turn markpad from "one document at a time" into "several documents on a strip of tabs". Each open file becomes a tab with its own text, modified flag, and best-effort cursor/scroll. Switching the active tab swaps which tab the existing editor, preview, Save control, and auto-save effect act on. The Feature 004 standalone file-name header (`<FileHeader />`) is removed; a new `<TabStrip />` takes its place at the top of the workspace and shows every open file plus a modified indicator per tab. Closing a tab with unsaved edits prompts Save / Discard / Cancel; closing the last tab returns the workspace to the empty state Features 003 and 004 already define.

Technical approach: keep the existing chokepoints and the existing single Editor / Preview / Toolbar; only the **shape of the state** changes. `App.tsx` swaps its flat `(text, savedText, openedFile)` triple for a `tabs: Tab[]` list plus an `activeTabId` pointer. The text the editor renders is derived: `tabs.find(t => t.id === activeTabId)?.text ?? ""`. The "saving" flag and the "pending follow-up" ref become per-tab (a `Map<TabId, boolean>`) so saves on background tabs (a Save attempt during close-confirm) cannot collide with the active tab. CodeMirror's selection and scroll are preserved across tab switches by snapshotting `EditorState` per tab in a ref — the existing `<Editor />` component grows a tiny imperative API (`getState()` / `setState()`) via `forwardRef` to expose this. Close-with-unsaved-changes uses a new lightweight modal component (`<ConfirmDialog />`) — three buttons, no new dep. The Feature 004 `<FileHeader />` component file is deleted along with its prop drilling. No new npm or cargo deps; no new Tauri capabilities; no new `localStorage` keys. The existing New button is retained and re-interpreted: it now adds an `Untitled-N` tab rather than blowing away the current document (see Complexity Tracking — a deliberate, minimal scope extension to keep the existing UX coherent).

## Technical Context

**Language/Version**: TypeScript 5.8 (strict mode, `react-jsx`), Rust 1.75+ via Tauri 2 toolchain (unchanged from Features 003 / 004). No new Rust code.

**Primary Dependencies**:
- Already in `package.json` (from 002 / 003 / 004): `react@^19`, `react-dom@^19`, `@tauri-apps/api@^2`, `@tauri-apps/plugin-opener@^2`, `@tauri-apps/plugin-dialog@^2`, `@tauri-apps/plugin-fs@^2`, `vite@^7`, `@vitejs/plugin-react@^4`, `typescript@~5.8`, `codemirror@^6`, `@codemirror/state@^6`, `@codemirror/view@^6`, `@codemirror/commands@^6`, `@codemirror/lang-markdown@^6`, `markdown-it@^14`, `dompurify@^3`, `tailwindcss@^4`, `@tailwindcss/vite@^4`.
- New runtime deps: **none**. Tab strip overflow is plain Tailwind `overflow-x-auto`; the confirm dialog is a `<dialog>` element styled with the existing islands classes; tab IDs are a tiny in-file monotonic counter, not a UUID library.
- New Rust deps: **none**.
- No new dev deps.

**Storage**:
- `localStorage` keys unchanged: `markpad.theme`, `markpad.viewMode`, `markpad.autoSave` (all from Features 003 / 004). Tabs do NOT persist across launches in this feature (spec Assumptions — restore-on-launch is a candidate for a follow-up).
- File-system access unchanged: read via `readTextFile`, write via `writeTextFile`, dialog via `tauri-plugin-dialog`. The capability list in `src-tauri/capabilities/default.json` is unchanged (the existing `fs:allow-read-text-file` + `fs:allow-write-text-file` + `dialog:default` already cover this feature).
- React state grows: `tabs: Tab[]`, `activeTabId: TabId | null`, plus existing prefs. CodeMirror `EditorState` snapshots live in a `useRef(new Map<TabId, EditorState>())` — never in React state (they are large objects React would re-compare on every render).

**Testing**: No automated test suite is wired up in the repo yet — same pre-existing gap as Features 002 / 003 / 004. Per Constitution Principle IX, CI must run `tsc`, ESLint, and Prettier. `tsc --noEmit` is exercised by `npm run build`. ESLint, Prettier, and a test runner remain the unaddressed pre-existing gap from earlier features — see Complexity Tracking. Manual acceptance is via `quickstart.md` (numbered steps mapped to FR / SC IDs).

**Target Platform**: Desktop — Windows, Linux, macOS — via Tauri 2 system webview. No platform-specific code is added by this feature. The tab strip uses CSS `overflow-x-auto` which behaves identically across the three supported webviews (WebView2, WebKitGTK, WKWebView).

**Project Type**: Desktop application (Tauri + React frontend, Rust backend). Single-project layout — frontend in `src/`, backend in `src-tauri/` — unchanged from prior features.

**Performance Goals**:
- 10 markdown files of up to 100 KB each open simultaneously without the editor becoming unresponsive (SC-001). Total in-memory budget ~1 MB of text + 10 `EditorState` snapshots (each snapshot is a few KB of structured data, not a copy of the doc — CodeMirror's `Text` is persistent). Well below desktop noise.
- Tab switch settles within 200 ms (SC-002 / SC-003). The hot path is: snapshot outgoing `EditorState` into a `Map`, dispatch `view.setState(incomingState)` on the existing `EditorView`. Both are O(1) reference ops.
- Close without unsaved changes settles within 200 ms (SC-005). Pure React state update.
- Empty-state transition after closing last tab settles within 200 ms (SC-006). Same.
- Save acts on the active tab only in 100% of cases (SC-004). Per-tab `saving` flag and per-tab `pendingSaveRef` make this structural — a save kicked off for tab X cannot mutate tab Y's `savedText`.
- Re-opening an already-open file does not duplicate the tab in 100% of cases (SC-008). Dedup is path-equality on the `openedFile.path` field; the existing `basename` helper in `fileOpen.ts` is not needed for dedup.

**Constraints**:
- All Feature 002 / 003 / 004 constraints carry over: layout usable from 480 px to 3840 px, sanitizer in the markdown render path, no network access, no new runtime deps without a written justification.
- The existing Editor MUST remain mounted across view-mode switches AND across tab switches. View-mode switches keep CodeMirror alive by hiding via `display: none` (Feature 003 §3); tab switches keep CodeMirror alive by swapping `EditorState`, not by re-mounting (research.md §3 in this feature).
- Save and auto-save MUST NOT clear another tab's modified indicator (FR-019, FR-020). Per-tab `saving` flags and per-tab `pendingSaveRef` make this structural.
- The TabStrip MUST remain visible in every view mode (FR-009). Placing the strip in the `<App />` shell (outside `<Workspace />`) is the same structural fix `<FileHeader />` used and that `<FileHeader />` will hand off.
- The close-confirm prompt for unsaved tabs (FR-015) MUST offer at least Save / Discard / Cancel and MUST NOT be dismissable to a fourth outcome ("X out the dialog" is treated as Cancel).
- Tabs are NOT persisted across launches; relaunching returns the workspace to the empty state (spec Assumptions).
- Drag-to-reorder tabs is out of scope (spec Assumptions). Tab order is insertion order.
- Keyboard shortcuts for tab operations are not required by spec FR-025 — but the existing global Ctrl/Cmd+S / N / O shortcuts (from Feature 004) MUST continue to operate on the active tab without regression.

**Scale/Scope**:
- 1 new React state field in `App.tsx` (`tabs: Tab[]`), 1 new `activeTabId: TabId | null`, 2 new refs (`editorStatesRef`, `savingRef`, `pendingSaveRef`, all `Map`-typed). `text`, `savedText`, `openedFile`, and `saving` as top-level scalars are removed.
- 2 new components (`<TabStrip />`, `<ConfirmDialog />`); 2 existing components updated (`<App />`, `<Editor />` for the snapshot/restore ref API); 1 existing component deleted (`<FileHeader />`); `<Toolbar />`, `<Workspace />`, `<Preview />`, `<ErrorBanner />` unchanged in shape (App passes the active tab's derived data to them).
- 0 lib modules added; 0 lib modules removed; `fileOpen.ts` and `preferences.ts` unchanged. The existing `saveMarkdownFile`, `saveMarkdownFileAs`, `openMarkdownFile`, and `setWindowTitle` cover this feature.
- 0 new files in `src-tauri/`; 0 new capabilities; 0 new Rust deps; 0 new Tauri commands.
- 0 new npm deps, 0 new cargo deps.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Simplicity First | PASS | The new data shape is one array + one ID pointer. The state library is still React's `useState` + `useRef`. CodeMirror state preservation is a 10-line snapshot/restore via the existing `EditorView.setState` method. The close-confirm dialog is a native `<dialog>` element + three `<button>` children. No new state library, no router, no immer, no zustand, no modal library. |
| II | Cross-Platform Desktop Support | PASS | `overflow-x-auto` and the native `<dialog>` element are first-party across the three webviews. No platform-specific code introduced. |
| III | Spec-Driven Development | PASS | `spec.md` exists and passed the speckit-specify checklist; this plan derives from it. The one deliberate scope extension (untitled tabs via the existing New button) is called out in Complexity Tracking with its rationale, so reviewers can override in `/speckit-clarify` if they disagree. |
| IV | Small, Reviewable Changes | PASS (with note) | Three user stories at P1/P2/P3 are independently shippable. Recommended decomposition: PR 1 = P1 (Tab data model + TabStrip + click-to-switch + Open-adds-tab + Editor snapshot/restore); PR 2 = P2 (close affordance + ConfirmDialog + neighbor activation + empty-state transition); PR 3 = P3 (delete `<FileHeader />` + per-tab modified indicator on tab titles). If shipped as one PR, the diff stays moderate (~3 edited files, 2 new files, 1 deleted file, no new deps). |
| V | AI-Assisted but Human-Owned | PASS | This plan is AI-drafted, human-reviewed before any code lands. |
| VI | Local-First & Private by Default | PASS | No network. Tabs are in-memory only. No new persistence; existing `localStorage` keys unchanged. No new file-system capabilities; reuses the existing `fs:allow-read-text-file` + `fs:allow-write-text-file`. No telemetry, no accounts. |
| VII | Safe Markdown Rendering | PASS | The render path is untouched. Preview still receives the active tab's text and passes it through markdown-it → DOMPurify. Quickstart includes a regression step confirming the sanitizer still strips a malicious payload after switching to a tab whose content contains an XSS attempt. |
| VIII | Contributor-Friendly Open Source | PASS | The chokepoint pattern is preserved: `fileOpen.ts` still owns every Tauri I/O call, `preferences.ts` still owns every `localStorage` call. The new components are small and single-purpose (`<TabStrip />` ≈ 80 lines, `<ConfirmDialog />` ≈ 40 lines). `quickstart.md` covers every acceptance scenario. |
| IX | Quality Gates: Tests, Lint, Format, CI | PARTIAL (pre-existing) | `tsc` is enforced via `npm run build`. ESLint, Prettier, test-runner, and CI are still the unaddressed pre-existing gap from Features 002 / 003 / 004 — see Complexity Tracking row "Quality gate setup". This feature does NOT regress the gap; nothing it introduces would have been caught by tools that are still not wired up. |

**Decision**: Gate passes for this feature. Principle IX gap is pre-existing and tracked.

**Post-design re-check** (after `research.md` + `data-model.md` + `contracts/` + `quickstart.md`): No new violations introduced. The design adds zero runtime dependencies, modifies one existing component's API (`<Editor />` gains an imperative ref API for snapshot/restore), adds two small leaf components (`<TabStrip />`, `<ConfirmDialog />`), deletes one (`<FileHeader />`), and reshapes top-level state in `App.tsx` without introducing Context or a state library. The Editor's ref API is the only architectural escalation and is justified by the spec's best-effort cursor/scroll requirement (FR-001). State management stays on local React state + refs (Principle I).

## Project Structure

### Documentation (this feature)

```text
specs/006-multi-file-tabs/
├── plan.md              # This file (/speckit-plan command output)
├── spec.md              # Feature specification (already exists)
├── research.md          # Phase 0 output (this command)
├── data-model.md        # Phase 1 output (this command)
├── quickstart.md        # Phase 1 output (this command)
├── contracts/           # Phase 1 output (this command)
│   └── components.md    # UI component + state contracts
├── checklists/
│   └── requirements.md  # speckit-specify quality checklist (already exists)
└── tasks.md             # Phase 2 output (/speckit-tasks command — NOT created here)
```

### Source Code (repository root)

```text
markpad/
├── src/                              # React + TypeScript frontend
│   ├── main.tsx                      # UNCHANGED
│   ├── App.tsx                       # UPDATE: replace (text, savedText, openedFile, saving) with (tabs, activeTabId); add tab helpers (openInTab, activateTab, closeTab, updateActiveTabText); per-tab saving refs; render <TabStrip /> instead of <FileHeader />; wire <ConfirmDialog />
│   ├── styles.css                    # UNCHANGED
│   ├── components/
│   │   ├── Workspace.tsx             # UNCHANGED (still receives `text` + viewMode + onTextChange)
│   │   ├── Editor.tsx                # UPDATE: forwardRef + imperative API (getState / setState) for tab-state snapshot/restore
│   │   ├── Preview.tsx               # UNCHANGED
│   │   ├── Toolbar.tsx               # UNCHANGED (saveEnabled now driven by "active tab has a file AND active tab not saving")
│   │   ├── ErrorBanner.tsx           # UNCHANGED (reused for tab-scoped save errors with the tab name prepended to the message)
│   │   ├── FileHeader.tsx            # DELETE: the standalone active-file header is replaced by the tab strip (FR-023)
│   │   ├── TabStrip.tsx              # NEW: tab list, active highlight, modified indicator, close affordance, hover tooltip with full path
│   │   └── ConfirmDialog.tsx         # NEW: native <dialog> wrapper with three named buttons (Save / Discard / Cancel) used by close-tab-with-unsaved-changes
│   ├── lib/
│   │   ├── markdown.ts               # UNCHANGED
│   │   ├── starterContent.ts         # UNCHANGED
│   │   ├── preferences.ts            # UNCHANGED
│   │   └── fileOpen.ts               # UNCHANGED (existing openMarkdownFile / saveMarkdownFile / saveMarkdownFileAs / setWindowTitle cover this feature)
│   └── vite-env.d.ts                 # UNCHANGED
├── src-tauri/
│   ├── src/lib.rs                    # UNCHANGED
│   ├── Cargo.toml                    # UNCHANGED
│   └── capabilities/default.json     # UNCHANGED
├── index.html                        # UNCHANGED
├── package.json                      # UNCHANGED
├── vite.config.ts                    # UNCHANGED
└── tsconfig.json                     # UNCHANGED
```

**Structure Decision**: Keep the existing single-project layout. The two new components (`<TabStrip />`, `<ConfirmDialog />`) slot into `src/components/` next to `<Toolbar />` and `<ErrorBanner />`. `<FileHeader />` is deleted in the same PR that introduces `<TabStrip />` (FR-023 explicitly requires removal of the standalone header). `<Editor />` is the only existing component whose API changes: it grows a `ref` API for snapshot/restore. No new directories.

A note on what is NOT being touched: the chokepoints (`fileOpen.ts` for Tauri I/O, `preferences.ts` for `localStorage`) are intentionally untouched. Every new tab operation is composed from primitives those modules already export — `openMarkdownFile`, `saveMarkdownFile`, `saveMarkdownFileAs`, `setWindowTitle`. The "one place to grep" invariants from Features 003 / 004 (single importer of `@tauri-apps/plugin-fs`, single user of `localStorage`) are preserved.

## Complexity Tracking

| Violation / Note | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Top-level state reshape: `(text, savedText, openedFile, saving) → (tabs[], activeTabId, per-tab saving refs)` | The feature is fundamentally a state-shape change: one document → N documents. No simpler state shape supports "switch active tab without losing per-tab text and modified state" (FR-001, FR-004). The chosen shape — flat array + ID pointer — is the minimum that supports re-focus-not-duplicate (FR-011) and per-tab indicators (FR-007). | A flat `documents: Map<path, ...>` would dedup paths for free but breaks tab ORDER (FR-005 requires a deterministic order, and `Map` order is insertion order — fine in practice, but `Array` makes order explicit). Per-tab Contexts or a state library (Redux, Zustand) is exactly what the constitution Tech Constraints prohibit until local React state has demonstrably failed; it has not. |
| `<Editor />` grows an imperative ref API (`getState()` / `setState()`) | The spec requires best-effort cursor and scroll preservation across tab switches (FR-001). CodeMirror exposes this only via `EditorView.state` / `view.setState(EditorState)` — neither of which round-trips cleanly through a plain `value` prop. Exposing a tiny ref API lets `App` snapshot the outgoing tab's state and restore the incoming tab's, in two method calls. | A controlled `EditorState` prop would force `App` to import `@codemirror/state` (leaking CodeMirror into App and breaking the chokepoint that Editor owns CodeMirror). A "keyed remount per tab" approach (`<Editor key={tab.id} />`) destroys + reconstructs an `EditorView` per switch and loses cursor/scroll outright — fails FR-001. Storing N `<Editor />` instances (one per tab, hidden when inactive) mounts N CodeMirror engines and burns startup time linearly with tab count; for SC-001's 10 tabs that's ~10× the editor init work for no benefit over a single instance + snapshots. |
| Per-tab `saving` + `pendingSaveRef` (Map<TabId, boolean>) instead of one global `saving` / `pendingSaveRef` | The close-confirm Save path (FR-016) can run on a non-active tab — the user clicked Close on a background tab with unsaved changes, then chose Save. If `saving` were global, the auto-save effect (which watches the active tab) would see "saving" and refuse to schedule, even though a different tab is the one writing. Per-tab flags isolate the two operations cleanly. SC-004 ("write affects only the active tab's file in 100% of cases") is then a structural property, not a fragile invariant. | A single global `saving` flag is one race condition away from blocking the active tab's auto-save while a background-tab close-save is in flight. Adding a queue (`Promise.all` style) or a single chained `Promise` mutex is more code AND less correct (it serialises writes that don't need to be serialised — they go to different files). The per-tab Map costs one entry per open tab; for 10 tabs that's 10 booleans. |
| New `<TabStrip />` component (~80 lines incl. accessibility) | FR-005 (render the tab strip), FR-006 (file-name titles), FR-007 (per-tab modified indicator), FR-008 (truncation + tooltip), FR-009 (visible in every view mode), FR-010 (overflow without losing tabs), FR-013 (close affordance on each tab), FR-017 (visual active-tab highlight). The strip is a single-purpose component sitting at the top of the App shell — same architectural slot the deleted `<FileHeader />` occupied. | Inlining the tab list into `<Toolbar />` mixes "what am I editing" with "what controls do I have" and pushes Toolbar past the 150-line cap from the constitution's Architecture rules. Putting it inside `<Workspace />` makes it disappear in any future re-layout (and was already considered then rejected for the same reason in Feature 004 §6 — same problem here). |
| New `<ConfirmDialog />` component (~40 lines) backing the close-with-unsaved-changes prompt | FR-015 mandates a brief confirmation with at least three named choices (Save / Discard / Cancel). A bare `window.confirm()` only has two buttons (OK / Cancel) — it cannot express the three-way choice. The component is a `<dialog>` element + three buttons; no portaling, no focus-trap library — the native element handles modality, ESC-to-cancel, and focus trap for free in modern WebView2 / WKWebView / WebKitGTK. | A modal library (`react-modal`, `@radix-ui/react-dialog`, etc.) is a new runtime dep for ~40 lines of native HTML + Tailwind. `window.confirm()` cannot offer three choices. A custom `<div role="dialog">` would re-implement focus trap and ESC handling that `<dialog>` provides natively. |
| `<FileHeader />` is deleted, not retained-and-hidden | FR-023 explicitly says the standalone header is removed. Keeping it as dead code violates Principle I (Simplicity First) and IV (small reviewable changes — dead code in the PR is noise). The window-title still reflects the active file (Feature 003 FR-007), so the user-visible "what file am I editing" signal is preserved across both the tab strip (in-workspace) and the window title (in chrome). | Hiding `<FileHeader />` behind a feature flag is over-engineering for a one-way deletion that the spec mandates. Renaming it to "legacy" is also dead-code rot. The git history preserves the file for anyone needing to compare. |
| Untitled tabs supported via the existing New button (deliberate scope extension beyond spec Assumptions) | The codebase already ships a New button (`handleNewFile` in `App.tsx`, added in Feature 004's keyboard-shortcut work) that creates an in-memory document with no backing file. The spec's assumption "tabs with no backing file are out of scope" was written without acknowledging that an untitled-buffer path already exists. Choices were: (a) regress the New button (remove it or disable it during this feature), or (b) extend scope to support untitled tabs as a minimal natural fit. Option (b) is chosen: New creates an `Untitled-N` tab; saving an Untitled tab uses the existing `saveMarkdownFileAs` path (already wired); after Save-As succeeds, the tab gets a backing file path and a proper basename title. This is the smallest possible extension and keeps existing UX intact. | Option (a) — remove or disable the New button — is a user-visible regression that warrants its own spec, not a silent removal here. Option (c) — "ignore the New button and let it keep doing the wrong thing in multi-tab world (e.g., reset the active tab to empty)" — would create a broken state (other tabs survive, active tab is silently wiped). Option (b) is the only option that does no harm. Reviewers who disagree can override via `/speckit-clarify` and we'll switch to (a). |
| Quality gate setup (ESLint, Prettier, test runner, CI) STILL NOT done in this feature | Carried over from 002 / 003 / 004. Wiring up linters and CI is its own scope and decision-heavy. Bundling it into this feature would violate Principle IV. | Doing it here would balloon the PRs that ship the actual user-facing features and entangle this work with framework choices that deserve their own spec. Tracked in the project's follow-up list. |
