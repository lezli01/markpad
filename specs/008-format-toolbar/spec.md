# Feature Specification: Markdown Editing Toolbar

**Feature Branch**: `008-format-toolbar`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "Add an editing toolbar with the recommended markdown editing options such as bold, italic, lists etc... what should be fundamental to have."

## Overview

MILF can open, edit, save, and preview markdown, but every formatting mark
(`**`, `#`, `- `, `> `, fenced code, links, tables) has to be typed by hand.
This feature adds a compact formatting toolbar to the editor island that
applies the fundamental markdown constructs to the current selection with a
single click, plus keyboard shortcuts for the most common inline formats. The
toolbar reuses the existing "islands" design system and the existing CodeMirror
editor; it adds no runtime dependencies.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Apply inline and block formatting to a selection (Priority: P1)

A user is editing a markdown document. They select a phrase and click **Bold**;
the phrase is wrapped in `**…**` and stays selected so they can keep styling it.
They select three lines and click **Bullet list**; each line gains a `- ` prefix.
They put the cursor on a heading line and click **Heading 2**; the line becomes
`## …`. Clicking the same button again removes the formatting (a true toggle).
Everything happens in the editor they already have focus in — no dialogs, no
loss of cursor position — and the live preview updates as usual.

**Why this priority**: This is the headline of the feature — turning MILF from a
plain-text markdown box into an editor where the common constructs are one click
away. Without it the toolbar has no reason to exist.

**Independent Test**: Open a file. Select text and click each Text-style button;
confirm the marks wrap and toggle off on a second click. Select multiple lines
and click each list/heading/quote button; confirm the prefix is applied to every
line and toggles off. Confirm the preview reflects each change.

**Acceptance Scenarios**:

1. **Given** a non-empty selection, **When** the user clicks Bold (or Italic,
   Strikethrough, Inline code), **Then** the selection is wrapped in the
   corresponding markers AND the selected text remains selected between the
   markers.
2. **Given** a selection already wrapped in a marker, **When** the user clicks
   that marker's button again, **Then** the markers are removed (toggle off) and
   the text is left unwrapped.
3. **Given** the cursor is inside a word with no selection, **When** the user
   clicks an inline button, **Then** the surrounding word is wrapped.
4. **Given** a selection spanning several lines, **When** the user clicks a
   Heading, Bullet list, Numbered list, or Quote button, **Then** the
   corresponding line prefix is applied to every non-blank line in the
   selection; numbered lists are numbered `1.`, `2.`, … in order.
5. **Given** every targeted line already carries that line prefix, **When** the
   user clicks the button again, **Then** the prefix is removed from each line.
6. **Given** the cursor is anywhere, **When** the user clicks Link, Image, Code
   block, Table, or Horizontal rule, **Then** the corresponding markdown is
   inserted AND the caret/selection lands on the part the user will most likely
   edit next (e.g. the link URL, the first table header cell, the empty fenced
   line).
7. **Given** any toolbar action is applied, **When** it completes, **Then** it is
   a single undo step AND focus returns to the editor.

---

### User Story 2 - Keyboard shortcuts for common formats (Priority: P2)

A touch-typist never wants to leave the keyboard. They press Ctrl/⌘+B to bold the
selection, Ctrl/⌘+I for italic, Ctrl/⌘+K for a link, Ctrl/⌘+E for inline code,
and the list/quote/code-block chords for blocks. The shortcuts run the exact same
commands as the toolbar buttons.

**Why this priority**: Shortcuts are the natural complement to the buttons for
frequent users, but the buttons alone already deliver the core value, so this is
P2.

**Independent Test**: With the editor focused, press each bound shortcut and
confirm it performs the same edit as clicking the matching button. Confirm a
button whose tooltip shows no shortcut has none, and that advertised shortcuts
actually fire on this platform.

**Acceptance Scenarios**:

1. **Given** the editor has focus, **When** the user presses a bound shortcut
   (Bold `Mod-B`, Italic `Mod-I`, Inline code `Mod-E`, Link `Mod-K`,
   Strikethrough `Mod-Shift-X`, Bullet `Mod-Shift-8`, Numbered `Mod-Shift-7`,
   Quote `Mod-Shift-.`, Code block `Mod-Shift-C`), **Then** the matching command
   runs.
