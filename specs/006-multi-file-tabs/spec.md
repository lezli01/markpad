# Feature Specification: Multi-File Editing with Tabs

**Feature Branch**: `006-multi-file-tabs`

**Created**: 2026-05-21

**Status**: Draft

**Input**: User description: "I want to extend the layout to be able to open multiple files at once on separate tabs. Remove the top current file name and modify the editing pane so it can open multiple files on separate tabs, the tab titles are the name of the files."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keep several files open and switch between them (Priority: P1)

A user is working across more than one markdown document at a time — a meeting note, a README, and a journal entry, for example. They open the first file (per Feature 003) and it becomes the active document. They open a second file; instead of replacing the first, the workspace adds a new tab for the second file and makes it the active one. The user can click any tab to instantly switch the editor and preview to that file's content, with each tab independently remembering its own text, modified state, and cursor position. The active tab is visually distinct from the others so the user always knows which file Save, auto-save, and edits will apply to.

**Why this priority**: This is the entire point of the feature. Without it, markpad can still open one file (Feature 003) and save it (Feature 004), but every "Open" wipes the previous document — users have to re-open files repeatedly, and they cannot compare or reference two files inside markpad. Tabs are the upgrade from single-document editor to multi-document editor; everything else in this feature (closing tabs, removing the old header) only makes sense once this story is in place.

**Independent Test**: Open file A, type a small change in it, then use the Open control again to pick file B. Confirm a second tab appears for file B and is active, that the editor and preview now show file B's content, and that clicking the file A tab restores file A's content along with the change typed earlier. Save the active tab and confirm the write goes to the file represented by that tab, not any other.

**Acceptance Scenarios**:

1. **Given** the application is at its starter state, **When** the user opens a markdown file via the Open control (Feature 003), **Then** the workspace shows a single tab whose title is that file's name AND the editor and preview display that file's content.
2. **Given** at least one file is already open in a tab, **When** the user opens a different file via the Open control, **Then** a new tab is added to the tab strip for the newly opened file, the new tab becomes the active tab, and the previously active tab and its content are preserved unchanged behind it.
3. **Given** multiple tabs are open, **When** the user clicks a non-active tab, **Then** the editor and preview switch to that tab's content AND that tab becomes the visually active tab AND the previously active tab keeps its current text, modified state, and (best-effort) cursor/scroll position so returning to it feels like coming back to where the user left off.
4. **Given** multiple tabs are open and the active tab has unsaved edits, **When** the user activates the Save control (Feature 004), **Then** the write goes to the file represented by the active tab only AND the modified indicator clears on that tab only AND no other tab's content or modified state is affected.
5. **Given** multiple tabs are open and auto-save is enabled (Feature 004), **When** the user types in the active tab and pauses, **Then** the auto-save fires for the active tab's file only, regardless of how many other tabs have unsaved edits.
6. **Given** the user opens a file that is already represented by an existing tab, **When** the open completes, **Then** the existing tab becomes active rather than a duplicate tab being created; the editor's content for that tab is NOT replaced from disk (any unsaved edits in that tab are preserved).

---

### User Story 2 - Close a tab when done with that file (Priority: P2)

A user has finished with one of the files they had open and wants to remove it from their workspace without affecting the others. Each tab carries a small close affordance. Clicking it removes that tab. If the tab had unsaved changes, the user is given a clear choice — save, discard, or cancel — so they cannot lose work by reflex. Closing the active tab moves focus to a neighboring tab so the workspace is never left without an active document.

**Why this priority**: Without a way to close tabs, the tab strip grows monotonically and the workspace becomes cluttered. It is P2 (not P1) because the core "open multiple files and switch between them" value (Story 1) is already useful for a session; close-tab is the hygiene layer that makes prolonged multi-file work pleasant. It also depends on Story 1 existing (you can only close tabs that exist).

**Independent Test**: Open three files so three tabs exist. Make an unsaved edit in one. Close a tab without unsaved changes; it disappears and the remaining two tabs stay. Try to close the tab with unsaved changes; confirm the user is prompted (save / discard / cancel) and that choosing "cancel" leaves the tab and its edits intact, "discard" removes the tab and loses the edit, "save" writes the edit to disk and then removes the tab. Close the currently active tab; another tab becomes active automatically.

**Acceptance Scenarios**:

