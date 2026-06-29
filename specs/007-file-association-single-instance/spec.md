# Feature Specification: OS File Association, Single Instance, and Session Restore

**Feature Branch**: `007-file-association-single-instance`

**Created**: 2026-05-22

**Status**: Draft

**Input**: User description: "When assigned as default app to open .md files make sure it opens the file when clicked. Also make it remember the opened files, only close those which does not exists anymore. Also make it possible to open a files as positional arguments like 'markpad file1.md file2.md' would open file1.md and file2.md accordingly next to the already open files. Always present the latest opened file when loading the app. The app should have one instance running and if it is running when a file is clicked to open it should be opened in the running instance brought to front."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a markdown file by clicking it in the OS file browser (Priority: P1)

A user keeps `notes.md` on their desktop. They have configured markpad as the default application for `.md` files through their operating system's settings. They double-click `notes.md`. markpad launches and the file appears as a tab in the workspace, becoming the active tab — they can read and edit it immediately, just as if they had used the in-app Open control (Feature 003). For the user, markpad behaves like a "real" default markdown editor: the operating system's file-association mechanism just works.

**Why this priority**: This is the headline of this feature. Today, markpad can only open files via its own Open control — the user has to launch markpad first, then browse to the file from inside the app. That is acceptable for occasional use but it makes markpad feel like an "expert tool" rather than a default editor. Routing OS file activations into markpad is the smallest change that makes markpad feel native to the user's file browser, which is the entry point for most everyday markdown work.

**Independent Test**: Configure markpad as the default handler for `.md` files in the operating system's settings. From the OS file browser, double-click a markdown file (or right-click → "Open with markpad"). Confirm markpad launches and the file appears as the active tab with its content displayed in the editor and preview. Use a second `.md` file with the same procedure to confirm the behavior is repeatable.

**Acceptance Scenarios**:

1. **Given** markpad is registered as a handler for `.md` files in the operating system AND markpad is not currently running, **When** the user double-clicks a markdown file in the OS file browser, **Then** markpad launches AND that file appears as a tab in the workspace AND that tab is the active tab AND the editor and preview display its content.
2. **Given** the OS routes a file activation to markpad and the file's path contains spaces or non-ASCII characters, **When** markpad processes the activation, **Then** the file opens correctly — the full path the OS handed over is honored without truncation, escaping artifacts, or substitution.
3. **Given** the user activates a markdown file via "Open With" → "markpad" (not necessarily the default handler), **When** markpad processes the request, **Then** the file opens with the same behavior as a default-handler double-click.

---

### User Story 2 - Single running instance with bring-to-front routing (Priority: P2)

A user already has markpad open with two markdown files. They go back to their file browser and double-click a third markdown file. Instead of a second markpad window appearing, the existing markpad window jumps to the foreground (un-minimizing or coming above other windows as needed) and the third file shows up as a new tab alongside the two they were already editing. Their two existing tabs — including any unsaved edits in them — are untouched. The user does not have to manage multiple markpad windows, and there is never a "which window has my notes?" moment.

**Why this priority**: Without this story, every double-click on a `.md` file launches a brand-new markpad window, accumulating dozens of duplicates after a normal day. Session-restore (Story 4) would also fight with multi-instance — each new launch would try to load and re-show the same saved session. Single-instance is what makes Story 1 (file association) usable in practice and what makes Stories 3 and 4 internally consistent. It is P2 only because Story 1 alone is already an improvement over the current state, even with the multi-window annoyance; this story removes that annoyance.

**Independent Test**: Launch markpad, open one file via the Open control, then minimize the window. From a terminal or file browser, invoke markpad again (either bare `markpad`, or `markpad some-file.md`, or by double-clicking a file from the OS browser). Confirm no second window appears; the existing window restores from minimized state, comes to the foreground, and — if a file was passed — that file appears as a new tab and becomes active.

**Acceptance Scenarios**:

