---

description: "Task list for Feature 006 — Multi-File Editing with Tabs"
---

# Tasks: Multi-File Editing with Tabs

**Input**: Design documents from `/specs/006-multi-file-tabs/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/components.md](contracts/components.md), [quickstart.md](quickstart.md)

**Tests**: Not requested by the spec. Acceptance is exercised manually via [quickstart.md](quickstart.md) (38 numbered steps mapped to FR / SC IDs). The pre-existing Principle IX gap (no test runner, no ESLint, no Prettier, no CI) is carried over from Features 002 / 003 / 004 and is explicitly out of scope here (see [plan.md](plan.md) Complexity Tracking row "Quality gate setup").

**Organization**: Tasks are grouped by user story so each story can be implemented, reviewed, and shipped as its own PR — matching plan.md's recommended decomposition (PR 1 = P1, PR 2 = P2, PR 3 = P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in the same phase)
- **[Story]**: User-story tag (US1, US2, US3) — present on user-story phase tasks only
- All paths are repository-relative; absolute paths begin at the repo root `C:/opswat/home/milf/`

## Path Conventions

- **Frontend**: `src/` (React + TypeScript + Vite)
- **Rust / Tauri**: `src-tauri/`
- **Specs**: `specs/006-multi-file-tabs/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: This feature adds no Tauri capabilities, no npm/cargo dependencies, no new lib modules, no new Rust code, and no new test infrastructure (see [plan.md](plan.md) Technical Context). Phase 1 is intentionally empty; the first executable task is the Phase 2 foundational `<Editor />` ref API change.

*(No tasks.)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the imperative ref API to `<Editor />` so the multi-tab snapshot/restore mechanism in US1 has something to call. This phase MUST complete before US1 begins. US2 and US3 do not strictly depend on this task, but the recommended order is to land T001 first so all three stories share the same foundation.

**CRITICAL**: T001 blocks US1's per-tab state preservation (FR-001's best-effort cursor and scroll requirement).

