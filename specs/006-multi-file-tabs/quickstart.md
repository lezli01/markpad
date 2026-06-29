# Quickstart — Manual Acceptance for Multi-File Editing with Tabs

This document is the manual test plan for Feature 006. Each step is a small, observable check; each check is mapped to the spec's Functional Requirements (FR-NNN) and Success Criteria (SC-NNN). Run the dev build (`npm run tauri dev`) on the platform you are about to release and walk down the list.

The test files referenced below — `notes.md`, `readme.md`, `meeting.md` — are any small markdown files you have on hand. The same `notes.md` file path is reused intentionally for the dedup scenario.

---

## Setup

1. Pull the branch and install: `npm install && npm run tauri dev`.
2. Start with no markpad state: open the platform's app-data folder for markpad if you want to inspect `localStorage`, but no cleanup is required — this feature does not persist tabs.
3. Have three small markdown files ready on disk: `notes.md`, `readme.md`, `meeting.md`. Each ≤ 100 KB.

---

## Scenario A — User Story 1 (P1): open multiple files, switch between them

Covers **FR-001 to FR-012**, **FR-019**, **FR-020**, **FR-025**, **SC-001 to SC-004**, **SC-008**.

1. Launch markpad. **Expect**: workspace shows an empty TabStrip band (faded "No files open" or equivalent), empty editor, empty preview, Save button disabled, auto-save checkbox visible.  
   → FR-003.
2. Click **Open**, select `notes.md`. **Expect**: a tab appears with the title `notes.md`, the editor shows the file's text, the preview renders it, the tab is visually highlighted as active.  
   → FR-005, FR-006, FR-011 (insertion), Story 1 AS-1.
3. Type a small change (e.g. add a line "hello tabs") into the editor. **Expect**: an asterisk (`*`) appears on the `notes.md` tab title.  
   → FR-007, Story 1 AS-3 (modified state preserved across switch — but check that on step 5).
4. Click **Open**, select `readme.md`. **Expect**: a second tab appears with the title `readme.md` to the right of `notes.md`, the new tab becomes active, the editor and preview switch to `readme.md`'s content. The `notes.md` tab still shows its asterisk in the strip.  
   → FR-011 (insertion + activation), FR-012 (previous tab preserved), Story 1 AS-2.
5. Click the **notes.md** tab. **Expect**: the editor's content swaps back to `notes.md` *including* the "hello tabs" change. The cursor lands at roughly where you left it (best-effort). The asterisk remains.  
   → FR-002, FR-004, Story 1 AS-3, SC-002, SC-003.
6. Click **Save** (or press Ctrl/Cmd+S). **Expect**: the asterisk on `notes.md` clears. The `readme.md` tab is unaffected (no change to its title, no asterisk addition).  
   → FR-019, Story 1 AS-4, SC-004.
7. Click the **readme.md** tab, type a change. **Expect**: asterisk appears on `readme.md` only. The `notes.md` tab in the background remains without an asterisk (since you saved it in step 6).  
   → FR-019 (no cross-tab leakage), SC-004.
8. Tick the **Auto-save** checkbox if it is not already. Pause for ~2 seconds. **Expect**: the asterisk on `readme.md` clears (auto-save fired for the active tab). The `notes.md` tab is unchanged.  
   → FR-020, Story 1 AS-5.
9. Click **Open** again and select `notes.md` (the same path as step 2). **Expect**: NO third tab is created. The existing `notes.md` tab becomes active. Its content is unchanged from step 6 (NOT reloaded from disk).  
   → FR-011 (dedup), Story 1 AS-6, SC-008.
10. Repeat the open with `meeting.md` so a third tab appears. Now switch among the three tabs rapidly (click each in sequence). **Expect**: every switch settles within roughly 200 ms; the editor's content matches the clicked tab in every case; no content leakage between tabs.  
    → SC-002, SC-003.
11. With all three tabs open and at least one of them >100 KB if you have one handy, repeat scenario A from step 1 mentally: the editor stays interactive throughout.  
    → SC-001, SC-008.

---

## Scenario B — User Story 2 (P2): close tabs, with the unsaved-changes prompt

Covers **FR-013 to FR-018**, **SC-005**, **SC-006**.

12. Starting from Scenario A's final state (three tabs, all saved). Hover or focus the `meeting.md` tab. **Expect**: a × close button is visible on the pill.  
    → FR-013.