1. **Given** markpad is running with at least one open tab, **When** a second launch of markpad is attempted (with no file arguments), **Then** no second window is created AND the existing window comes to the user's foreground (raised above other windows, un-minimized and un-hidden if needed, with input focus) AND the existing tab set is unchanged.
2. **Given** markpad is running with at least one open tab, **When** a second launch of markpad is attempted with one or more file paths (from OS activation or command-line arguments), **Then** no second window is created AND the existing window comes to the user's foreground AND every supplied file is opened as a tab in the existing window per Feature 006's tab rules AND every previously open tab (and any unsaved edits in it) is preserved.
3. **Given** markpad is running and the user activates a file in the OS browser whose path matches a file that already has a tab open, **When** the activation is delivered to the running instance, **Then** the existing tab for that file becomes active rather than a duplicate tab being created AND any unsaved edits in that tab are preserved (Feature 006 FR-011 continues to apply for OS-delivered files).
4. **Given** markpad is running and the user activates several markdown files in quick succession from the OS file browser, **When** all activations have been delivered to the running instance, **Then** every distinct file appears as a tab AND the most recently activated file is the active tab AND no activation is silently lost.

---

### User Story 3 - Open files by passing them as command-line arguments (Priority: P3)

A user works from a terminal. They want to open two existing markdown files in markpad in one step: `markpad intro.md changelog.md`. markpad either launches (if not running) or routes to the existing instance (if running), opens both files as tabs alongside any other tabs, and makes the last file in the argument list — `changelog.md` — the active tab. The user can script this into their own workflows (an alias, a git hook, an editor integration) and trust the same outcome each time.

**Why this priority**: Command-line file arguments serve power users, scripts, and integrations. Most users will reach markpad via Stories 1 and 2 (file-browser clicks); the CLI is the deliberate, scriptable alternative. It is P3 because it shares almost all the underlying behavior with Stories 1 and 2 (route to single instance, open files as tabs, preserve existing tabs) and adds relatively little user-visible value on top, but it is essential for terminal-centric workflows.

**Independent Test**: From a fresh shell with markpad not running, run `markpad file1.md file2.md`. Confirm markpad launches with both files as tabs, in argument order, with `file2.md` active. Then with markpad still running, run `markpad file3.md`. Confirm `file3.md` is added as a new tab next to the previous two and becomes active, and no second window appears. Run `markpad nonexistent.md real-file.md`; confirm `real-file.md` opens and `nonexistent.md` is silently skipped with no error dialog and no orphan tab.

**Acceptance Scenarios**:

1. **Given** markpad is not running, **When** the user runs `markpad <file1> <file2> ... <fileN>` with one or more file paths, **Then** markpad launches AND every file that exists and is readable opens as a tab AND tabs appear in the order the arguments were supplied AND the last successfully opened file is the active tab.
2. **Given** markpad is already running with existing tabs, **When** the user runs `markpad <file1> <file2> ... <fileN>`, **Then** no second window is created AND every file that exists and is readable is added as a tab next to the existing tabs AND the last successfully opened file becomes the active tab AND existing tabs (and their unsaved edits) are preserved.
3. **Given** the user provides relative paths as arguments (e.g., `markpad ./drafts/x.md ../README.md`), **When** markpad processes the arguments, **Then** each relative path is resolved against the working directory from which the command was invoked, not against markpad's installation directory or any other location.
4. **Given** one or more argument paths refer to non-existent or unreadable files, **When** markpad processes the arguments, **Then** the bad paths are silently skipped (no modal error dialog, no orphan "missing" tab placeholder) AND the remaining good paths are opened normally AND the user-visible outcome is exactly as if the bad paths had not been listed.
5. **Given** the user runs `markpad` with no arguments while no instance is running, **When** markpad starts, **Then** session restore (Story 4) governs the initial tab set; the absence of CLI arguments is not itself an error.

---

### User Story 4 - Remember and restore the previous session's open files (Priority: P4)

A user has been working with three markdown files open in markpad tabs. They close the app at the end of the day. The next morning, they launch markpad — and the same three tabs reappear in the same order, with the tab they had been actively viewing yesterday already active and visible. If one of those files was moved or deleted overnight (e.g., they reorganized a folder), markpad silently leaves that file out of the restored set — no error dialog, no broken tab — and opens only the files that still exist. The user does not have to remember which files they were editing or hunt them down again; "where I left off" is the default starting state.

**Why this priority**: Session restore is a quality-of-life win that compounds with every other story in this feature. Without it, every relaunch of markpad returns to the empty state — even if the user just rebooted their machine and wants to resume immediately. It is P4 (last of the four) because the other three stories (Stories 1-3) deliver primary user value at every launch; session restore makes subsequent launches resume faster. The "drop missing files silently" rule keeps the restore robust in the face of normal file-management activity outside markpad.