- [X] T001 Extend `src/components/Editor.tsx` with the `forwardRef` + `useImperativeHandle` API the App will use to snapshot and restore per-tab `EditorState` ([research.md](research.md) §3, [contracts/components.md](contracts/components.md#4-editor--updated--gains-an-imperative-api)):
  1. Add the imports: `import { forwardRef, useImperativeHandle } from "react";` (extend the existing `import { useEffect, useRef } from "react";` line). Add `import type { EditorState } from "@codemirror/state";` (the `EditorState` import is type-only — keep it `import type` to satisfy `verbatimModuleSyntax`).
  2. Export a new type alongside `EditorProps`: `export type EditorHandle = { getState(): EditorState; setState(state: EditorState): void; };`.
  3. Convert the existing `export default function Editor({ value, onChange }: EditorProps)` into a `forwardRef<EditorHandle, EditorProps>` wrapping the same body. Set `Editor.displayName = "Editor";` after the `forwardRef` call so React DevTools still shows a friendly name.
  4. Inside the body, add `useImperativeHandle(ref, () => ({ getState: () => viewRef.current!.state, setState: (state) => viewRef.current!.setState(state) }), [])` right after the `onChangeRef` `useEffect`. The empty dep array is correct: the handle reads `viewRef.current` lazily on each call, so re-creating it on every render is pointless. The non-null assertions on `viewRef.current` are safe because `getState` and `setState` are only ever called by `App` from handlers that run AFTER the mount effect has populated the ref; if they're somehow called before mount, throwing is the correct fail-loud behaviour.
  5. Do NOT change the existing `useEffect` that syncs `value` → doc on prop changes (the existing guard `if (current !== value)` already prevents clobbering a freshly-restored state — restored state's doc IS `value` by the time the layout effect runs).
  6. Confirm the file still passes `npm run build` (the existing call site in `<Workspace />` that renders `<Editor value={text} onChange={onTextChange} />` continues to work — `forwardRef` accepts the same props with an optional ref).

**Checkpoint**: The Editor accepts a ref. No behaviour change is observable yet. All three user stories can now proceed (US1 depends on this; US2 and US3 do not, but the recommended order is US1 → US2 → US3).

---

## Phase 3: User Story 1 - Keep several files open and switch between them (Priority: P1) 🎯 MVP

**Goal**: The user can open multiple markdown files at once; each open file gets its own tab; the tab strip is rendered above the toolbar; clicking a tab switches the editor and preview to that tab's content while preserving every other tab's text, modified flag, and best-effort cursor/scroll position; the New button adds an `Untitled-N` tab; opening a file that already has a tab re-focuses the existing tab rather than duplicating it; manual Save and auto-save act on the active tab only. The Feature 004 `<FileHeader />` is **still rendered** at the end of this story (deletion ships with US3); during US1 the FileHeader and TabStrip both reflect the active tab's name, which is visually redundant but harmless.

**Independent Test**: Run `npm run tauri dev`. Walk through quickstart.md Scenario A (steps 1–11): launch shows an empty tab strip; opening `notes.md` adds a tab; opening `readme.md` adds a second tab and activates it; clicking back to `notes.md` shows preserved content and asterisk; Save clears only the active tab's asterisk; auto-save clears only the active tab; re-opening `notes.md` re-focuses rather than duplicates. Maps to spec FR-001 through FR-012, FR-019, FR-020, FR-025, and SC-001 through SC-004, SC-008.

### Implementation for User Story 1

- [X] T002 [P] [US1] Create `src/components/TabStrip.tsx` as a pure presentational component ([contracts/components.md](contracts/components.md#2-tabstrip--new), [research.md](research.md) §9, §10):
  1. Define the props type:
     ```ts
     import type { Tab, TabId } from "../App";
     type TabStripProps = {
       tabs: Tab[];
       activeTabId: TabId | null;
       onActivate(id: TabId): void;
       onClose(id: TabId): void;
     };
     ```
     (Export `Tab` and `TabId` from `App.tsx` in T003 so this import resolves; alternatively define the two types inline at the top of `TabStrip.tsx` and re-import from there into App — pick whichever the team finds cleanest. The simpler option is to add the type exports in T003 since App is the state owner.)
  2. Outer container: `<div role="tablist" aria-label="Open files" className="flex items-center gap-1 overflow-x-auto px-2 py-1.5 rounded-2xl bg-[color:var(--islands-surface)] ring-1 ring-[color:var(--islands-ring)] shadow-sm backdrop-blur flex-nowrap min-w-0">` — same islands aesthetic as `<FileHeader />` and `<Toolbar />`, with `overflow-x-auto` + `flex-nowrap` for the FR-010 overflow behaviour.
  3. When `tabs.length === 0`, render a single faded span inside the container, e.g. `<span className="text-sm text-[color:var(--islands-muted)] px-2">No files open</span>`, and return early. This keeps the band height consistent so vertical layout does not jump as tabs come and go ([research.md](research.md) §8).
  4. Otherwise, map `tabs` to a list of pills. Each pill is a `<button type="button" role="tab">` with:
     - `aria-selected={tab.id === activeTabId}` and `tabIndex={tab.id === activeTabId ? 0 : -1}` (standard tab-list roving-tabindex pattern).
     - `title={tab.openedFile?.path ?? tab.untitledLabel ?? "Untitled"}` so hover discloses the full path (FR-008).
     - `onClick={() => onActivate(tab.id)}` and keyboard `onKeyDown={e => { if (e.key === "Delete") onClose(tab.id); }}` for the optional Delete-to-close affordance.
     - className chain `flex items-center gap-1.5 px-2 py-1 min-w-0 max-w-[180px] rounded-md ring-1 ring-[color:var(--islands-ring)] text-sm cursor-pointer select-none transition-colors`. When active, append `bg-[color:var(--islands-ring)]`; when inactive, append `hover:bg-[color:var(--islands-ring)]/50`.
  5. Inside each pill, render in order:
     - The modified asterisk when `tab.text !== tab.savedText`: `{isModified && <span aria-label="modified" className="select-none">*</span>}`.
     - The display name: `<span className="truncate flex-1 min-w-0">{tab.openedFile?.name ?? tab.untitledLabel ?? "Untitled"}</span>`.
     - The close button: a separate `<span role="button" aria-label={\`Close ${displayName}\`} onClick={e => { e.stopPropagation(); onClose(tab.id); }} className="inline-flex items-center justify-center rounded p-0.5 hover:bg-[color:var(--islands-ring)]/60">` containing a small × SVG (reuse the `CloseIcon` pattern from `<ErrorBanner />` at a smaller size). `e.stopPropagation()` is critical so clicking × does not also fire the pill's `onActivate`.
  6. Add an active-tab auto-scroll effect: keep a `useRef<Map<TabId, HTMLButtonElement | null>>(new Map())` and a `ref` callback on each pill that records its DOM node. Then `useEffect(() => { const node = tabRefs.current.get(activeTabId ?? ""); node?.scrollIntoView({ behavior: "instant", inline: "nearest", block: "nearest" }); }, [activeTabId]);` so the active pill is always reachable on screen ([research.md](research.md) §9).
  7. Component stays well under the Constitution's ~150-line ceiling (target ~80 lines including imports, SVG, and accessibility hooks).
  8. No state of its own beyond the refs map; no calls into `lib/*`; no Tauri imports. Pure presentation.

- [X] T003 [US1] Reshape `src/App.tsx` from "single document" to "tabs[] + activeTabId" ([data-model.md](data-model.md), [research.md](research.md) §1–§5, §7, §11, [contracts/components.md](contracts/components.md#1-apptsx-state-owner)). This is the largest task in the feature; sequencing the bullets below as listed makes the file type-check at each intermediate state, even though the natural commit is one logical unit.

  **Types and helpers**

  1. At the top of the file (above the `App` function) export the tab types so `<TabStrip />` can import them:
     ```ts
     export type TabId = string;
     export type Tab = {
       id: TabId;
       text: string;
       savedText: string;
       openedFile: { name: string; path: string } | null;
       untitledLabel: string | null;
     };
     ```
  2. Add a monotonic-counter ID helper at module scope (above the component): `const nextTabId = (() => { let n = 0; return (): TabId => \`tab-${++n}\`; })();` ([research.md](research.md) §1).
  3. Add a helper `function makeUntitledLabel(existing: Tab[]): string` that scans `existing` for tabs with `openedFile === null`, parses the trailing number from their `untitledLabel` (if any), and returns `Untitled-${max + 1}` (or `Untitled-1` if none exist) ([research.md](research.md) §11).
  4. Remove the unused `starterContent` import once it stops being referenced (after the state reshape below). Keep the `src/lib/starterContent.ts` file in place — it is unused by this feature but is not deleted here ([contracts/components.md](contracts/components.md#10-files-touched-at-a-glance) — its deletion is out of scope).

  **State**

  5. Delete the existing state declarations for `text`, `savedText`, `openedFile`, and `saving`.
  6. Add new state:
     ```ts
     const [tabs, setTabs] = useState<Tab[]>([]);
     const [activeTabId, setActiveTabId] = useState<TabId | null>(null);
     const [savingByTab, setSavingByTab] = useState<Record<TabId, boolean>>({});
     ```
  7. Keep the existing `error`, `viewMode`, `theme`, `autoSave` state unchanged.
  8. Add new refs:
     ```ts
     const editorStatesRef = useRef<Map<TabId, EditorState>>(new Map());
     const editorRef = useRef<EditorHandle>(null);
     const pendingSaveRef = useRef<Map<TabId, boolean>>(new Map());
     const [pendingClose, setPendingClose] = useState<TabId | null>(null); // used by US2; declare here so the auto-save effect dep array is final
     ```
     Add the corresponding imports at the top: `import type { EditorState } from "@codemirror/state";` and `import type { EditorHandle } from "./components/Editor";`.
  9. Remove the existing `pendingSaveRef` scalar declaration.

  **Derived values (computed inline in the render body, no state)**

  10. Add (above the `return`): `const activeTab = tabs.find(t => t.id === activeTabId) ?? null;` and `const activeText = activeTab?.text ?? "";` and `const isModified = activeTab !== null && activeTab.text !== activeTab.savedText;` and `const saveEnabled = activeTab !== null && !(savingByTab[activeTab.id] ?? false);` (the Untitled-save case is handled inside `performSave` via the existing Save-As fallback; see [research.md](research.md) §11).

  **Per-tab updaters**

  11. Add `function updateTab(id: TabId, patch: (t: Tab) => Tab) { setTabs(prev => prev.map(t => t.id === id ? patch(t) : t)); }`.
  12. Add `function updateActiveTabText(next: string) { if (activeTabId === null) return; updateTab(activeTabId, t => ({ ...t, text: next })); }` — this replaces the previous `setText` direct call site.

  **Tab activation with snapshot/restore**

  13. Add `function activateTab(nextId: TabId | null) { if (activeTabId !== null && editorRef.current && activeTabId !== nextId) { editorStatesRef.current.set(activeTabId, editorRef.current.getState()); } setActiveTabId(nextId); }`. This snapshots the outgoing tab's `EditorState` BEFORE the React state update, so the snapshot is captured against the pre-switch DOM.
  14. Add the restore effect:
      ```ts
      useLayoutEffect(() => {
        if (activeTabId === null) return;
        const snapshot = editorStatesRef.current.get(activeTabId);
        if (snapshot && editorRef.current) {
          editorRef.current.setState(snapshot);
        }
      }, [activeTabId]);
      ```
      `useLayoutEffect` (not `useEffect`) is critical — it runs synchronously after DOM commit and before paint so the user never sees a "wrong cursor" frame ([research.md](research.md) §3).

  **Open / New handlers**

  15. Rewrite `handleOpenFile`:
      ```ts
      async function handleOpenFile() {
        const result = await openMarkdownFile();
        if (result.kind === "ok") {
          const existing = tabs.find(t => t.openedFile?.path === result.path);
          if (existing) {
            activateTab(existing.id);
            setError(null);
            return;
          }
          const newTab: Tab = {
            id: nextTabId(),
            text: result.content,
            savedText: result.content,
            openedFile: { name: result.name, path: result.path },
            untitledLabel: null,
          };
          setTabs(prev => [...prev, newTab]);
          activateTab(newTab.id);
          setError(null);
        } else if (result.kind === "error") {
          setError(result.message);
        }
        // kind === "cancelled": no-op
      }
      ```
      ([research.md](research.md) §2 — path-equality dedup; in-memory edits preserved on re-open.)
  16. Rewrite `handleNewFile`:
      ```ts
      function handleNewFile() {
        const label = makeUntitledLabel(tabs);
        const newTab: Tab = {
          id: nextTabId(),
          text: "",
          savedText: "",
          openedFile: null,
          untitledLabel: label,
        };
        setTabs(prev => [...prev, newTab]);
        activateTab(newTab.id);
        setError(null);
      }
      ```
      ([research.md](research.md) §11.)

  **Save handler — per-tab**

  17. Rewrite `performSave` to accept a `tabId` argument (default to `activeTabId` when called from the global Save button):
      ```ts
      async function performSave(tabId: TabId | null = activeTabId) {
        if (tabId === null) return;
        if (savingByTab[tabId]) {
          pendingSaveRef.current.set(tabId, true);
          return;
        }
        const tab = tabs.find(t => t.id === tabId);
        if (!tab) return;
        setSavingByTab(prev => ({ ...prev, [tabId]: true }));
        const outbound = tab.text;
        const result = tab.openedFile === null
          ? await saveMarkdownFileAs(outbound, "Untitled.md")
          : await saveMarkdownFile(tab.openedFile.path, outbound);
        if (result.kind === "ok") {
          updateTab(tabId, t => ({
            ...t,
            savedText: outbound,
            openedFile: t.openedFile ?? { name: (result as { name: string }).name, path: (result as { path: string }).path },
            untitledLabel: t.openedFile ?? (result as { name: string }).name ? null : t.untitledLabel,
          }));
          setError(null);
        } else if (result.kind === "error") {
          const tabName = tab.openedFile?.name ?? tab.untitledLabel ?? "Untitled";
          setError(`Could not save ${tabName}: ${result.message}`);
        }
        setSavingByTab(prev => ({ ...prev, [tabId]: false }));
        if (pendingSaveRef.current.get(tabId)) {
          pendingSaveRef.current.set(tabId, false);
          queueMicrotask(() => { void performSave(tabId); });
        }
      }
      ```
      (Inline cast-narrowing on `result` is necessary because `SaveResult` is a "ok | error" union while `SaveAsResult` is "ok with name+path | cancelled | error" — but `performSave` only reads `result.kind === "ok"` and the name/path are present on the Save-As ok branch and synthesised from the existing path on the plain save branch. See [research.md](research.md) §4 and §11 for the rationale; see [src/lib/fileOpen.ts](../../src/lib/fileOpen.ts) for the result types.)
  18. Update `handleSave` to use the new signature: `function handleSave() { void performSave(); }` — unchanged shape, now defaults to the active tab.

  **Auto-save effect — keyed on the active tab**

  19. Replace the existing auto-save `useEffect` with the active-tab-scoped version ([research.md](research.md) §5):
      ```ts
      useEffect(() => {
        if (!autoSave) return;
        if (activeTab === null) return;
        if (activeTab.openedFile === null) return;
        if (activeTab.text === activeTab.savedText) return;
        if (savingByTab[activeTab.id]) return;
        const id = setTimeout(() => { void performSave(activeTab.id); }, AUTO_SAVE_DEBOUNCE_MS);
        return () => clearTimeout(id);
        // performSave reads latest state via closure; intentionally not in deps.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [activeTabId, tabs, autoSave, savingByTab]);
      ```
      The dep array uses `tabs` (not `activeTab.text` / `activeTab.savedText`) because the active tab's fields live inside `tabs`; React's shallow-compare on the array reference triggers re-runs when any `setTabs` happens.

  **Window title effect**

  20. Update the existing window-title effect to follow the active tab:
      ```ts
      useEffect(() => {
        setWindowTitle(activeTab?.openedFile?.name ?? null);
      }, [activeTabId, activeTab?.openedFile?.name]);
      ```

  **Keyboard shortcut refs**

  21. Update `handleSaveRef`, `handleNewFileRef`, `handleOpenFileRef` and the global keydown effect — the shape stays identical (the refs already hold the latest handler; the handlers now operate on the active tab). No changes to the listener body beyond what naturally follows from the handler reshape above.

  **Render**

  22. Inside the `return`, before `<FileHeader />` (which stays rendered until US3 deletes it), insert:
      ```tsx
      <TabStrip
        tabs={tabs}
        activeTabId={activeTabId}
        onActivate={activateTab}
        onClose={handleCloseTab /* placeholder until US2 lands */}
      />
      ```
      For US1, define a temporary `function handleCloseTab(id: TabId) { /* US2 will fill this in */ }` so the prop type-checks. (The close × in TabStrip is harmless during US1 — clicking it is a no-op until US2 wires it up.)
  23. Keep the existing `<FileHeader />` render line UNCHANGED in this task. Both `<FileHeader />` and `<TabStrip />` will be visible at the end of US1, showing redundant active-file info. US3 (T007 / T008) removes `<FileHeader />`.
  24. Update `<FileHeader />`'s props from `openedFile?.name / openedFile?.path / isModified` to `activeTab?.openedFile?.name ?? null / activeTab?.openedFile?.path ?? null / isModified` so the existing component still type-checks against the new state shape.
  25. Update `<Toolbar />`'s `saveEnabled` and `saving` props: `saveEnabled={saveEnabled}` and `saving={activeTab !== null && (savingByTab[activeTab.id] ?? false)}`. Keep the other props unchanged.
  26. Update `<Workspace />`'s `text` prop: `text={activeText}` (replace the previous `text={text}`); `onTextChange={updateActiveTabText}` (replace the previous direct `setText`). Add an `editorRef={editorRef}` prop — this requires the Workspace update in T004.

  **Imports**

  27. Add `useLayoutEffect` to the React import.
  28. Add `import TabStrip from "./components/TabStrip";`.
  29. Confirm no stale references to `text`, `savedText`, `openedFile`, `saving`, or `setText` remain anywhere in `App.tsx`. Search the file before closing the task.

- [X] T004 [P] [US1] Update `src/components/Workspace.tsx` to forward the editor ref ([contracts/components.md](contracts/components.md#5-workspace--unchanged-in-shape)):
  1. Extend `WorkspaceProps` with `editorRef?: Ref<EditorHandle>`. Import `Ref` from React and `EditorHandle` from `./Editor`.
  2. Destructure `editorRef` from props in the component signature.
  3. Pass `ref={editorRef}` to the `<Editor />` element. The existing `value={text}` and `onChange={onTextChange}` props stay.
  4. No other behaviour changes. The component continues to handle view-mode visibility exactly as it did in Feature 003.

**Checkpoint**: User Story 1 ships independently. Multiple files can be opened into separate tabs; clicking a tab switches the editor and preview; the New button creates `Untitled-N` tabs; opening a file already in a tab re-focuses it; per-tab modified indicators appear in the tab strip; Save and auto-save act on the active tab only; cursor and scroll are preserved across tab switches. The `<FileHeader />` is still rendered (US3 removes it). The close × on each tab is a no-op until US2 lands. Quickstart Scenario A passes end-to-end.

---

## Phase 4: User Story 2 - Close a tab when done with that file (Priority: P2)

**Goal**: Each tab carries a close affordance. Clicking it removes a clean tab immediately; clicking it on a tab with unsaved changes opens a small `<ConfirmDialog />` offering Save / Discard / Cancel. Closing the active tab activates a sensible neighbor. Closing the last tab returns the workspace to the empty state (FR-003).

**Independent Test**: Continue from the end of US1's quickstart (Scenario A). Walk through Scenario B (steps 12–22): close an unmodified tab → it disappears with no prompt; type into a tab and close it → confirmation dialog appears; choose each of Save / Discard / Cancel and verify the file-on-disk outcome; close the active tab → a neighbor activates; close the last tab → empty state. Maps to spec FR-013 through FR-018, FR-022, and SC-005, SC-006.

### Implementation for User Story 2

- [X] T005 [P] [US2] Create `src/components/ConfirmDialog.tsx` as a pure presentational wrapper around the native `<dialog>` element ([contracts/components.md](contracts/components.md#3-confirmdialog--new), [research.md](research.md) §6):
  1. Define the props type:
     ```ts
     type ConfirmDialogProps = {
       open: boolean;
       title: string;
       message: string;
       onSave(): void;
       onDiscard(): void;
       onCancel(): void;
     };
     ```
  2. Inside the component, `const dialogRef = useRef<HTMLDialogElement>(null);`. Use a `useEffect([open])` that calls `dialogRef.current?.showModal()` when `open` becomes true and `dialogRef.current?.close()` when it becomes false. Guard both calls with `dialogRef.current?.open !== <desired-state>` to avoid double-invocations.
  3. Attach `onCancel={onCancel}` to the `<dialog>` element so ESC dispatches the cancel branch. Also bind it via `useEffect([])` if attribute-style listeners don't suffice (most modern WebViews accept React's `onCancel` directly on `<dialog>`).
  4. Body markup:
     ```tsx
     <dialog
       ref={dialogRef}
       onCancel={(e) => { e.preventDefault(); onCancel(); }}
       className="rounded-2xl bg-[color:var(--islands-surface)] ring-1 ring-[color:var(--islands-ring)] shadow-lg p-6 max-w-md backdrop:bg-black/30 backdrop:backdrop-blur-sm text-[color:var(--islands-text)]"
       aria-labelledby="confirm-dialog-title"
       aria-describedby="confirm-dialog-message"
     >
       <h2 id="confirm-dialog-title" className="text-base font-semibold mb-2">{title}</h2>
       <p id="confirm-dialog-message" className="text-sm mb-4">{message}</p>
       <div className="flex justify-end gap-2">
         <button type="button" autoFocus onClick={onSave} className={buttonBase}>Save</button>
         <button type="button" onClick={onDiscard} className={buttonBase}>Discard</button>
         <button type="button" onClick={onCancel} className={buttonBase}>Cancel</button>
       </div>
     </dialog>
     ```
     where `buttonBase` is the same Tailwind chain `<Toolbar />` uses (copy it inline at the top of this file, or factor it into a small shared utility — copying is simpler and matches `<ErrorBanner />`'s pattern).
  5. The dialog should NOT close on backdrop click — the user must press one of the three buttons (or ESC = Cancel). Native `<dialog>` already requires explicit `close()` (no backdrop-dismiss); this is satisfied for free.
  6. Component stays well under ~50 lines. No state of its own; the `dialogRef` is the only ref.

- [X] T006 [US2] Wire the close-tab flow in `src/App.tsx` ([data-model.md](data-model.md#2-tabset-workspace-state-at-the-app-level) state transitions, [research.md](research.md) §6, §7):
  1. The `pendingClose: TabId | null` state was declared in T003; it begins life unused. T006 wires it up.
  2. Replace the placeholder `handleCloseTab(id)` from T003 with the real implementation:
     ```ts
     function handleCloseTab(id: TabId) {
       const tab = tabs.find(t => t.id === id);
       if (!tab) return;
       const isModifiedTab = tab.text !== tab.savedText;
       if (!isModifiedTab) {
         removeTab(id);
         return;
       }
       setPendingClose(id);
     }
     ```
  3. Add `function removeTab(id: TabId)`:
     ```ts
     function removeTab(id: TabId) {
       const idx = tabs.findIndex(t => t.id === id);
       if (idx < 0) return;
       const wasActive = activeTabId === id;
       const next = tabs.filter(t => t.id !== id);
       setTabs(next);
       editorStatesRef.current.delete(id);
       pendingSaveRef.current.delete(id);
       setSavingByTab(prev => { const out = { ...prev }; delete out[id]; return out; });
       if (wasActive) {
         const neighbor = next[idx] ?? next[idx - 1] ?? null;
         activateTab(neighbor?.id ?? null);
       }
       // If the closed tab was the active tab and was holding the dialog open
       // for itself, clear pendingClose. (Belt + braces — the confirm handlers
       // already clear it.)
       setPendingClose(prev => (prev === id ? null : prev));
     }
     ```
     ([research.md](research.md) §7 — right-neighbor-first, fallback to left.)
  4. Add the three confirm handlers:
     ```ts
     async function handleConfirmSave() {
       if (pendingClose === null) return;
       const id = pendingClose;
       await performSave(id);
       // If performSave succeeded, error is null; if it failed, error was set.
       // We can't read state synchronously here, so check the tab's modified
       // status fresh:
       const stillModified = tabs.find(t => t.id === id) && tabs.find(t => t.id === id)!.text !== tabs.find(t => t.id === id)!.savedText;
       if (stillModified) {
         // Save failed; leave the tab and the error banner. Cancel the close.
         setPendingClose(null);
         return;
       }
       removeTab(id);
       setPendingClose(null);
     }

     function handleConfirmDiscard() {
       if (pendingClose === null) return;
       removeTab(pendingClose);
       setPendingClose(null);
     }

     function handleConfirmCancel() {
       setPendingClose(null);
     }
     ```
     The `stillModified` check works because `performSave` updates `tabs` (via `updateTab`) on success and sets `error` on failure. Reading `tabs` immediately after `await performSave` may be a stale closure — to be safe, structure `performSave` to return a discriminated result and branch on that (`const ok = await performSave(id); if (!ok) { setPendingClose(null); return; }`). Either approach is acceptable; the explicit return is cleaner. Adjust `performSave`'s signature in T003 to return `Promise<boolean>` (true = success, false = failure) if implementing the explicit-return form; otherwise keep the closure-read check as shown.
  5. Render the dialog at the bottom of the returned tree (sibling to the error banner — visual ordering does not matter for a `<dialog>` element):
     ```tsx
     <ConfirmDialog
       open={pendingClose !== null}
       title={(() => {
         const t = tabs.find(t => t.id === pendingClose);
         const name = t?.openedFile?.name ?? t?.untitledLabel ?? "Untitled";
         return `Save changes to ${name}?`;
       })()}
       message="You have unsaved changes. Save them now, discard them, or cancel and keep the tab open?"
       onSave={() => { void handleConfirmSave(); }}
       onDiscard={handleConfirmDiscard}
       onCancel={handleConfirmCancel}
     />
     ```
  6. Add `import ConfirmDialog from "./components/ConfirmDialog";` at the top.
  7. Update `<TabStrip />`'s `onClose` prop to point at `handleCloseTab` (it already does after T003's placeholder — confirm).

**Checkpoint**: User Story 2 ships independently. Closing a clean tab is instant; closing a modified tab opens the confirm dialog with three buttons; each button does the right thing; closing the active tab activates a neighbor; closing the last tab leaves the empty state. The `<FileHeader />` is still rendered (US3 removes it). Quickstart Scenario B (steps 12–22) passes end-to-end.

---

## Phase 5: User Story 3 - Replace the top file-name header with the tab strip (Priority: P3)

**Goal**: Delete the standalone `<FileHeader />` so the tab strip is the sole in-workspace indicator of the active file (FR-023). The window title (Feature 003 FR-007) is preserved unchanged (FR-024). The per-tab modified indicator inside `<TabStrip />` was already implemented in US1's T002; US3 is the cleanup PR.

**Independent Test**: Walk through quickstart Scenario C (steps 23–29). The standalone "filename + asterisk" header above the toolbar is gone; the tab strip is the only in-workspace surface that shows file names and modified state; the OS window title still says `<filename> — MILF` for the active tab; long filenames truncate inside pills with a hover tooltip; the tab strip remains visible across all view modes. Maps to spec FR-007, FR-008, FR-009, FR-010, FR-023, FR-024, and SC-009.

### Implementation for User Story 3

- [X] T007 [US3] Update `src/App.tsx` to remove the `<FileHeader />` import and render site:
  1. Delete the line `import FileHeader from "./components/FileHeader";` at the top.
  2. Delete the `<FileHeader fileName={…} fullPath={…} isModified={isModified} />` element from the returned tree.
  3. Confirm `<TabStrip />` remains the first child of `<div className={appShell}>`. Vertical layout is now `[TabStrip] → [Toolbar] → [ErrorBanner?] → [Workspace] → [ConfirmDialog]`.
  4. Confirm no remaining references to `FileHeader` in the file (search the file before closing the task).

- [X] T008 [P] [US3] Delete the `src/components/FileHeader.tsx` file. There are no other importers after T007. Use `git rm src/components/FileHeader.tsx` so the deletion is properly tracked in the commit.

**Checkpoint**: All three user stories are now complete. The workspace top-down ordering is TabStrip → Toolbar → optional ErrorBanner → Workspace. No standalone "file name" header is rendered. Quickstart Scenario C (steps 23–29) passes end-to-end. The window title (Feature 003 FR-007) is unaffected.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the gates the Constitution requires (Principle IX type-check), exercise the manual acceptance walkthrough end-to-end, and re-confirm the chokepoint invariants the contracts depend on. None of these tasks add behaviour — they are quality gates.

- [X] T009 Run `npm run build` from the repo root. Must complete with zero TypeScript errors. This satisfies the only Quality Gate currently wired up in CI-able form (Constitution Principle IX — see [plan.md](plan.md) Complexity Tracking row "Quality gate setup"). Look out for: missing `useLayoutEffect` / `forwardRef` imports, the `EditorHandle` type not being exported from `Editor.tsx`, prop-type drift between `<App />` and `<TabStrip />` (especially around `Tab` / `TabId` exports), `EditorState` import-type issues under `verbatimModuleSyntax`, and any stale `text` / `setText` / `openedFile` references left behind by the T003 reshape.

- [X] T010 Execute the manual acceptance walkthrough end-to-end: open the app via `npm run tauri dev` and step through all 38 steps in [quickstart.md](quickstart.md). Record any deviation against the relevant FR/SC ID in a scratch note for the PR description. Pay particular attention to:
  - Step 5 (best-effort cursor/scroll preserved across tab switches — the FR-001 / research.md §3 hot spot).
  - Step 19 (save-failure during close-confirm leaves the tab open with the error banner — the FR-016 hot spot).
  - Step 30 (re-open with unsaved edits preserves in-memory content — the FR-011 hot spot).
  - Step 32 (auto-save in flight + tab close — the FR-022 corruption-prevention hot spot).
  - Step 33 (XSS regression after tab switch — the Principle VII / Feature 002 sanitiser regression check).
  - Step 37 (Untitled tab via the existing New button — the deliberate scope extension documented in [plan.md](plan.md) Complexity Tracking and [research.md](research.md) §11; this is the step most likely to surface unexpected behaviour if Save-As cancellation is mis-handled).

- [X] T011 Verify single-chokepoint invariants by grep, per [contracts/components.md](contracts/components.md#10-files-touched-at-a-glance) and the Feature 003 / 004 carry-over rules:
  - `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`, and `@tauri-apps/api/webviewWindow` must appear **only** in `src/lib/fileOpen.ts`.
  - `localStorage` must appear **only** in `src/lib/preferences.ts` (the bootstrap script in `index.html` is the documented exception — it reads `milf.theme` for the no-flash-of-wrong-theme effect; it MUST NOT read tab-related data because tabs do not persist).
  - `@codemirror/state` and `@codemirror/view` may newly appear in `src/App.tsx` (the `EditorState` and `EditorHandle` types are imported) and in `src/components/Editor.tsx` (the existing importer). No other module should pull in CodeMirror types.

  Use `Grep` for `@tauri-apps/plugin-fs|@tauri-apps/plugin-dialog|@tauri-apps/api/webviewWindow` across `src/`, a separate grep for `localStorage` across `src/` and `index.html`, and a third grep for `@codemirror/(state|view)` across `src/`. Any extra match is a chokepoint violation to fix.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** — Empty. No tasks; nothing to depend on.
- **Foundational (Phase 2)** — T001 has no dependencies; can start immediately.
- **User Stories (Phases 3–5)** — US1 depends on T001 (the `EditorHandle` API). US2 depends on US1 (it wires up the `pendingClose` state declared in T003 and uses `removeTab` against the `tabs` state created in T003). US3 depends on US1 (it removes `<FileHeader />` from the App tree that T003 still renders).
- **Polish (Phase 6)** — T009 / T010 / T011 run after all user-story phases that are in scope for the current PR.

### User Story Dependencies

- **US1 (P1)** — Depends on T001 (Phase 2). The MVP for this feature.
- **US2 (P2)** — Depends on US1's T003 (the tab state shape and `pendingClose` placeholder). Cannot ship before US1.
- **US3 (P3)** — Depends on US1's T003 (the `<TabStrip />` render site that replaces `<FileHeader />`). Cannot ship before US1. Independent of US2 — US3 can ship before or after US2 if scope must be split.

### Within Each User Story

- US1: T002 (new `<TabStrip />` file) and T003 (App.tsx reshape) touch different files but T003 imports `<TabStrip />`; they must both land together for type-check to pass. T002 has no dependency on T003 internally — it can be drafted in parallel. T004 (Workspace.tsx) is a small ref-forwarding change that lands alongside T003.
- US2: T005 (new `<ConfirmDialog />` file) is independent of T006 (App.tsx wiring) up until T006 imports it. T005 [P] then T006.
- US3: T007 (App.tsx edit) and T008 (file delete) are different files and order-independent. Both can land in either order; the recommended order is T007 first so the deleted file has no remaining importers when `git rm` runs.

### Parallel Opportunities

- Within Phase 3 (US1): T002 [P] (new `<TabStrip />` file, no App dependencies if you stub the types inline initially) can be developed alongside T003 (App reshape). They merge when T003 imports `TabStrip` and the `Tab` / `TabId` types resolve.
- Within Phase 4 (US2): T005 [P] (new `<ConfirmDialog />` file) is independent until T006 imports it.
- Within Phase 5 (US3): T007 and T008 are independent — T008 [P]. Order them as preferred.
- Across phases with parallel staffing: once T001 lands, two developers can work in parallel: one on US1 (T002 + T003 + T004), another on US2's `<ConfirmDialog />` (T005) since it is a standalone presentational file. The US2 wiring (T006) and US3 (T007 + T008) must wait for US1.

---

## Parallel Example: User Story 1

```text
# Once Phase 2 (T001) is complete, the two new-file tasks and the App reshape
# can be sequenced as below. T002 and T003 touch different files but T003
# imports from T002; pair them carefully:

Task T002 [P] [US1]: Create src/components/TabStrip.tsx — pure presentational, takes tabs / activeTabId / onActivate / onClose props; renders pills with modified asterisk, truncated names, close ×, active highlight, and overflow-x-auto.

Task T003 [US1]: Reshape src/App.tsx — state shape (tabs[] / activeTabId / savingByTab / pendingClose), refs (editorStatesRef / editorRef / pendingSaveRef), helpers (nextTabId / makeUntitledLabel / updateTab / updateActiveTabText / activateTab), handlers (handleOpenFile dedup / handleNewFile Untitled-N / performSave per-tab / handleSave), effects (useLayoutEffect restore / window title / auto-save), render (TabStrip + still-rendered FileHeader during US1; ConfirmDialog placeholder; Toolbar + Workspace wiring).

Task T004 [US1]: Update src/components/Workspace.tsx — add optional editorRef prop and forward it to <Editor />.
```

## Parallel Example: User Story 2

```text
# T005 is independent of T006 until T006 imports it. Develop in parallel:

Task T005 [P] [US2]: Create src/components/ConfirmDialog.tsx — native <dialog> with Save/Discard/Cancel; showModal/close based on `open` prop; onCancel wires ESC; backdrop styled but non-dismissive.

Task T006 [US2]: Wire src/App.tsx — handleCloseTab, removeTab (with neighbor activation + editorStatesRef.delete + savingByTab cleanup), handleConfirmSave/Discard/Cancel, render <ConfirmDialog /> with the active pendingClose tab's name in the title.
```

---

## Implementation Strategy

### MVP First (User Story 1 Only — PR 1)

1. Complete Phase 2 (T001 — Editor ref API).
2. Complete Phase 3 (T002 + T003 + T004 — TabStrip + App reshape + Workspace ref forwarding).
3. Run Phase 6 partial: T009 type-check + T010 (quickstart Scenario A only, steps 1–11) + T011 chokepoint grep.
4. Open PR 1: "Multi-tab open and switch". Reviewable in a single sitting (~3 edited files, 1 new file, no new deps).
5. Known visible state at end of PR 1: `<FileHeader />` is still rendered alongside `<TabStrip />` — a deliberate transitional state. Close × on each tab is a no-op (US2 will wire it up).

### Incremental Delivery (Recommended — Three PRs)

1. **PR 1 (US1, P1)**: Phase 2 + Phase 3 + relevant Phase 6 steps. Ships multi-tab open / switch / new / save / auto-save / per-tab modified indicators. The standalone FileHeader is still rendered above the toolbar.
2. **PR 2 (US2, P2)**: Phase 4 (T005 + T006) + Phase 6 (T009 type-check; quickstart Scenario B, steps 12–22). Adds the close affordance and the unsaved-changes confirmation. Edge cases 30, 32 should be checked.
3. **PR 3 (US3, P3)**: Phase 5 (T007 + T008) + Phase 6 (full quickstart sweep — Scenarios A + B + C, plus edge cases 30–38). Deletes the standalone FileHeader. The window title remains the only out-of-workspace indicator.

Each PR is independently testable and independently shippable. Reviewer fatigue stays low; the bisect surface for any regression stays small.

### Single PR (Acceptable for Solo Work)

If the feature is shipped as one PR, the total diff is still moderate (~3 edited files, 2 new files, 1 deleted file, no new deps — see [plan.md](plan.md) Scale/Scope). Run Phase 6 end-to-end (T009 type-check + full T010 walkthrough across all 38 quickstart steps + T011 chokepoint grep) before opening the PR.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in the same phase.
- [Story] label maps tasks to user stories for traceability; setup, foundational, and polish tasks have no story label.
- No automated tests are written by this feature — acceptance is the manual quickstart walkthrough plus `npm run build` for type-check. The pre-existing Principle IX gap (no test runner, no ESLint, no Prettier, no CI) is acknowledged and explicitly out of scope.
- Commit cadence: prefer one commit per task. T003 is the largest task by far (a full state reshape across `App.tsx`); it may justify two or three commits internally (types and helpers → state and refs → handlers → effects and render). The other tasks are small enough to be one commit each.
- Do not introduce: a state management library (Zustand, Redux, Context for tabs), a modal library (`react-modal`, Radix Dialog), a UUID dependency, drag-to-reorder, tab persistence to localStorage, keyboard shortcuts for tabs (Ctrl+Tab / Ctrl+W / Ctrl+1..9), a "recently closed tabs" stack, or atomic-write semantics. All are explicitly out of scope ([research.md](research.md) §12).
- The deliberate scope extension: the existing New button creates `Untitled-N` tabs ([research.md](research.md) §11, [plan.md](plan.md) Complexity Tracking row "Untitled tabs"). If the maintainer wants to instead disable or remove the New button, revert via `/speckit-clarify` before T003 is implemented — that decision changes T003's `handleNewFile` rewrite and T002's `untitledLabel` rendering.
- The `src/lib/starterContent.ts` file becomes unused after T003 (the empty state replaces starter content). Deleting it is unrelated cleanup and is NOT part of this feature ([contracts/components.md](contracts/components.md#10-files-touched-at-a-glance)). The file remains in the tree; the import is removed.