13. Click the × on `meeting.md`. **Expect**: the tab disappears immediately with no prompt. Two tabs remain (`notes.md`, `readme.md`).  
    → FR-014.
14. Click the `readme.md` tab to make it active. Type a small change so its title gets an asterisk.  
    → (Setup for the modified-close path.)
15. Click the × on `readme.md`. **Expect**: a small modal dialog opens with three buttons in order: **Save**, **Discard**, **Cancel**. The dialog mentions `readme.md` so you know which tab it is asking about.  
    → FR-015, Story 2 AS-2.
16. Press **Cancel** (or press ESC). **Expect**: the dialog closes; `readme.md` tab and its asterisk remain exactly as they were. No save happened.  
    → FR-016 (cancel branch), Story 2 AS-5.
17. Repeat: click × on `readme.md`, this time press **Discard**. **Expect**: the dialog closes; the `readme.md` tab is gone; the file on disk is NOT modified (`readme.md`'s on-disk content is whatever you last saved). Active tab moves to `notes.md` (the remaining left neighbor).  
    → FR-016 (discard branch), FR-017 (neighbor activation), Story 2 AS-4 / AS-6.
18. Reopen `readme.md` (Open → readme.md). Type a change. Click × → **Save**. **Expect**: the change is written to disk; the dialog closes; the tab is removed; active tab moves to the remaining neighbor.  
    → FR-016 (save branch), Story 2 AS-3, FR-017.
19. **Save-failure case**: make `notes.md` read-only externally (chmod / Properties → Read-only / move it to a write-protected volume), then reopen it in markpad, type a change, click × → Save. **Expect**: the dialog closes briefly OR stays open while the save attempts; the save fails; an error banner appears naming `notes.md`; the tab and its asterisk remain (NOT removed).  
    → FR-016 (save-failure leaves the tab), FR-021 (error attributed to the tab).  
    Then restore write permission and Save manually to clean up before continuing.
20. Now close the last remaining tab via ×. **Expect**: the workspace returns to the empty state (empty TabStrip band, empty editor, empty preview, Save disabled). The auto-save checkbox remains visible and its setting remains intact.  
    → FR-018, FR-003, SC-006.
21. Time the no-unsaved-changes close from step 13 mentally: well under 200 ms.  
    → SC-005.
22. Time the empty-state transition from step 20 mentally: well under 200 ms.  
    → SC-006.

---

## Scenario C — User Story 3 (P3): remove the old FileHeader; the tab strip is the indicator

Covers **FR-007**, **FR-008**, **FR-009**, **FR-010**, **FR-023**, **FR-024**, **SC-009**.

23. From any state, look at the workspace chrome. **Expect**: there is NO standalone "file name with asterisk" header above the Toolbar. The TabStrip is the only in-workspace surface that shows the active file's name.  
    → FR-023, Story 3 AS-1, SC-009.
24. Look at the OS window title (the title bar of the OS window itself). **Expect**: it shows `<active-tab-name> — markpad` when a tab is active, and `markpad` when no tabs are open. (This is Feature 003's window-title behaviour and should still work.)  
    → FR-024.
25. With multiple tabs, identify the active tab visually. **Expect**: the active pill has a different background or accent than the others; you can tell at a glance which tab the editor is showing.  
    → FR-005, Story 3 AS-2.
26. Pick a markdown file with a *very long* filename (rename one if needed to e.g. `extremely-long-filename-that-should-truncate-in-a-pill.md`). Open it. **Expect**: the tab title is truncated with ellipsis inside the pill. Hover the pill → a tooltip shows the full file name or path.  
    → FR-008, Story 3 AS-4.
27. Open enough tabs to exceed the workspace width (≥ 8 tabs on a narrow window — resize the markpad window narrower if needed). **Expect**: the TabStrip becomes horizontally scrollable. No tab disappears silently; you can scroll to reach any tab.  
    → FR-010.
28. Switch view modes (editor only, preview only, split — Toolbar). **Expect**: the TabStrip remains visible and the active pill stays highlighted in every mode.  
    → FR-009, Story 3 AS-5.
29. Resize the markpad window from wide to narrow and back. **Expect**: at all sizes the TabStrip is usable; horizontal scroll appears as needed; the active pill auto-scrolls into view if its position requires it.  
    → FR-010, plus Feature 002 responsive carry-over.

---

## Scenario D — Edge cases (concentrated)

Covers **Edge Cases** in the spec, plus carry-over checks.

30. **Re-open with unsaved edits**: Open `notes.md`, type a change (asterisk appears). Open `notes.md` again. **Expect**: the existing tab is reactivated; the change is preserved; NO reload from disk.  
    → FR-011 (preserve in-memory edits on re-open), spec Edge Cases.
31. **Same-basename different paths**: Open two `README.md` files from different folders. **Expect**: two tabs both labelled `README.md`. Hover each → tooltip shows the full distinct paths.  
    → spec Edge Cases (collision); FR-008.
32. **Auto-save in flight + tab close**: With auto-save on, type into the active tab, then immediately click × on it. **Expect**: the close-confirm dialog asks Save / Discard / Cancel (because there are unsaved edits — the auto-save debounce hasn't completed). Choose Save; the save runs and the tab closes. The file on disk is intact (not half-written).  
    → spec Edge Cases (auto-save in flight + close); FR-022.
33. **XSS regression** (Constitution Principle VII): create a markdown file containing `<script>alert('xss')</script>` and `<img src=x onerror=alert(1)>`. Open it in one tab. Switch to another tab and back. **Expect**: no alert ever fires; the script and onerror are stripped from the preview by DOMPurify.  
    → Feature 002 / 003 carry-over; tab switching does not regress sanitisation.
34. **Auto-save preference persists across launches**: tick auto-save in one session, quit markpad (`Cmd/Ctrl+Q` or close window), relaunch. **Expect**: the auto-save checkbox is still ticked. (Carry-over check from Feature 004.)
35. **Theme + view mode preferences persist across launches**: same as 34 for theme and view mode.
36. **Editor stays mounted across view-mode switches** (Feature 003 §3 carry-over): type half a word in the editor (don't pause), click the view-mode segmented control to switch modes once, return to a mode that includes the editor. **Expect**: no keystroke was lost; the cursor is still in place.
37. **Untitled tab via New button** (the deliberate scope extension; see plan.md Complexity Tracking row): click New. **Expect**: a new tab appears with the title `Untitled-1` (or `Untitled-N` if other untitled tabs already exist), active, with empty editor. Type a character → asterisk appears. Click Save → a Save-As dialog appears. Pick a path. **Expect**: after saving, the tab's title changes to the basename of the saved path; the asterisk clears. Subsequent Save uses the new path without prompting.  
    → Out-of-spec by the strict reading of spec Assumptions but documented in plan.md Complexity Tracking as a minimal extension to preserve existing UX.
38. **Closing the only Untitled tab with unsaved changes**: New → type → click ×. **Expect**: the close-confirm dialog appears. Choosing Save invokes Save-As; Cancel leaves the tab; Discard removes it.  
    → FR-015 / FR-016 generalised to Untitled tabs.

---

## Quick coverage matrix

| Spec ID    | Step(s)                  |
|------------|--------------------------|
| FR-001     | 5, 7, 10 (per-tab state) |
| FR-002     | 5, 6, 7 (active tab governs)  |
| FR-003     | 1, 20 (empty state)      |
| FR-004     | 5, 6, 7, 10 (no content loss across switches) |
| FR-005     | 2, 4, 25                 |
| FR-006     | 2, 4, 31                 |
| FR-007     | 3, 7, 14, 30             |
| FR-008     | 26, 31                   |
| FR-009     | 28                       |
| FR-010     | 27, 29                   |
| FR-011     | 4, 9, 30                 |
| FR-012     | 4, 7                     |
| FR-013     | 12, 15, 17, 18, 19       |
| FR-014     | 13                       |
| FR-015     | 15, 16, 17, 18, 38       |
| FR-016     | 17, 18, 19, 38           |
| FR-017     | 17, 18                   |
| FR-018     | 20                       |
| FR-019     | 6, 7                     |
| FR-020     | 8                        |
| FR-021     | 19                       |
| FR-022     | 32                       |
| FR-023     | 23                       |
| FR-024     | 24                       |
| FR-025     | 1, 12, 23                |
| SC-001     | 11                       |
| SC-002     | 5, 10                    |
| SC-003     | 5, 10                    |
| SC-004     | 6, 7                     |
| SC-005     | 13, 21                   |
| SC-006     | 20, 22                   |
| SC-007     | Walk through Scenarios A–C cold with a friend and time them. |
| SC-008     | 9                        |
| SC-009     | 23                       |

If every step above is green, the feature meets its spec. File any step that fails as a bug against this branch before opening the PR.