**Independent Test**: Open markpad, open three different markdown files via the Open control (Feature 003), switch to the middle one so it is the active tab, then close markpad. Relaunch markpad. Confirm the same three files are open as tabs, in the same order, with the middle file active. Then delete one of those three files from disk outside of markpad, close markpad, and relaunch. Confirm the remaining two files are open as tabs (the deleted file is silently absent), no error dialog appears, and an existing-file tab is active.

**Acceptance Scenarios**:

1. **Given** markpad was closed with N files open as tabs (N ≥ 1), **When** the user next launches markpad AND every saved file still exists and is readable, **Then** all N files are reopened as tabs in the same order they appeared at close AND the tab that was active at close is active again AND the workspace is otherwise indistinguishable from the state at close (excluding any in-memory unsaved edits, per Assumptions).
2. **Given** markpad was closed with N files open as tabs (N ≥ 1) AND between close and the next launch one of those files was deleted, moved, or made unreadable, **When** the user next launches markpad, **Then** the missing file is silently dropped from the restored set (no error dialog, no orphan tab placeholder) AND the remaining files are reopened as tabs in their original relative order.
3. **Given** the file that was the active tab at close is the one that no longer exists at relaunch, **When** markpad restores the session, **Then** another tab corresponding to a still-existing file becomes the active tab (the application picks a sensible neighbor — e.g., the next file in saved order, or the previous if none follow); the workspace MUST NOT be left tabless when other restored tabs exist.
4. **Given** markpad was closed with one or more tabs open but at relaunch none of those files still exist, **When** markpad restores the session, **Then** the workspace falls back to the empty state defined by Feature 006 FR-003 (no tabs, empty editor placeholder, empty preview, Save unavailable) AND no error dialog is shown for the missing files.
5. **Given** the user is launching markpad for the very first time (or after a session reset) AND there is no saved session, **When** markpad starts, **Then** the workspace shows the empty state defined by Feature 006 FR-003.
6. **Given** markpad is launching with both a saved session AND positional file arguments (Story 3), **When** the initial tab set is composed, **Then** the saved session's tabs are restored first AND the argument files are added after them as new tabs (deduplicating against the restored tabs per Feature 006 FR-011) AND the last successfully opened argument file is the active tab (the argument list takes precedence over the saved active-tab pointer).

---

### Edge Cases

- The user has configured markpad as the default for `.md` and double-clicks a file whose path contains spaces, accented characters, or emoji. The file opens with the exact path the OS handed over; no characters are dropped or substituted.
- The user activates a non-`.md` file (e.g., `.markdown`, `.txt`, or some other extension) via "Open with → markpad". The file opens; markpad does not filter by extension internally — what the OS routes, markpad opens. The OS controls which extensions are routed to markpad.
- The user double-clicks a `.md` file while markpad is mid-launch (cold start in progress, splash visible). The file-open request is queued and applied as soon as the running instance is ready; no file is lost and no second window appears.
- The user runs `markpad` with no arguments while markpad is already running. The existing window comes to the foreground and the tab set is unchanged (this is the "raise me" use case).
- The user runs `markpad` with no arguments while markpad is NOT running. markpad performs a normal launch: session restore (Story 4) governs the initial tab set; if no session exists, the workspace shows the empty state.
- The user activates a file from the OS browser that already corresponds to an open tab. The existing tab is re-focused per Feature 006 FR-011; no duplicate tab is created; the in-memory edits in that tab are preserved (the content is NOT reloaded from disk).
- A saved session contains a file on a removable drive or network share that is unavailable at the next launch (drive ejected, share offline). markpad treats that file as "missing" and silently drops it from the restored set, exactly as it would for a deleted file.
- The user clicks several `.md` files in rapid succession from the OS browser. Each activation results in a tab (deduplicated against existing tabs). The most recently activated file becomes the active tab. No activation is silently dropped.
- The user has unsaved edits in an open tab when a new file-open request arrives (OS activation or CLI argument). The new file opens as an additional tab; the existing tab and its unsaved edits are preserved (Feature 006 FR-012); the new tab becomes active.
- The application is minimized to the taskbar (Windows) or dock (macOS/Linux) when an OS file activation arrives. The window is restored and brought to the foreground before the new tab becomes visible.
- The application is on a different virtual desktop or monitor than the user's current focus when a launch attempt arrives. Bring-to-front follows OS conventions; the spec does not promise specific cross-desktop teleportation behavior beyond what the host OS exposes for "bring window to foreground".
- The user uninstalls markpad or removes its registered file association. OS double-clicks no longer route to markpad; this is a normal OS-level outcome and not a regression in markpad.
- The user passes the same file twice on the command line (`markpad foo.md foo.md`) or passes a file that already has a tab. Only one tab represents the file (per Feature 006 FR-011); the second reference re-focuses the existing tab.
- The user closes markpad while a file-open request from a second invocation is in flight. The second invocation either completes against the still-living first instance or, if the first has already exited, behaves as a fresh launch and opens the file as the initial tab.
- The user has so many files in the saved session that opening them all is slow. Restore proceeds in order; the workspace becomes usable as files load; no individual slow file blocks the rest. (Per-file performance is governed by Feature 003.)
- The saved session record is missing, corrupt, or unreadable at launch (file deleted, format change after upgrade). markpad falls back to the empty state and does not show an error dialog; the session is then re-saved fresh from the new session's activity.

