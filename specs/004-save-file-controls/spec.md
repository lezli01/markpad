# Feature Specification: Save Controls and Active File Header

**Feature Branch**: `004-save-file-controls`

**Created**: 2026-05-21

**Status**: Draft

**Input**: User description: "Add a save button so modifications can be saved, make sure the currently opened file is stated at the top. The save button should have an auto-save checkbox so modifications are auto-saved if it is checked, remember that option."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Save edits back to the opened file (Priority: P1)

A user opens an existing markdown file (per Feature 003), edits its contents in MILF, and wants those changes to live on disk — not just in memory. They click a clearly visible Save control in the application chrome. The application writes the editor's current contents back to the same file the document was loaded from. A visible modified indicator clears the moment the save succeeds, so the user knows their work is safe.

**Why this priority**: Without a save path, MILF is read-only for any existing file the user opens. Feature 003 made "open" possible; this story is what turns MILF from "viewer with scratch edits" into "editor you can actually trust with your notes". Every later persistence feature (auto-save, save-as, recent files, restore session) builds on a working manual save.

**Independent Test**: Open an existing markdown file from disk, type a small change into the editor, click the Save control, close the application, reopen the file in MILF or any other text editor, and confirm the change is on disk.

**Acceptance Scenarios**:

1. **Given** the user opened a markdown file and has typed unsaved edits into the editor, **When** they activate the Save control, **Then** the file on disk now contains the editor's current text and the in-app modified indicator clears.
2. **Given** the editor's content already matches what is on disk (no unsaved changes), **When** the user activates the Save control, **Then** the save either silently succeeds with no error or the control is in a state that communicates "nothing to save"; the file on disk is not corrupted and the editor's content is unchanged.
3. **Given** the user is editing an opened file, **When** a save attempt fails (permission denied, file removed externally, disk full, read-only volume, etc.), **Then** the editor's content is preserved unchanged AND a brief, dismissible error message explains in plain language why the save did not succeed AND the modified indicator remains so the user knows the change still only exists in memory.
4. **Given** the user has not opened any file (the editor still shows starter content or an empty document), **When** they look at the Save control, **Then** the control is clearly unavailable for use (visibly disabled or otherwise prevented from triggering a save) because there is no backing file to write to.
5. **Given** the user has just successfully saved, **When** they make a new edit, **Then** the modified indicator returns; **When** they save again, **Then** the indicator clears again.

---

### User Story 2 - Always see which file you are editing at the top (Priority: P2)

A user often has several MILF windows or returns to MILF after a context switch. They glance at the top of the application and immediately see the name of the file they are currently editing, with a clear visual cue when there are unsaved changes. When no file is open, the header tells them so (e.g., "Untitled") rather than leaving them guessing.

**Why this priority**: Knowing what you are editing is a baseline expectation of every text editor. It also makes the save path trustworthy — users will only press Save with confidence if they can see which file the edit will land in. It is P2 (not P1) because Feature 003 already provides a minimum indication via the window title; this story upgrades that indication to a more prominent in-workspace header and adds the modified marker.

