# Feature Specification: Core Workspace Controls

**Feature Branch**: `003-core-ui-controls`

**Created**: 2026-05-21

**Status**: Draft

**Input**: User description: "Add basic functionalities: add dark-light mode switch, open file, switch to show only edit, only preview or split pane."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open an existing markdown file from disk (Priority: P1)

A user has markdown notes saved as files on their computer (a meeting note, a README, a journal entry). They launch markpad and use a clearly visible "Open" control to pick the file from a native file dialog. The editor immediately shows the file's text, the preview renders it, and the user can read and revise their existing notes inside markpad instead of in a plain text editor.

**Why this priority**: This is the change that turns markpad from a starter-content demo into a usable tool. Without it, the application can only ever show throwaway in-memory content. Every subsequent feature (saving, recent files, watching for changes, etc.) builds on the existence of a working "open" path.

**Independent Test**: Save a small markdown file (e.g., `# Title\n\nSome **bold** text.`) to disk, launch markpad, click the Open control, pick that file, and confirm the editor shows the exact text and the preview shows the rendered output.

**Acceptance Scenarios**:

1. **Given** the application is open with starter content, **When** the user invokes the Open control and selects a valid markdown file, **Then** the editor's content is replaced by the file's text and the preview updates to match.
2. **Given** the user has invoked the Open control, **When** they cancel the file dialog without choosing a file, **Then** the editor and preview remain exactly as they were before.
3. **Given** the user selects a file that cannot be read (permission denied, file vanished, not text), **When** the open operation fails, **Then** the editor's content is preserved and a brief, dismissible error message explains why the file could not be opened.
4. **Given** the user opens a file successfully, **When** they look at the application chrome, **Then** the application indicates which file is currently loaded (e.g., its name appears in the window title or a similar location).
5. **Given** the file dialog is open, **When** the user views the default filter, **Then** markdown files are surfaced by default but the user can broaden the filter to all files.

---

### User Story 2 - Choose how the workspace is laid out (Priority: P2)

A user is drafting a long document and wants to focus on writing without the preview distracting them; later, they want to read the rendered result on the full width of the window before sharing it. They use a single control to switch the workspace between three modes: editor only, preview only, and the original split-pane view. Their editor content is preserved across every switch.

**Why this priority**: Daily writing flow benefits a lot from this. It's not strictly required to use the app (split mode is always available), but it is the first feature that adapts the workspace to the user's current task instead of forcing one layout. It depends on the workspace already existing (002) but does not depend on file opening (P1) to be useful.

**Independent Test**: Open the application, type some markdown into the editor, then cycle through the three view modes and confirm that each mode shows the expected layout and that the editor's text is preserved across every switch.

**Acceptance Scenarios**:

1. **Given** the workspace is in split mode (editor and preview side by side), **When** the user selects "editor only", **Then** the preview pane is hidden and the editor expands to fill the available content area.
2. **Given** the workspace is in split mode, **When** the user selects "preview only", **Then** the editor pane is hidden and the preview expands to fill the available content area.
3. **Given** the workspace is in "editor only" or "preview only", **When** the user selects "split", **Then** both panes return to the side-by-side layout established in the foundation (Feature 002).
4. **Given** the user has typed content into the editor, **When** they switch view modes any number of times, **Then** the editor's text is preserved across every switch and the preview reflects the same content whenever it is visible.
5. **Given** the user picked a view mode, **When** they close and relaunch the application, **Then** the workspace reopens in the same view mode they last used.

---

### User Story 3 - Switch between light and dark theme (Priority: P3)

A user works in a bright office during the day and a dim room in the evening. They use a clearly labeled control to toggle the application between a light and a dark theme. The change applies immediately to every visible surface — editor, preview, and chrome — and their choice is remembered the next time they open the application.

**Why this priority**: Improves comfort and accessibility but the application is fully usable without it. Implementing it later does not require redoing earlier work. It is intentionally listed third so the more functional features (file opening, view modes) ship first if scope must be trimmed.

**Independent Test**: Launch the application, observe the initial theme, toggle the theme control, and confirm that the editor area, the preview area, and any chrome (buttons, dividers) all switch consistently to the other theme without artifacts.

**Acceptance Scenarios**:

1. **Given** the application is in light theme, **When** the user activates the theme toggle, **Then** the entire visible interface switches to a dark theme without any element remaining in the previous theme.
2. **Given** the application is in dark theme, **When** the user activates the theme toggle, **Then** the entire visible interface switches to a light theme without any element remaining in the previous theme.
3. **Given** the user has chosen a theme, **When** they close and relaunch the application, **Then** the application opens in the same theme they last chose.
4. **Given** the user has never explicitly chosen a theme, **When** they launch the application for the first time on a system whose appearance preference is "dark", **Then** the application opens in the dark theme by default; the same applies symmetrically for systems set to "light".
5. **Given** the editor contains content and the preview shows its rendered output, **When** the user toggles the theme, **Then** the content in both panes is preserved unchanged; only the colors change.

---

### Edge Cases

- The user opens a file that is empty. The editor and preview both display a clean empty state without error.
- The user opens a file with very long lines, unusual whitespace, or non-ASCII characters. The editor and preview handle it the same way they handle equivalent typed input (per Feature 002).
- The user opens a very large markdown file (e.g., 10 MB). The application still loads it; performance may degrade gracefully but the application MUST NOT crash.
- The user opens a binary file by mistake (e.g., a PDF or image with a misleading extension). The application detects it cannot be treated as text and shows the same kind of error as a read failure rather than corrupting the editor.
- The user is in "preview only" mode and opens a file. The editor still receives the file content; switching back to split or editor mode reveals the loaded text.
- The user toggles the theme while the preview is in the middle of re-rendering. The render completes and the new theme is applied to the resulting output.
- The user switches view modes while typing. No keystrokes are lost; the editor's text is preserved.
- The user resizes the window to a very narrow width while in "editor only" or "preview only" mode. The single visible pane keeps its full-width layout and remains usable, consistent with the responsiveness rules established in Feature 002.
- The user-chosen preferences (theme, view mode) cannot be read on launch (e.g., corrupted preference store). The application falls back to the documented defaults (system theme, split view) instead of failing to start.

## Requirements *(mandatory)*

### Functional Requirements

**Open file**

- **FR-001**: The application MUST provide a clearly discoverable control that opens a native file picker for selecting a file from the local filesystem.
- **FR-002**: The file picker MUST default to filtering for markdown file extensions (at minimum `.md` and `.markdown`) and MUST allow the user to broaden the filter to all files.
- **FR-003**: When the user confirms a file selection, the application MUST read the file's contents as text and replace the editor's current content with that text.
- **FR-004**: After the editor content is replaced by an opened file, the preview MUST update to reflect the new content using the same rendering pipeline as for typed input.
- **FR-005**: When the user cancels the file picker, the editor's content and the preview MUST remain unchanged.
- **FR-006**: When opening a file fails for any reason other than user cancellation (permission denied, file removed, not readable as text, etc.), the editor's content MUST remain unchanged AND the application MUST surface a brief, dismissible error message that names what went wrong in plain language.
- **FR-007**: After a file has been opened successfully, the application MUST indicate which file is currently loaded somewhere in its chrome (for example, in the window title) so the user can tell the editor's content is now backed by a specific file.

**View modes**

- **FR-008**: The application MUST provide a control that lets the user switch the workspace among three view modes: editor only, preview only, and split.
- **FR-009**: In "editor only" mode, the preview pane MUST be hidden and the editor MUST occupy the full content area of the window.
- **FR-010**: In "preview only" mode, the editor pane MUST be hidden and the preview MUST occupy the full content area of the window.
- **FR-011**: In "split" mode, the workspace MUST display the editor and preview side-by-side exactly as established by Feature 002, including the narrow-window stacking behavior.
- **FR-012**: Switching among the three view modes MUST NOT alter, clear, or otherwise lose the editor's content.
- **FR-013**: The currently active view mode MUST be visually indicated on the control so the user always knows which mode they are in.

**Theme**

- **FR-014**: The application MUST provide a control that toggles the visible theme between a light variant and a dark variant.
- **FR-015**: A theme change MUST be applied consistently across every visible surface of the application (editor area, preview area, chrome, controls) so that no element remains in the previous theme.
- **FR-016**: On first launch, the application MUST default the theme to match the operating system's reported appearance preference when one is available; if no such preference can be read, the application MUST default to the light theme.
- **FR-017**: A theme change MUST NOT modify or lose the editor's content or the rendered preview's content.