## Requirements *(mandatory)*

### Functional Requirements

**OS file activation**

- **FR-001**: When the operating system activates markpad with one or more file paths (typically via a file-association double-click, an "Open With → markpad" menu, or an equivalent OS mechanism), markpad MUST open each supplied file as a tab in the workspace.
- **FR-002**: A file delivered via OS activation MUST be added to the existing tab set (when markpad is already running, per single-instance routing — see FR-006) or to the launch tab set (when markpad is starting from cold), without replacing, closing, or modifying any other tab, consistent with Feature 006 FR-011 and FR-012.
- **FR-003**: A file delivered via OS activation MUST become the active tab on arrival; when multiple files arrive close together (e.g., several rapid double-clicks), the most recently arrived file MUST be the active tab once all have been processed.
- **FR-004**: markpad MUST honor the full file path the operating system supplies, including paths containing spaces, non-ASCII characters, or other locale-specific characters, without truncation or substitution.

**Single running instance and bring-to-front**

- **FR-005**: At most one running instance of markpad MUST exist per OS user session at any time; a launch attempt while an instance is already running MUST NOT create a second main window or a second persistent process.
- **FR-006**: A launch attempt (whether bare, with command-line file arguments, or via OS file activation) that occurs while an instance is running MUST be routed to the existing instance; any file paths supplied by the new launch attempt MUST be opened in the existing instance per FR-002.
- **FR-007**: When a launch attempt is routed to an already-running instance, the existing main window MUST come to the user's foreground — it MUST be un-minimized and un-hidden if necessary, raised above other windows, and given input focus — following the host operating system's conventions for "bring window to foreground".
- **FR-008**: A bare second launch (no file arguments) while an instance is running MUST bring the existing window to the foreground per FR-007 AND MUST NOT modify the existing tab set in any way.
- **FR-009**: When the second invocation has delivered its file arguments to the first instance, the second process MUST exit cleanly without producing a visible window of its own.

**Command-line positional arguments**

- **FR-010**: When markpad is invoked with positional command-line arguments, each argument MUST be interpreted as a file path. Relative paths MUST be resolved against the working directory from which the invoking command was run; absolute paths MUST be used as supplied.
- **FR-011**: Every argument file that exists and is readable MUST be opened as a tab, in the order the arguments were supplied; the last successfully opened argument file MUST become the active tab.
- **FR-012**: An argument that refers to a non-existent or unreadable file MUST be silently skipped (no modal error dialog, no orphan tab placeholder); processing of remaining arguments MUST continue.
- **FR-013**: When markpad is invoked with positional arguments AND a saved session exists (FR-014), session restore MUST run first AND the argument files MUST be added after the restored tabs (deduplicating per Feature 006 FR-011); the last successfully opened argument file MUST become the active tab, overriding the saved active-tab pointer from the session.

**Session persistence and restore**