1. **Given** at least one tab is open, **When** the user activates the close affordance on a tab whose content matches what is on disk (no unsaved changes), **Then** the tab is removed from the tab strip immediately with no prompt AND no other tab is affected.
2. **Given** a tab has unsaved changes, **When** the user activates that tab's close affordance, **Then** the application presents a brief confirmation offering at least three choices — Save, Discard, and Cancel — and the tab is NOT removed until the user picks one.
3. **Given** the unsaved-tab confirmation is shown, **When** the user chooses Save, **Then** the application attempts to save the tab's content using the same save path as Feature 004 (manual Save); on success the tab is then removed; on save failure the tab and its edits remain and the standard save-failure error message is shown.
4. **Given** the unsaved-tab confirmation is shown, **When** the user chooses Discard, **Then** the tab is removed and its in-memory edits are lost; the file on disk is not modified.
5. **Given** the unsaved-tab confirmation is shown, **When** the user chooses Cancel, **Then** the tab remains exactly as it was — same active state, same edits, same modified indicator — and no save attempt is made.
6. **Given** the active tab is closed, **When** at least one other tab remains, **Then** focus moves to an adjacent tab (the application picks a sensible neighbor, e.g., the tab to the right, or the tab to the left if no right neighbor exists) AND the editor and preview update to that tab's content.
7. **Given** the user closes the last remaining tab, **When** the close completes, **Then** the workspace returns to a clean empty state — the editor shows an empty placeholder document, the preview is empty, and the Save control is unavailable, consistent with the "no file opened" rules from Features 003 and 004.

---

### User Story 3 - Replace the top file-name header with the tab strip (Priority: P3)

A user opens markpad and looks at the top of the workspace. The standalone "active file" header introduced by Feature 004 — the line that displayed the currently opened file's name with a modified asterisk — is gone. In its place, the tab strip itself tells the user which files are open and which one is active. Each tab's title is the file's name; the active tab is visually distinguished; and a modified indicator appears on any tab whose content differs from disk, exactly the way the old header used to show "filename *". The user never has to look in two places to answer "what am I editing?".

**Why this priority**: This is the cleanup step that makes the layout coherent once Story 1 ships. With multiple tabs, a separate top header showing only the active file's name is redundant — it duplicates information the active tab already conveys — and steals vertical space. It is P3 because Stories 1 and 2 deliver the user-visible value; the header removal is the polish that prevents two parallel "active file" indicators. If scope must be trimmed, this can ship last.

**Independent Test**: Compare the workspace before and after this story: the old top header that read e.g. "notes.md *" is no longer present. Open two files, edit one, and confirm that the only on-screen indicators of (a) which files are open, (b) which file is active, and (c) which files have unsaved changes are now on the tab strip. The window title (Feature 003) may still reflect the active file; that is intentional and out of scope.

**Acceptance Scenarios**:

1. **Given** the workspace is rendered in any view mode, **When** the user looks at the chrome above the editor pane, **Then** the standalone active-file header introduced in Feature 004 is no longer present AND the tab strip takes its place as the in-workspace indicator of the active file.
2. **Given** a tab is active, **When** the user looks at the tab strip, **Then** that tab is visually distinguished from the others (e.g., a different background, an underline, or an equivalent contrast cue) so the active tab is identifiable at a glance.
3. **Given** a tab's content differs from what is on disk (or, for a never-yet-saved buffer, from the file as it was opened), **When** the user looks at that tab, **Then** the tab displays a modified indicator (e.g., an asterisk or equivalent visual marker) next to or near the file name, and that indicator clears when the tab's content is saved or matches disk again.
4. **Given** a file name is too long to fit in the available tab width, **When** the tab is rendered, **Then** the name is truncated in a readable way AND the full path or full file name is reachable via progressive disclosure (e.g., a hover tooltip), consistent with the truncation pattern Feature 004 used for the header.
5. **Given** the user switches view modes (editor only, preview only, split — Feature 003), **When** the layout changes, **Then** the tab strip remains visible and usable in every mode, exactly as the active-file header had to in Feature 004's FR-011.

---

### Edge Cases