2. **Given** a button advertises a shortcut in its tooltip, **When** the user
   presses that shortcut, **Then** it actually fires on the running platform
   (no advertised-but-dead shortcuts).
3. **Given** the formatting shortcuts, **When** they are dispatched, **Then**
   they do not interfere with the existing app shortcuts (Save `Mod-S`, New
   `Mod-N`, Open `Mod-O`).

---

### User Story 3 - Toolbar reflects the formatting at the cursor (Priority: P3)

As the user moves the cursor through the document, the toggle buttons light up to
show what formatting is already active where they are — Bold appears pressed when
the cursor is inside bold text, Heading 2 appears pressed on an `##` line. This
gives a sense of "where am I" without reading the raw marks.

**Why this priority**: A polish/affordance layer on top of Stories 1–2; valuable
but not required for the core editing capability.

**Acceptance Scenarios**:

1. **Given** the cursor is inside text carrying a toggleable format, **When** the
   selection settles, **Then** that format's button shows a pressed/active state
   (`aria-pressed="true"`).
2. **Given** the cursor is on plain text, **When** the selection settles, **Then**
   no toggle button shows an active state.
3. **Given** insert actions (Link, Image, Code block, Table, Horizontal rule),
   **When** rendered, **Then** they never show an active state and expose no
   `aria-pressed`.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The toolbar MUST offer these 15 actions, grouped: **Text** (Bold,
  Italic, Strikethrough, Inline code), **Headings** (H1, H2, H3), **Lists**
  (Bullet list, Numbered list, Quote), **Insert** (Link, Image, Code block,
  Table, Horizontal rule).
- **FR-002**: Inline actions MUST toggle: wrap a selection (or the word under the
  cursor), and unwrap when already wrapped. With no selection and no word, they
  MUST insert the empty marker pair with the caret between the markers.
- **FR-003**: Line-prefix actions MUST apply to every non-blank line touched by
  the selection and MUST toggle off when all targeted lines already carry the
  prefix. Numbered lists MUST renumber from 1 within the selection.
- **FR-004**: Each action MUST be a single undo step and MUST preserve a sensible
  cursor/selection afterward.
- **FR-005**: Applying an action via a button MUST return focus to the editor and
  MUST NOT discard the selection on mouse-down.
- **FR-006**: Bound keyboard shortcuts MUST run the identical commands and MUST
  NOT conflict with existing app or default editor shortcuts. Only shortcuts that
  actually fire on the target platform MUST be advertised in tooltips.
- **FR-007**: Toggle buttons MUST reflect the active formatting at the main
  selection via `aria-pressed`; insert actions MUST NOT.
- **FR-008**: The toolbar MUST be present only when editing is possible — hidden
  in pure Preview mode and absent when no file is open.
- **FR-009**: Every emitted construct MUST render correctly in MILF's existing
  preview pipeline (markdown-it default preset + DOMPurify); actions that would
  render as literal/unstyled text MUST NOT ship.
- **FR-010**: The toolbar MUST reuse the existing design tokens and MUST be
  legible and correct in both light and dark themes; every button MUST have an
  accessible name; the container MUST use `role="toolbar"` with labelled groups.
- **FR-011**: The feature MUST NOT add a runtime dependency.

### Out of scope (deferred)

- **Task lists** (`- [ ]`): render as literal `[ ]` without a markdown-it plugin;
  deferred until preview rendering for checkboxes is added (would need a
  dependency, which requires its own justification).
- Heading keyboard shortcuts (`Ctrl+Alt+1..3`): not bound because CodeMirror's
  keymap disables the keyCode fallback for `Ctrl+Alt` chords on Windows (AltGr
  guard), so they would not fire on the primary platform.
- An overflow "more" menu, a file-picker-backed image insert, and roving-tabindex
  arrow-key toolbar navigation: deliberately omitted to keep the feature small.

## Success Criteria *(mandatory)*

- **SC-001**: A user can apply every one of the 15 constructs without typing a
  markdown mark by hand.
- **SC-002**: Each toolbar action and each bound shortcut produces exactly one
  undo step and leaves focus in the editor.
- **SC-003**: `tsc`, `vite build`, and `eslint` all pass with the feature in
  place, with no new runtime dependency in `package.json`.
- **SC-004**: Every construct the toolbar emits renders to a styled element in
  the live preview.