**Preference persistence**

- **FR-018**: The application MUST persist the user's chosen theme between launches.
- **FR-019**: The application MUST persist the user's chosen view mode between launches.
- **FR-020**: If a persisted preference cannot be read on launch (missing, corrupted, or unrecognized value), the application MUST fall back to its documented default for that preference and continue to launch normally.

**Discoverability**

- **FR-021**: The Open, view-mode, and theme controls MUST all be reachable from the application's primary visible chrome so that a first-time user can find them without prior instruction.

### Key Entities

- **User Preferences**: The set of small, named, locally stored choices the application reads at launch and writes when the user changes them. For this feature: the active theme (light or dark) and the active view mode (editor only, preview only, or split).
- **Opened File Reference**: The lightweight indicator that the editor's current content was last loaded from a specific file on disk. It is used to show the user what they are editing in the chrome. It does NOT yet imply the ability to save back to that file — saving is out of scope for this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can open a markdown file of up to 100 KB and see its content fully rendered in the preview within 2 seconds of confirming the file in the picker.
- **SC-002**: At least 95% of file-open attempts on well-formed markdown files complete without an error message; the remaining 5% (permissions, vanished files, etc.) surface a clear error and never corrupt or clear the editor.
- **SC-003**: A user can switch between any two view modes (editor only, preview only, split) and see the new layout settled within 200 milliseconds, with no flicker beyond a single layout transition.
- **SC-004**: Across 100 view-mode switches, the editor content is preserved unchanged in 100% of switches (no truncation, no reset, no cursor loss beyond what is unavoidable when the editor is hidden).
- **SC-005**: A user can toggle between light and dark theme and see every visible surface update within 500 milliseconds, with no element remaining stuck in the previous theme.
- **SC-006**: Theme and view mode preferences are restored correctly on the next application launch in 100% of normal launches; in the rare case that prior preferences cannot be read, the application launches successfully using the documented defaults.
- **SC-007**: At least 80% of first-time users can locate the Open, view-mode, and theme controls within 30 seconds of opening the application, without consulting external documentation.
- **SC-008**: Loading any well-formed markdown file up to 1 MB succeeds without the application becoming unresponsive (preview may take longer to render, but the editor remains interactive).

## Assumptions

- Theme is a binary user-facing choice (light or dark) in this feature; additional palettes, accent colors, or custom themes are out of scope.
- On first launch, "system appearance preference" means whatever the desktop OS exposes (e.g., light/dark mode setting on Windows, macOS, and modern Linux desktops). If unavailable, light is the documented fallback.
- "Open file" replaces the current editor content directly, with no prompt for unsaved changes, because the foundation has no save layer — there is no concept of "unsaved disk-backed work" to protect. Users can only lose transient in-memory edits, which is consistent with Feature 002's stated assumption that the document is in-memory only.
- Save, "Save as", "Reload from disk", "Watch for external changes", "Recent files", "Recently opened folders", and "Restore session" are all explicitly out of scope and are candidates for follow-up features.
- Multi-file editing (tabs, side-by-side documents) is out of scope. Only one document is loaded at a time.
- Drag-and-drop file opening and "open with…" OS associations are candidates for follow-up features and are not required here.
- The file picker uses the operating system's native dialog provided by the desktop runtime; no custom file browser is built.
- Files are opened as plain text using the standard text encoding for the user's platform; files that cannot be read as plain text (binary content, unsupported encodings, etc.) surface the same "could not open" error path as other failures.
- View mode is a discrete three-state choice. A draggable split divider (continuously adjustable widths) is out of scope and is a candidate for a follow-up feature.
- Preferences are stored locally on the user's machine and never sent over the network, consistent with the project's local-first, privacy-by-default principle.
- The application chrome continues to follow the "islands" aesthetic established in Feature 002; this feature introduces controls but does not redesign the overall look.
- The starter content from Feature 002 is shown only until the user opens a file or otherwise replaces it; once a file is opened, the starter content is gone for that session.
- No keyboard shortcuts are required by this specification, although they are encouraged as a natural follow-up and are not prohibited.
- The "open file" control and "view mode" control may be combined into a single toolbar or split across multiple chrome locations; the spec does not prescribe the visual grouping, only that all three controls are discoverable from the primary chrome.
