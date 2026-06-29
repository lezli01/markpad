# Quickstart — Save Controls and Active File Header

Use this guide to verify Feature 004 locally during implementation and at review time. It assumes Features 002 and 003 are already in place and the implementation of 004 has been completed per `plan.md`, `data-model.md`, and `contracts/components.md`.

## Prerequisites

- Node.js (the version matching the repo's `.nvmrc` or otherwise the latest LTS) and npm.
- Rust toolchain (`rustup`) — required by Tauri's dev/build commands.
- Platform-specific Tauri prerequisites: see https://tauri.app/start/prerequisites/ if first-time setup.

## Install

```bash
npm install
```

This feature introduces **no new npm or cargo dependencies**. If `npm install` runs faster than after Feature 003, that is expected — there is nothing new to fetch.

## Run in dev mode

Web-only (faster iteration on UI; note: actual save behaviour requires Tauri to run, so verify save and auto-save in the Tauri window):

```bash
npm run dev
```

Full Tauri dev (runs the actual desktop window — **required for save and auto-save testing**):

```bash
npm run tauri dev
```

The first Rust compile after capability changes may be slightly slower than usual because Tauri re-validates `capabilities/default.json`.

## Production build (smoke check)

```bash
npm run build           # type-checks via tsc, then builds the web bundle
npm run tauri build     # produces a platform-native bundle
```

`npm run build` must succeed with zero TypeScript errors before opening the PR (Constitution Principle IX).

## Pre-flight: prepare fixtures

Save a small file to your Desktop named `save-test.md` with this content:

```markdown
# Save round-trip

Initial line that we will leave alone.

This is the line that will be edited during testing.
```

Save a second file to your Desktop named `auto-save-test.md`:

```markdown
# Auto-save round-trip

This file is for the auto-save story. The body will be appended to during the test.
```

You'll also want:
- An external file manager / terminal to verify on-disk contents (e.g., a separate `cat save-test.md` terminal).
- For the read-only test (US1 #6): a way to mark a file read-only on your platform (`chmod -w` on Unix; the Properties dialog on Windows).

## Manual acceptance walkthrough

Steps map directly to the "UI acceptance contract" in `contracts/components.md` and the FR / SC IDs in `spec.md`. Run them in the Tauri window (`npm run tauri dev`) so file I/O and the OS dialog behave natively.

### User Story 1 — Save edits back to the opened file (P1)

1. **Launch state (FR-005, FR-006, FR-008)** — Open the app fresh. Confirm:
   - The very top row is an "islands"-styled header that reads `Untitled`. No asterisk.
   - Hovering the `Untitled` text shows a native tooltip such as "No file open".
   - The toolbar's **Save** button is visibly disabled (greyed / reduced opacity, cursor changes to not-allowed) and clicking it does nothing.
   - The **Auto-save** checkbox is visible, unchecked.

2. **Open a file (sanity carryover from Feature 003 + FR-007 + new save-enable rule)** — Click **Open**, pick `save-test.md` from your Desktop. Confirm:
   - The editor's content is replaced by the file's text.
   - The header now reads `save-test.md`. No asterisk.
   - Hovering the file name shows the full absolute path as a tooltip.
   - The Save button is now enabled.

3. **Modified indicator appears on edit (FR-006, FR-009, US1 AS1 first half, US2 AS3)** — Type a small change into the editor (e.g., append "EDIT 1" to a line). Confirm:
   - The header now reads `* save-test.md` (asterisk prefix; the asterisk is announced to screen readers as "modified").
   - The Save button remains enabled.
   - Nothing has been written to disk yet — verify in your external terminal: `cat save-test.md` shows the original content.

4. **Manual Save success (FR-002, FR-003, FR-006, US1 AS1 full, SC-001)** — Click the Save button. Confirm:
   - Within well under 1 second, the asterisk disappears from the header (now reads `save-test.md`).
   - The Save button stays enabled (you can save again).
   - In your external terminal, `cat save-test.md` now shows the edited content.

5. **Round-trip persistence (US1 Independent Test)** — Quit the application entirely. Reopen `save-test.md` in any text editor (or `cat` it). Confirm the edit from step 4 is on disk. (Optional: reopen markpad, click Open, pick `save-test.md`, confirm the editor shows the edit.)

6. **Save error path (FR-004, US1 AS3, SC-002)** — Make `save-test.md` read-only outside markpad (e.g., `chmod -w save-test.md` on Unix, or Properties → Read-only on Windows). In markpad, type another change (header gets the asterisk again). Click Save. Confirm:
   - The editor's content is unchanged (your typed change is still visible).
   - A dismissible error banner appears explaining the failure in plain language (something like "Could not save this file. The location may be read-only or out of space.").
   - The asterisk remains in the header (the change is still only in memory — FR-004).
   - Clicking the banner's ✕ dismisses it.
   - Restore write permission (`chmod +w save-test.md`) and click Save again — the asterisk clears, the file updates.

7. **Save with no changes (FR-003 AS2)** — With `save-test.md` open and no unsaved changes (header has no asterisk), click Save. Confirm:
   - Either the operation silently succeeds OR the button visibly indicates "nothing to save" (per spec, both are acceptable).
   - The on-disk file is unchanged in either case (verify with `cat`).
   - No error banner appears.

8. **Modified comes back after a fresh edit (US1 AS5)** — Type one more character. Confirm the asterisk reappears in the header. Click Save. Confirm the asterisk clears and the new content is on disk.

### User Story 2 — Always see which file you are editing at the top (P2)

9. **Header visible in every view mode (FR-011, US2 AS5, SC-003)** — With `save-test.md` open, switch through Editor / Preview / Split using the view-mode segmented control. Confirm:
   - The FileHeader row stays at the very top of the workspace in all three modes.
   - The header continues to show the current file name (and asterisk if applicable).
   - Toggling the theme between light and dark re-skins the header along with the rest of the chrome (no element stuck in the previous theme).

10. **Long-name truncation + tooltip (FR-010, US2 AS4)** — Make a copy of `save-test.md` with a long name (e.g., `this-is-a-very-long-markdown-filename-used-to-test-the-truncation-and-tooltip-affordance-in-the-header.md`). Open it in markpad. Resize the window narrower until the name no longer fits in the header bar. Confirm:
    - The displayed name truncates with an ellipsis (`…`).
    - Hovering the truncated name reveals the full absolute path via the native tooltip.

11. **Untitled placeholder (FR-008, US2 AS1)** — Quit and relaunch the app. With no file opened, confirm the header reads `Untitled` (no asterisk). This is the same state as step 1, but it's worth re-confirming after several restarts.

12. **Modified indicator on the header (FR-009, US2 AS3)** — Re-open `save-test.md`. Type any change. Confirm the asterisk appears in the header (this duplicates step 3 but exercises the header path specifically — the asterisk MUST be visible regardless of view mode).

### User Story 3 — Turn on auto-save and have that choice remembered (P3)

13. **Auto-save OFF baseline (FR-013, US3 AS1)** — Make sure the Auto-save checkbox is unchecked. Open `auto-save-test.md`. Type a change. Wait 10 seconds without typing. Confirm:
    - The header still shows the asterisk.
    - `cat auto-save-test.md` (external) still shows the original content. Nothing has been written.
    - Click Save manually to clear the asterisk before the next step.

14. **Auto-save ON happy path (FR-013, FR-016, US3 AS2, SC-004)** — Tick the Auto-save checkbox. Confirm it stays ticked. Type a change (e.g., append "auto-saved line 1"). Stop typing. Confirm:
    - Within ~1.5 seconds of stopping, the header's asterisk clears.
    - In your external terminal, `cat auto-save-test.md` now shows the edited content. The write happened without you clicking Save.
    - Repeat: type more characters, pause, watch the asterisk clear within ~1.5 s. SC-004's 5 s budget is comfortably satisfied.

15. **No churn on bursty typing (FR-013 second clause)** — With Auto-save still on, type a longer burst (e.g., several full sentences) without pausing. Confirm:
    - The header asterisk stays visible during the typing burst.
    - The asterisk only clears once you stop typing for ~1.5 s.
    - In your terminal, `cat auto-save-test.md` updates once (not per keystroke). This is critical for SC-005: 100 consecutive auto-save cycles should not churn out multiple writes per keystroke.

16. **Auto-save error path (FR-015, US3 AS5)** — Make `auto-save-test.md` read-only externally. In markpad, type a change. Wait. Confirm:
    - An error banner appears explaining the save failed.
    - The asterisk remains in the header.
    - Your typed text is still in the editor (not lost).
    - Restore write permission and type one more character; the next auto-save succeeds and the asterisk clears.

17. **Auto-save preference persists across launches (FR-019, US3 AS3, SC-006)** — With Auto-save still ON, quit the application entirely. Relaunch it. Confirm:
    - The Auto-save checkbox is still ticked.
    - Open `auto-save-test.md`. Type. After ~1.5 s, the file updates on disk — auto-save resumed automatically.

18. **Auto-save with no file open (FR-014, US3 AS4)** — Quit and relaunch (Auto-save still on from step 17). Without opening a file, type into the starter content. Wait. Confirm:
    - The starter content edits are NOT written anywhere (there is no backing file).
    - No "saved" state is shown for the starter content.
    - The Auto-save checkbox remains visible and ticked.

19. **Toggle Auto-save OFF mid-session (FR-017, US3 AS6)** — With Auto-save ON and a file open, type a change but **before** the ~1.5 s debounce fires, untick the Auto-save checkbox. Confirm:
    - The asterisk stays in the header (the debounced save was cancelled).
    - In your external terminal, the on-disk file is unchanged.
    - Type more characters; no further auto-saves occur.
    - Click Save manually — the asterisk clears and the file updates.

20. **Re-tick Auto-save without typing (Edge Case from spec)** — With unsaved changes still in the buffer (asterisk visible), tick Auto-save back on without typing. Per spec, the implementation MAY either immediately save the pending changes or wait for the next idle period; either is acceptable. Confirm whichever behaviour the implementation chose results in **no lost edits** — the file ends up containing the buffer's content, sooner or later.

### Cross-cutting

21. **Concurrent Save during in-flight auto-save (FR-018, US3 AS6 supporting, SC-005)** — This one is best done with a large file and / or a deliberately throttled disk to make the in-flight window observable. Open the largest markdown file you have to hand (or `auto-save-test.md` if your disk is too fast to catch this). With Auto-save ON, type a change so the debounce fires. While the asterisk is in the brief "saving" window (Save button momentarily disabled), click Save manually. Confirm:
    - The file ends up correctly saved with the latest text.
    - `cat <file>` shows no truncation, no partial write, no garbled content.
    - The Save button re-enables once both saves resolve.
    - No error banner appears (assuming the location is writable).
    - If you can repeat this 10 times in a row, you have effectively tested SC-005 (100-cycle smoke check — the spec says 100, but 10 is usually enough to flush out a corruption bug if one exists).

22. **First-time discoverability (FR-021, SC-007)** — Quit. Imagine you are seeing markpad for the first time. Without using the keyboard, locate within 30 seconds: (a) where the current file name is shown, (b) the Save button, (c) the Auto-save toggle. All three should be visible in the chrome the moment the app launches.

23. **Preference fallback when storage is corrupted (FR-020, SC-006 fallback half)** — Quit the app. In Tauri devtools (right-click → Inspect Element → Application → Local Storage), find the `markpad.autoSave` entry and set it to an obviously invalid value like `"banana"`. Save. Relaunch the app. Confirm:
    - The app launches normally.
    - The Auto-save checkbox is unticked (default fallback per FR-020).
    - You can re-tick it; the next launch reads `"on"` correctly.

24. **Sanitizer regression after a save round-trip (Constitution VII)** — Open a markdown file containing:
    ```markdown
    <script>alert('xss')</script>

    <img src="x" onerror="alert('xss')" />

    [click](javascript:alert('xss'))
    ```
    Save it (round-trip through `writeTextFile`). Open it again. Confirm no alert appears and the preview strips the payload exactly as in Feature 003 step 14. Saving raw text does NOT bypass DOMPurify because DOMPurify operates on the *rendered HTML*, not the stored Markdown source.

25. **Sanity: existing 002 / 003 behaviour intact** — Run a subset of the Feature 003 quickstart that covers the open path, view-mode switching, and theme toggle (steps 2–5, 7–10 of `specs/003-core-ui-controls/quickstart.md`). All should still pass.

If all 25 steps pass, Feature 004 matches `spec.md` and is ready for review.

## What this feature deliberately does NOT include

(Per `spec.md` Assumptions and `research.md` §10 — do not be alarmed if the following are missing.)

- **Save As / Save a Copy / "save to a different path"**: out of scope.
- **"New file from inside markpad"**: out of scope. Save is unavailable until a file is opened.
- **Prompt-on-quit when there are unsaved edits / save-on-blur / save-on-view-mode-switch**: out of scope. Auto-save fires only on idle.
- **Crash recovery / automatic backups / atomic write via temp file**: out of scope.
- **Detecting external file changes / "reload from disk" / file watch**: out of scope.
- **Restoring the last opened file at launch / persisting the open-file path**: still out of scope.
- **Keyboard shortcut for Save (Ctrl/Cmd+S)**: not required, not prohibited.
- **Multiple documents / tabs / multiple windows editing different files**: out of scope.
- **Recent files list**: out of scope.
- **Wiring up ESLint / Prettier / test runner / CI**: still a pre-existing gap from 002 and 003; this feature does not regress it and does not address it.