- The user opens many files in succession until the tab strip cannot fit them all in the available width. The strip handles the overflow without breaking the layout — for example, by horizontally scrolling, by truncating tab titles further, or by exposing the off-screen tabs through a discoverable affordance. No tab is silently lost.
- The user opens the same file twice in quick succession. Only one tab represents that file (per Story 1 acceptance 6); the second open is a no-op beyond making the existing tab active.
- The user opens a file that is already represented by a tab AND that tab has unsaved edits. The existing tab becomes active and its unsaved edits are preserved — the application MUST NOT silently reload from disk and discard the edits. Reloading from disk is a candidate for a follow-up feature.
- The user closes a tab while auto-save is in flight for that tab. The application MUST NOT leave a half-written file on disk; the in-flight write completes (or fails through the standard error path) before the tab is removed, consistent with Feature 004's no-corruption guarantee.
- The user closes a tab while the save-failure error message for that tab is still on screen. The error is dismissed along with the tab; closing does not leave an orphaned error for a no-longer-visible document.
- The user closes the last tab while auto-save is enabled. Auto-save has nothing to write to (no active file); the auto-save preference remains on for the next time a file is opened.
- The user has many tabs open and the application is closed/relaunched. Restoring the previous tab set across launches is OUT OF SCOPE for this feature (see Assumptions); on relaunch the workspace returns to the documented empty/starter state.
- The user opens a file whose name collides with another open tab's name but the files come from different directories (e.g., two `README.md` files from different folders). The tab titles still display the file name; the full path remains reachable via progressive disclosure (tooltip) so the user can tell them apart.
- The user is in "preview only" mode (Feature 003) and switches the active tab. The preview updates to the new active tab's rendered output; the editor remains hidden by the view mode but its content for the newly active tab is loaded and ready for when the user switches view modes again.
- The user is in "editor only" mode and switches the active tab. The editor updates to the new active tab's text; the preview is not visible but its rendered output is in sync for when the view mode changes.
- The user opens a very large markdown file (per Feature 003 edge case). Other tabs remain responsive; switching away from the large tab does not freeze them. Per-tab performance is bounded by Feature 003's existing tolerance.
- The user is on a narrow window (per Feature 002's responsive rules). The tab strip remains usable; if the strip cannot show all tabs at the narrow width, the same overflow handling applies as on wider windows.
- The user resizes the window between view modes. The tab strip and the active-tab indicator behave consistently with Feature 002's responsive behavior and Feature 003's per-view-mode rules.
- A save failure occurs on a non-active tab because auto-save fired right before the user switched tabs. The error is surfaced (using Feature 004's standard error pattern) and the failing tab's modified indicator remains set; the active tab and its content are unaffected.

## Requirements *(mandatory)*

### Functional Requirements

**Tab model**

- **FR-001**: The application MUST be able to hold more than one opened file simultaneously, each represented as an independent tab with its own document state (text, modified-since-last-save flag, and best-effort cursor and scroll position).
- **FR-002**: At any time, exactly one tab MUST be the active tab; the editor pane and the preview pane MUST always display the active tab's content (when their view mode shows them).
- **FR-003**: When no tabs are open, the workspace MUST present a clean empty state — the editor displays an empty placeholder document, the preview is empty, and the Save control is unavailable — consistent with the "no file opened" behavior established in Features 003 and 004.
- **FR-004**: Switching the active tab MUST NOT modify, clear, or otherwise lose any tab's text content or modified state; only which document is currently displayed changes.

**Tab strip (UI)**

- **FR-005**: The application MUST render a tab strip in the workspace that lists every currently open file, in a deterministic visible order, with the active tab visually distinguished from the others.
- **FR-006**: Each tab MUST display the file's name as its title (basename of the file's path).
- **FR-007**: When a tab's content differs from what is on disk (or, for a never-yet-saved opened buffer, from the file as it was opened), the tab MUST display a visible modified indicator (e.g., an asterisk or equivalent marker) next to the file name; the indicator MUST clear when the tab is saved successfully or its content matches disk again.
- **FR-008**: When a tab's title cannot fit in the available tab width, the title MUST be truncated in a readable way AND the full file name or path MUST be reachable through progressive disclosure (e.g., a hover tooltip), consistent with Feature 004's truncation rule.
- **FR-009**: The tab strip MUST remain visible and usable in every view mode established by Feature 003 (editor only, preview only, split) and across the responsive layouts established in Feature 002.
- **FR-010**: When the tab strip cannot display all open tabs at the current window width, the application MUST handle the overflow without losing any tab (for example, by scrolling the strip horizontally, by exposing off-screen tabs through a menu, or by further truncating titles).

**Opening files into tabs**

- **FR-011**: When the user activates the Open control (Feature 003) and selects a file, the application MUST either (a) add a new tab for that file and make it active, or (b) if a tab already represents that exact file, make the existing tab active without creating a duplicate and without reloading its content from disk.
- **FR-012**: Opening a file MUST NOT close, replace, or otherwise affect any other tab; the previously active tab and all background tabs MUST be preserved exactly.

**Closing tabs**

- **FR-013**: Each tab MUST provide a close affordance reachable from the tab strip.
- **FR-014**: Activating the close affordance on a tab whose modified-since-last-save flag is false MUST remove the tab immediately, with no prompt.
- **FR-015**: Activating the close affordance on a tab whose modified-since-last-save flag is true MUST present a brief confirmation offering at least three choices — Save, Discard, and Cancel — and MUST NOT remove the tab until the user makes a choice.
- **FR-016**: Choosing Save in the close-confirmation MUST attempt to save the tab using the same save path as Feature 004; on success the tab is then removed; on save failure the tab and its edits remain and the standard save-failure error message (Feature 004 FR-004) is surfaced. Choosing Discard MUST remove the tab and lose its in-memory edits without writing to disk. Choosing Cancel MUST leave the tab unchanged and make no save attempt.
- **FR-017**: When the active tab is closed AND at least one other tab remains, the application MUST automatically activate a sensible neighboring tab (such as the tab to the right; or the tab to the left if there is no right neighbor) so the workspace is never left without an active tab while tabs exist.
- **FR-018**: When the last remaining tab is closed, the workspace MUST return to the empty-state behavior defined in FR-003.

**Save and auto-save with tabs**

- **FR-019**: The Save control (Feature 004) MUST act on the active tab only; activating Save MUST write the active tab's content to the active tab's file and clear that tab's modified indicator only, without affecting any other tab.
- **FR-020**: Auto-save (Feature 004), when enabled, MUST act on the active tab only — auto-save fires after the user pauses typing in the active tab and writes that tab's content to its file; background tabs MUST NOT be auto-saved as a side effect of edits made in the active tab.
- **FR-021**: A save or auto-save failure on any tab MUST follow Feature 004's error pattern (editor content preserved, modified indicator retained, brief dismissible error message), and the failure MUST be attributable to the tab it occurred on (so the user can identify which document's save failed).
- **FR-022**: A close-tab Save attempt (FR-016) and a concurrent auto-save on the same tab MUST NOT corrupt the file on disk; at most one effective write per logical save MUST reach disk, consistent with Feature 004 FR-018.