**Independent Test**: Launch MILF (header reads "Untitled"), open a markdown file (header now reads the file's name), type a change (modified indicator appears in the header), save (indicator clears), and confirm the header is visible in every supported view mode (editor only, preview only, split).

**Acceptance Scenarios**:

1. **Given** the application has just launched and no file has been opened, **When** the user looks at the top of the workspace, **Then** the header clearly indicates that no file is loaded (e.g., displays "Untitled" or an equivalent placeholder).
2. **Given** the user opens a file via the Open control from Feature 003, **When** the open completes, **Then** the header at the top of the workspace displays the opened file's name.
3. **Given** the editor's content differs from what was last saved (or from the file as opened, for a never-yet-saved session), **When** the user looks at the header, **Then** a visible modified indicator (e.g., an asterisk or equivalent marker) is shown next to the file name.
4. **Given** the file name is too long to fit in the available header space, **When** the header is rendered, **Then** the name is truncated in a readable way AND the user can see the full path through progressive disclosure (e.g., a hover tooltip).
5. **Given** the user switches view modes (editor only, preview only, split — Feature 003), **When** the layout changes, **Then** the active-file header remains visible at the top of the workspace in every mode.

---

### User Story 3 - Turn on auto-save and have that choice remembered (Priority: P3)

A user prefers not to think about saving. They tick an "Auto-save" checkbox alongside the Save control. From that point on, while a file is opened, the application quietly writes the editor's contents back to disk shortly after the user stops typing. The next time the user launches MILF, the checkbox is still ticked.

**Why this priority**: This is a comfort feature layered on top of stories P1 and P2. It is genuinely useful (many users will keep it on), but the application is fully usable without it: a deliberate Save click is always available. Implementing it later does not require redoing P1 or P2. Listing it third keeps it out of the critical path if scope must be trimmed.

**Independent Test**: Open a markdown file, tick the auto-save checkbox, type a change, wait a few seconds, then verify the change is on disk without having clicked Save. Close and relaunch the application; confirm the checkbox is still ticked.

**Acceptance Scenarios**:

1. **Given** the auto-save checkbox is OFF and a file is opened, **When** the user types into the editor, **Then** the file on disk is NOT modified until the user explicitly activates the Save control.
2. **Given** the auto-save checkbox is ON and a file is opened, **When** the user types and then pauses for a short idle period, **Then** the file on disk is automatically updated with the editor's current text AND the modified indicator clears once the auto-save succeeds.
3. **Given** the user has ticked the auto-save checkbox, **When** they close and relaunch the application, **Then** the checkbox is still ticked and auto-save behavior resumes automatically as soon as a file is opened.
4. **Given** the auto-save checkbox is ON and no file is currently opened, **When** the user types into the editor (e.g., starter content), **Then** no auto-save occurs (there is no backing file) AND the application does not show a misleading "saved" state.
5. **Given** the auto-save checkbox is ON, **When** an auto-save attempt fails (permission denied, file removed externally, disk full, etc.), **Then** the editor's content is preserved, the modified indicator remains, AND a brief, dismissible error message explains the failure using the same error pattern as a manual save failure.
6. **Given** the auto-save checkbox is ON and the user toggles it OFF mid-session, **When** they continue editing, **Then** no further automatic saves occur until they tick the box again; any unsaved changes remain unsaved until the user activates Save manually.

---

### Edge Cases

- The user has unsaved changes in an opened file, then opens a *different* file via the Open control (Feature 003). Behavior of the in-memory content during open is governed by Feature 003 (which states open replaces the current content); this feature MUST NOT silently auto-save just because auto-save is on — auto-save fires on idle, not on "I am about to discard this buffer".
- The user activates Save while an auto-save is already in flight. The application MUST NOT corrupt the file by writing twice concurrently; one effective write is enough.
- The user activates Save with the editor fully empty (opened file then deleted all text). The file on disk becomes empty. This is the user's intent — empty is a valid file state.
- The user's opened file is moved, renamed, or deleted by another program after it was opened in MILF. The next save fails through the standard error path with a clear message; the editor content stays in memory.
- The volume hosting the opened file becomes read-only between open and save (e.g., USB drive removed). The save fails through the standard error path.
- The application crashes or the user force-quits while auto-save is enabled but before the next idle save fires. Recovery of in-memory unsaved edits is NOT promised by this spec — the user is expected to save manually before quitting if they want a guarantee. Crash-recovery is a candidate for a follow-up feature.
- The auto-save preference is stored but unreadable on launch (corrupted preference store). The application falls back to auto-save OFF and continues to launch normally, consistent with Feature 003's preference fallback rules.
- The opened file's path contains characters the underlying filesystem can write but the on-screen header struggles to render (very long, unusual whitespace, RTL text, etc.). The header still displays a readable representation; the full path is reachable via progressive disclosure.
- The user is on a narrow window (per Feature 002's responsive rules). The active-file header and the Save / auto-save controls remain visible and usable.
- The user types a single keystroke while auto-save is ON, then stops; the idle timer elapses; one auto-save is written. The application MUST NOT churn out multiple writes per keystroke.
- The user makes edits with auto-save OFF, then ticks auto-save ON without typing further. The application MAY immediately write the pending edits or wait for the next idle period; either is acceptable as long as no edits are lost and the modified indicator behaves correctly.

## Requirements *(mandatory)*

### Functional Requirements

**Save**

- **FR-001**: The application MUST provide a clearly discoverable Save control in the primary chrome, reachable in every view mode (editor only, preview only, split).
- **FR-002**: When the user activates the Save control and a file is currently opened (per Feature 003), the application MUST write the editor's current text back to that same file using the same text encoding the file was opened with.
- **FR-003**: When a save attempt succeeds, the application MUST clear the modified indicator and MAY surface an unobtrusive confirmation; it MUST NOT block, modal-prompt, or otherwise interrupt the user's editing flow on success.
- **FR-004**: When a save attempt fails for any reason (permission denied, file removed, disk full, read-only volume, encoding error, etc.), the application MUST preserve the editor's current content exactly AND surface a brief, dismissible error message that names the failure in plain language AND leave the modified indicator set so the user knows the change is still only in memory.
- **FR-005**: When no file is currently opened (the editor holds starter content, an empty buffer, or content never associated with a file), the Save control MUST be visibly unavailable (e.g., disabled) and activating it MUST NOT cause a save attempt or a save-as flow; save-as is explicitly out of scope (see Assumptions).
- **FR-006**: The application MUST track a "modified since last successful save" state for the current document and reflect that state visually somewhere in the chrome so the user can tell at a glance whether the file on disk is in sync with the editor.

**Active file header (top of workspace)**

- **FR-007**: The application MUST display the currently opened file's name at the top of the workspace, distinct from (and in addition to) any window-title indication established in Feature 003.
- **FR-008**: When no file is opened, the header MUST display a clear placeholder such as "Untitled" so the user is never left without an answer to "what am I editing?".
- **FR-009**: The header MUST include a visible modified indicator (e.g., an asterisk next to the file name) whenever the document's modified state (FR-006) is true, and MUST remove that indicator when the document is in sync with disk.
- **FR-010**: When the file name (or path) does not fit the available header width, the application MUST display a truncated form AND make the full path discoverable through progressive disclosure (such as a hover tooltip).
- **FR-011**: The header MUST remain visible across all view modes from Feature 003 (editor only, preview only, split) and across the responsive layouts established in Feature 002.

**Auto-save**

- **FR-012**: The application MUST provide a clearly labeled auto-save toggle (a checkbox or equivalent control) placed near the Save control in the primary chrome.
- **FR-013**: While auto-save is enabled AND a file is currently opened, the application MUST write the editor's current text to that file automatically after a brief idle period (debounce) following the user's last edit; it MUST NOT save during active keystroke bursts.
- **FR-014**: While auto-save is enabled but no file is currently opened, the application MUST NOT write anywhere and MUST NOT display a "saved" state; the auto-save toggle remains visible and its setting is retained for the next time a file is opened.
- **FR-015**: An auto-save failure MUST follow the same error path as a manual save failure (FR-004): editor content preserved, modified indicator retained, brief dismissible error message displayed.
- **FR-016**: A successful auto-save MUST clear the modified indicator the same way a successful manual save does (FR-003).
- **FR-017**: When the user toggles auto-save OFF after enabling it, the application MUST stop performing automatic saves immediately; any unsaved changes remain unsaved until the user activates Save manually.
- **FR-018**: The application MUST guarantee that a manual Save and a concurrent auto-save cannot corrupt the file on disk; at most one effective write per logical save MUST reach disk.

**Preference persistence**

- **FR-019**: The application MUST persist the user's auto-save preference (on / off) between launches, alongside the preferences already persisted by Feature 003 (theme and view mode).
- **FR-020**: If the auto-save preference cannot be read on launch (missing, corrupted, or unrecognized value), the application MUST default auto-save to OFF and continue to launch normally, consistent with Feature 003's preference-fallback behavior.

**Discoverability**

- **FR-021**: The Save control, the auto-save toggle, and the active-file header MUST all be reachable from the application's primary visible chrome so that a first-time user can find them without prior instruction, consistent with Feature 003's discoverability requirement.

### Key Entities

- **Editor Document State**: The current text in the editor plus a single derived bit — whether that text differs from what was last successfully written to the backing file (or, if never saved this session, from the content the file was opened with). The modified indicator and the Save control's enabled state are both projections of this entity.
- **Active File Reference**: An extension of Feature 003's "Opened File Reference". In addition to identifying which file is currently loaded, it now carries enough information to write the editor's content back to that same file (i.e., the on-disk path). When no file is opened, this reference is absent and the header displays a placeholder.
- **User Preferences (extended)**: The preferences set Feature 003 established (theme, view mode) plus one new preference: auto-save on / off. Persistence and fallback follow the same rules as Feature 003.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With a markdown file up to 100 KB opened and edits typed in, a user can save those edits to disk within 1 second of activating the Save control in 99% of attempts on a writable location.
- **SC-002**: At least 95% of save attempts to a writable, available file succeed; the remaining 5% (permission denied, vanished file, disk full, read-only volume, etc.) surface a clear, dismissible error message and never silently lose or corrupt the editor's content.
- **SC-003**: The active-file header accurately reflects the current state ("Untitled" with no file open, the file name when a file is open, with a visible modified indicator whenever unsaved changes exist) in 100% of observed states across the three view modes.
- **SC-004**: When auto-save is enabled and a file is opened on a writable location, edits typed during a typing session are written to disk within 5 seconds of the user pausing typing in 100% of cases that do not encounter a filesystem error.
- **SC-005**: Across 100 consecutive auto-save cycles on a writable location, no file corruption, partial write, or duplicated write occurs; manual Save activated during an in-flight auto-save also produces no corruption.
- **SC-006**: The auto-save preference is restored correctly on the next application launch in 100% of normal launches; in the rare case the preference cannot be read, the application launches successfully with auto-save OFF.
- **SC-007**: At least 80% of first-time users can locate the Save control, the auto-save toggle, and the active-file header within 30 seconds of opening the application, without consulting external documentation.
- **SC-008**: Saving any well-formed markdown file up to 1 MB completes without making the application unresponsive (the editor remains interactive throughout).

## Assumptions

- "Save" writes back to the same file that was opened via Feature 003's Open control. "Save As" (writing to a different path), "Save a Copy", and a prompt-on-quit-when-unsaved are all explicitly out of scope and are candidates for follow-up features.
- When no file is opened (starter content or empty buffer), Save is unavailable. Users must first open a file via Feature 003 to gain a backing path. Creating a new file from inside MILF (e.g., "New file…") is a candidate for a follow-up feature.
- Auto-save uses a short idle debounce after the user's last edit (on the order of 1–3 seconds) so it does not churn out a write per keystroke. The exact interval is an implementation choice within reasonable bounds and does not need to be exposed to the user.
- Auto-save fires only on idle. It does NOT fire on focus loss, on view-mode switch, on theme toggle, on Open (which replaces content per Feature 003), or on application close. Save-on-close and save-on-blur are candidates for follow-up features.
- The modified indicator follows the common convention of an asterisk (or equivalent visual marker) next to the file name. The exact glyph is a visual-design detail and not constrained further by this spec.
- The active-file header at the top of the workspace supplements the window-title indication established in Feature 003 (FR-007 of Feature 003). The window title MAY continue to reflect the same information; this spec only mandates the in-app top-of-workspace header.
- File path display defaults to the file name (basename). The full path is reachable through progressive disclosure (hover tooltip is the assumed pattern, but the spec does not prescribe the exact mechanism).
- Save uses the same text encoding the file was opened with (per Feature 003's open path). This spec does not introduce new encoding semantics, line-ending normalization, or BOM handling beyond what Feature 003 already establishes.
- Failure messages reuse the same brief, dismissible error pattern established by Feature 003's open-file error path; no new modal or persistent error UI is introduced.
- No keyboard shortcut is required by this spec. Ctrl+S / Cmd+S for Save is a natural follow-up and is not prohibited by this spec.
- Crash recovery, automatic backups, and external file-watch ("the file changed under us") are out of scope. The user is responsible for saving (or enabling auto-save) before quitting if they want their work persisted.
- The auto-save preference is stored using the same local preference mechanism established in Feature 003. Preferences remain on the user's machine and are never sent over the network, consistent with the constitution's local-first principle.
- A "Recent files" list and multi-document editing (tabs, multiple windows of MILF working on different files) remain out of scope and are candidates for follow-up features.
- The Save control, auto-save toggle, and active-file header are subject to the "islands" visual aesthetic established in Feature 002; this feature adds controls but does not redesign the overall chrome.
- Save concurrency (manual Save during an in-flight auto-save, or two rapid Saves in quick succession) is resolved internally so the file on disk is never partially written; the exact synchronization mechanism is an implementation detail and does not surface as user-visible behavior beyond "the file ends up correct".