- **FR-014**: markpad MUST persistently remember, between launches, the set of files open in the workspace and an identifier for which of those tabs was active, so the set can be restored on the next launch. The session record MUST be written at least at normal application shutdown.
- **FR-015**: On launch (cold start with no second-invocation handoff), markpad MUST attempt to reopen every remembered file whose path still exists and is readable, as tabs, in the order the files appeared at the time the session was saved.
- **FR-016**: Any remembered file whose path no longer exists or cannot be read at restore time MUST be silently dropped from the restored set — no error dialog, no orphan or "missing" tab placeholder.
- **FR-017**: The tab that was active at the time the session was saved MUST be re-activated at restore, provided that file still exists and is readable; if it does not, the application MUST activate a different surviving tab from the saved set (a sensible neighbor — the next file in saved order, or a prior one if none follow). The workspace MUST NOT be left without an active tab when at least one restored tab exists.
- **FR-018**: When no saved session exists (very first launch, session deleted, or session unreadable) AND no command-line arguments were supplied, markpad MUST start in the empty-state workspace defined by Feature 006 FR-003.
- **FR-019**: When a saved session existed but none of the remembered files still exist or are readable at restore time, markpad MUST fall back to the empty state defined by Feature 006 FR-003.
- **FR-020**: A corrupt, missing, or unreadable session record MUST NOT block launch and MUST NOT surface an error dialog; markpad MUST fall back to the empty state and rebuild the session record from the current session's activity.
- **FR-021**: The session record MUST capture on-disk file paths only; in-memory unsaved edits in tabs MUST NOT be persisted across launches (saving edits to disk remains the user's responsibility via Feature 004's manual or auto-save).

**Composition of the initial tab set after launch**

- **FR-022**: After every launch (cold start without arguments, cold start with arguments, second-invocation handoff with or without arguments), the active tab MUST be selected by the following precedence: (1) the last file successfully opened from command-line arguments or OS activation in the current launch; otherwise (2) the active tab restored from the saved session; otherwise (3) the workspace is in the empty state and no tab is active.
- **FR-023**: Files delivered via OS activation, command-line arguments, or session restore that resolve to the same on-disk file as an already-open tab MUST follow Feature 006 FR-011 — the existing tab is re-focused, no duplicate tab is created, and in-memory edits in that tab are preserved (the file is NOT reloaded from disk).
- **FR-024**: Opening files via OS activation, command-line arguments, or session restore MUST NOT modify, save, or otherwise affect any other open tab; existing tabs and their unsaved edits MUST be preserved exactly per Feature 006 FR-012.

### Key Entities

- **Session Record**: A persistent, per-user record of the workspace state at the time the application was last closed (or last opportunistically saved). Contains an ordered list of on-disk file paths plus an identifier for which of those paths was the active tab. Does NOT contain in-memory editor text. Read at launch (FR-015) and written at least at shutdown (FR-014).
- **Launch Request**: Any event that asks markpad to start or to open files. Includes: a fresh launch with no arguments, a fresh launch with positional file arguments, an OS file activation (default-handler double-click or "Open With" routing), and any second invocation while an instance is already running. Routed either to a new markpad instance (no instance running) or to the existing instance (FR-005, FR-006).
- **Initial Tab Set**: The collection of tabs markpad presents immediately after a launch request is fully processed. Composed of: tabs restored from the Session Record (deduplicated, missing files dropped) plus files supplied by the current Launch Request (deduplicated against the restored tabs). A single active tab is selected per FR-022.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When markpad is registered as the default handler for `.md` files in the operating system, double-clicking a `.md` file in the OS file browser results in that file appearing as the active tab in markpad in 100% of attempts (across both cold-start and already-running cases).
- **SC-002**: A second launch attempt of markpad (via OS activation, "Open With" routing, or command-line invocation) while a markpad instance is already running produces no second window in 100% of attempts; the existing window comes to the user's foreground.
- **SC-003**: A second launch attempt that supplies one or more file paths delivers all supplied files to the existing instance as tabs in 100% of attempts, preserving every previously open tab and its unsaved edits.
- **SC-004**: When markpad is invoked with `markpad <file1> <file2> ... <fileN>` (N ≤ 10) on a cold start, all listed files that exist on disk are opened as tabs in the supplied order, the last existing file becomes the active tab, and the workspace is ready for editing within 3 seconds.
- **SC-005**: After closing markpad with up to 20 files open and relaunching it, every file from the saved session that still exists is reopened as a tab in 100% of relaunches, in the same order as at close, with no error dialog and no orphan tab for any missing file.
- **SC-006**: After relaunching with a saved session, the tab that was active at close is active again in 100% of relaunches where that file still exists; in 100% of cases where that file is missing but other saved files still exist, some other surviving tab is active (the workspace is never left tabless when restorable tabs exist).
- **SC-007**: A file delivered to an already-running markpad (via OS activation, second-invocation CLI, or "Open With") becomes a tab AND the window comes to the foreground within 500 milliseconds of the OS dispatching the event, in at least 95% of cases on a typical desktop machine.
- **SC-008**: A non-existent or unreadable file path supplied via command-line argument or recovered from a saved session never produces an error dialog, never causes the launch to fail, and never leaves an orphan or placeholder tab in the workspace, in 100% of attempts.
- **SC-009**: A first-time user who has configured markpad as the default `.md` handler can open a markdown file by double-clicking it in the OS file browser without consulting external documentation, in at least 90% of first-time attempts.
- **SC-010**: Across at least 50 consecutive launches with a non-empty saved session, the restored tab order matches the saved tab order in 100% of launches and the restored active-tab selection matches the rules in FR-017 in 100% of launches.