**Removal of the old active-file header**

- **FR-023**: The standalone "active file" header introduced by Feature 004 (Feature 004 FR-007 through FR-011) MUST be removed from the workspace; the tab strip MUST take over the in-workspace role of indicating the active file's name and its modified state.
- **FR-024**: The window-title indication of the currently loaded file established by Feature 003 (Feature 003 FR-007) MAY remain in place and is unaffected by this feature; it is the in-workspace standalone header (Feature 004) that is removed, not the window title.

**Discoverability**

- **FR-025**: The tab strip, each tab's close affordance, and the active-tab indicator MUST all be reachable from the application's primary visible chrome so a first-time user can find them without prior instruction, consistent with Features 002, 003, and 004's discoverability rules.

### Key Entities

- **Tab**: An open document in the workspace. Each tab carries the editor text, a reference to the on-disk file it was opened from (if any), a modified-since-last-save flag, and best-effort UI state such as cursor and scroll position. A tab without a backing file (reserved for follow-up features) is out of scope here; for this feature every tab represents a file that was opened from disk.
- **Tab Set (Workspace State)**: The ordered collection of all currently open tabs plus a single "which tab is active" pointer. The Save control, auto-save, the editor pane, and the preview pane all read from the active tab indicated by this pointer.
- **Active File Reference (extended)**: Feature 004's notion of "the active file" still exists, but it is now derived from the active tab rather than from a single workspace-level variable. Closing the last tab makes this reference absent, returning the workspace to the empty state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can open at least 10 markdown files of up to 100 KB each in separate tabs in a single session without the application becoming unresponsive; the editor remains interactive throughout.
- **SC-002**: Switching the active tab between any two open tabs settles within 200 milliseconds, with no flicker beyond a single layout transition and with the previous tab's text, modified state, and (best-effort) cursor position preserved on return.
- **SC-003**: Across 100 tab-switch operations, the editor content of every tab is preserved unchanged in 100% of switches (no truncation, no reset, no cross-tab content leakage).
- **SC-004**: When a tab is saved (manual Save or auto-save), the write affects only the active tab's file in 100% of cases; no other tab's modified indicator clears as a side effect.
- **SC-005**: A user can close a tab without unsaved changes and see it disappear within 200 milliseconds; closing a tab with unsaved changes always surfaces the Save / Discard / Cancel choice and never silently loses work.
- **SC-006**: After closing the last tab, the workspace reaches a clean empty state (Save unavailable, editor and preview empty) within 200 milliseconds and behaves identically to the "no file opened" state from Features 003 and 004.
- **SC-007**: At least 80% of first-time users can locate the tab strip, identify the active tab, open a second file into a second tab, switch tabs, and close a tab within 60 seconds of opening the application, without consulting external documentation.
- **SC-008**: When the same file is opened twice via the Open control, only one tab represents it in 100% of cases; the second open re-focuses the existing tab rather than creating a duplicate.
- **SC-009**: The standalone Feature 004 active-file header is absent from the workspace in 100% of view-mode and window-size combinations after this feature ships; the tab strip is the sole in-workspace indicator of the active file.