## Assumptions

- The user is responsible for configuring markpad as the operating system's default handler (or as an "Open With" option) for markdown file extensions through OS-provided settings. This specification describes markpad's behavior once the OS has been configured to route files to it; the installer-level mechanics by which markpad advertises support for `.md` to the OS are an implementation detail and are not constrained here.
- "Single instance" is scoped per operating-system user session — one running markpad per logged-in user. Multiple OS users on the same machine each get their own independent instance. Cross-user file routing is out of scope.
- "Bring window to foreground" follows the host operating system's conventions and accessibility settings. Specific behavior across multiple monitors, virtual desktops, "always on top" arrangements, and focus-stealing-prevention features is whatever the host OS provides; the spec does not promise behavior beyond what the OS exposes for raising a window.
- The session record stores on-disk file paths only. Restoring a tab means reopening the file from disk, the same way Feature 003's Open would. In-memory unsaved edits at the time of close are NOT preserved across launches — preserving them would be a separate "restore unsaved edits" feature. Users save intentionally via Feature 004's manual Save or auto-save.
- Tab order at restore matches the tab order at the time the session was saved (consistent with Feature 006's assumption that tabs occupy the order in which they were opened and drag-to-reorder is out of scope).
- The session record is saved at least at normal application shutdown. Implementations MAY opportunistically save during the session (e.g., after each tab open/close/switch) to survive abnormal termination; the exact save cadence is an implementation detail, not constrained by this spec.
- The session record's storage location, file format, and schema are implementation details, scoped to a per-user application-data location maintained by markpad.
- markpad does not internally restrict the file types it will open via OS activation or command-line arguments. The OS controls which extensions are routed to markpad via file association; the user controls which paths they pass on the command line. Files that contain content other than markdown still open; their on-screen rendering is governed by Feature 003 (Open behavior) and not extended here.
- The Feature 006 assumption that "tabs do not persist across application launches" is SUPERSEDED by this feature; restoring tabs across launches is now the documented default. The Feature 006 follow-up candidate "restore previous session's tabs on launch" is fulfilled by this feature.
- A second markpad process invoked while a first instance is running exits cleanly after delivering its file arguments (or its bare "bring me to front" request) to the first instance; no second main window is briefly visible during the handoff.
- A small race may exist between session restore (FR-015) and a near-simultaneous launch-request handoff at cold start. The spec requires that all requests are honored — no files are silently lost — but does not constrain the exact ordering between session-restored tabs and arrival-time tabs beyond FR-022's active-tab precedence rule.
- The Feature 006 empty state (FR-003) continues to apply whenever the initial tab set is empty after FR-015 through FR-019 have been evaluated.
- Multiple-window support, a `--new-window` flag, "detach tab into a new window", and similar multi-window features are explicitly out of scope; the user has stated a single-instance requirement and follow-up features may revisit this if needed.
- Command-line flags beyond positional file arguments (e.g., `--help`, `--version`, `--no-session`) are not required by this spec and are candidates for a follow-up feature. The spec only requires that positional arguments are interpreted as file paths (FR-010) and does not constrain or forbid the future addition of flags.
- "Open With" routing on operating systems where markpad is registered as a handler but not the default behaves identically to default-handler routing from markpad's perspective — both deliver a file path via the same OS activation mechanism (FR-001).
- The window title behavior from Feature 003 and the tab-strip behavior from Feature 006 continue to apply unchanged; this feature changes the set of tabs (how it is composed at launch) and the existence of multiple instances (now at most one), not the per-tab UI.