## Assumptions

- "Open" replaces nothing in the existing workspace — it always adds (or re-focuses, per FR-011) a tab. The Feature 003 behavior of "Open replaces the editor content" is superseded for the case where one or more tabs are already open; with zero tabs open, Open creates the first tab and the user-visible effect is equivalent to Feature 003's prior behavior.
- Re-opening a file that already has a tab re-focuses the existing tab and preserves its in-memory edits; it does NOT reload from disk. "Reload from disk" is a candidate for a follow-up feature.
- Closing a tab with unsaved changes prompts the user with Save / Discard / Cancel because Feature 004 introduced a save layer and unsaved edits now represent real work that could be lost. This supersedes Feature 003's "no prompt for unsaved changes" assumption, which was justified only because no save layer existed yet.
- The active-tab indicator and the modified indicator on each tab follow common visual conventions (e.g., distinct background or underline for the active tab; an asterisk or equivalent marker for a modified tab). Exact glyphs and styling are visual-design details and are not constrained further by this spec.
- Tabs do not persist across application launches in this feature; relaunching the application returns the workspace to the documented empty/starter state. "Restore previous session's tabs on launch" is a candidate for a follow-up feature.
- Drag-to-reorder tabs is out of scope. The tab order at any moment is the order in which the files were opened (with any tab that closed simply leaving its slot empty). Reordering is a candidate for a follow-up feature.
- Tabs with no backing file (e.g., a "New" untitled tab created from inside markpad) are out of scope. Every tab in this feature represents a file that was opened from disk via Feature 003's Open control.
- Keyboard shortcuts for tab operations (Ctrl+Tab to cycle tabs, Ctrl+W to close, Ctrl+Shift+T to reopen the last closed tab, etc.) are NOT required by this spec and are candidates for a follow-up feature. The spec only requires that all tab operations be reachable through visible chrome (FR-025).
- "Detaching a tab into a separate window" and "dragging a tab between two markpad windows" are explicitly out of scope.
- The tab strip overflow handling (FR-010) is an implementation choice within the listed acceptable patterns (horizontal scroll, off-screen menu, further truncation, or equivalent). The spec does not prescribe which one to use.
- The view-mode preference (Feature 003) and the auto-save preference (Feature 004) remain workspace-level (one preference shared across all tabs) rather than per-tab. Per-tab view modes are not in this feature.
- The Save control, auto-save toggle, and view-mode control continue to live in the primary chrome as established by Features 003 and 004; this feature does not move them or change their behavior beyond making them operate on the active tab rather than on a single global "opened file".
- The "islands" visual aesthetic established in Feature 002 continues to apply; the tab strip is part of the workspace chrome and should be styled coherently with the rest of the application but the specific visual design is left to the implementation.
- Save concurrency across tabs (e.g., the user activating Save while an auto-save is in flight on a different tab) is resolved internally so neither file is partially written; the exact synchronization mechanism is an implementation detail.
- The window title (Feature 003 FR-007) MAY continue to reflect the active tab's file name; this feature does not change the window-title behavior. Only the in-workspace standalone header from Feature 004 is removed.
