// Markdown formatting command engine for the editing toolbar.
//
// Every action is a `MarkdownCommand` — structurally identical to CodeMirror's
// `Command` — so the SAME function reference is bound both to the editor keymap
// (Editor.tsx) and to the toolbar buttons (FormatToolbar.tsx): one source of
// truth, one undo step per action, multi-cursor correct.
//
// This module is view-pure: it imports only @codemirror/state + @codemirror/view
// and nothing from src/components, so it stays a leaf module (no import cycles)
// and is unit-testable headlessly via EditorState/EditorView.

import { EditorView, type KeyBinding } from "@codemirror/view";
import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type SelectionRange,
} from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";

export type FormatAction =
  | "bold"
  | "italic"
  | "strikethrough"
  | "inlineCode"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "blockquote"
  | "link"
  | "image"
  | "codeBlock"
  | "table"
  | "horizontalRule";

export type FormatGroup = "text" | "headings" | "lists" | "insert";

/** Returns true when it changed the doc/selection (handled), false on no-op. */
export type MarkdownCommand = (view: EditorView) => boolean;

export type FormatActionDef = {
  id: FormatAction;
  label: string;
  group: FormatGroup;
  /** CM6 keybinding string (e.g. "Mod-b"); omitted when there is no shortcut. */
  shortcut?: string;
  /** Whether the action is an on/off toggle (drives the aria-pressed wiring). */
  toggle: boolean;
  run: MarkdownCommand;
  /** Pure detection mirroring `run`; only present for toggle actions. */
  isActive?: (state: EditorState) => boolean;
};

// ---------------------------------------------------------------------------
// Syntax-tree detection (inline emphasis)
//
// Inline toggle detection reads the parsed Markdown (Lezer) tree instead of
// scanning raw markers, so it is correct for multi-word spans (a caret anywhere
// inside **hello world** lights Bold) and nested emphasis (a caret in the
// italic word of **a *b* c** lights BOTH Bold and Italic). It requires the
// editor to parse with the GFM `markdownLanguage` base so that ~~strike~~
// becomes a real `Strikethrough` node (see Editor.tsx). The block toggles
// (headings/lists/blockquote) deliberately stay line-based — see `lineActive`.
// ---------------------------------------------------------------------------

/** Lezer node name(s) for each inline emphasis marker. */
const INLINE_NODE: Record<string, ReadonlySet<string>> = {
  "**": new Set(["StrongEmphasis"]),
  "*": new Set(["Emphasis"]),
  "~~": new Set(["Strikethrough"]),
};
const INLINE_CODE_NODE: ReadonlySet<string> = new Set(["InlineCode"]);

/**
 * Innermost ancestor of the range `[from, to]` whose node name is in `names`,
 * or null. For a collapsed cursor both sides of the position are probed so a
 * caret touching either edge of a span still resolves into it; the match must
 * still fully contain the range.
 */
function enclosingNode(
  state: EditorState,
  names: ReadonlySet<string>,
  from: number,
  to: number,
): SyntaxNode | null {
  const tree = syntaxTree(state);
  const sides: (-1 | 1)[] = from === to ? [-1, 1] : [1];
  for (const side of sides) {
    for (
      let n: SyntaxNode | null = tree.resolveInner(from, side);
      n;
      n = n.parent
    ) {
      if (names.has(n.name) && n.from <= from && n.to >= to) return n;
    }
  }
  return null;
}

/**
 * The inline span (of one of `names`) that a collapsed caret sits *inside the
 * content of*, or that a non-empty selection lies within — else null. The span
 * must be well-formed: distinct opening/closing `*Mark` children, so callers
 * can safely unwrap it. A caret exactly outside the markers is NOT inside.
 */
function enclosingInlineSpan(
  state: EditorState,
  names: ReadonlySet<string>,
  from: number,
  to: number,
): SyntaxNode | null {
  const node = enclosingNode(state, names, from, to);
  if (!node) return null;
  const open = node.firstChild;
  const close = node.lastChild;
  if (
    !open ||
    !close ||
    open === close ||
    !open.name.endsWith("Mark") ||
    !close.name.endsWith("Mark")
  ) {
    return null;
  }
  if (from !== to) return node;
  // Collapsed caret: require it to sit within the content between the markers.
  return open.to <= from && from <= close.from ? node : null;
}

/** Changes stripping an inline span's opening/closing markers, keeping the
 * caret/selection over the now-unwrapped content. */
function unwrapInlineChanges(
  state: EditorState,
  node: SyntaxNode,
  range: SelectionRange,
  extra: readonly ChangeSpec[] = [],
) {
  const open = node.firstChild!;
  const close = node.lastChild!;
  const changes = state.changes([
    { from: open.from, to: open.to },
    { from: close.from, to: close.to },
    ...extra,
  ]);
  return {
    changes,
    range: range.empty
      ? EditorSelection.cursor(changes.mapPos(range.from, -1))
      : EditorSelection.range(
          changes.mapPos(range.from, 1),
          changes.mapPos(range.to, -1),
        ),
  };
}

// ---------------------------------------------------------------------------
// Inline wrap toggles: **bold**, *italic*, ~~strike~~, `code`
// ---------------------------------------------------------------------------

/**
 * Whether `marker` ends exactly at `pos` (occupying [pos - len, pos)). For the
 * single "*" (italic) we must not mistake the inner "*" of a "**" (bold) pair
 * for an italic marker, so we additionally require the next char further out is
 * not another "*".
 */
function markerEndsAt(
  state: EditorState,
  marker: string,
  len: number,
  pos: number,
): boolean {
  if (pos - len < 0 || state.sliceDoc(pos - len, pos) !== marker) return false;
  if (marker === "*" && state.sliceDoc(pos - len - 1, pos - len) === "*") {
    return false;
  }
  return true;
}

/** Whether `marker` starts exactly at `pos` (occupying [pos, pos + len)). */
function markerStartsAt(
  state: EditorState,
  marker: string,
  len: number,
  pos: number,
): boolean {
  if (state.sliceDoc(pos, pos + len) !== marker) return false;
  if (marker === "*" && state.sliceDoc(pos + len, pos + len + 1) === "*") {
    return false;
  }
  return true;
}

/**
 * Toggle `marker` around [from, to). Detection precedence is
 * inside-markers → outside-markers → wrap, so a selection of `**x**` unwraps
 * to `x` instead of becoming `***x***`. On wrap, the returned range still
 * covers the original text (now sitting between the markers).
 */
function toggleWrapAround(
  state: EditorState,
  marker: string,
  len: number,
  from: number,
  to: number,
): { changes: ChangeSpec; range: ReturnType<typeof EditorSelection.range> } {
  const sel = state.sliceDoc(from, to);
  // (1) markers inside the selection — strictly longer than the two markers, so
  // a selection of just the marker pair is never unwrapped to nothing.
  if (sel.length > 2 * len && sel.startsWith(marker) && sel.endsWith(marker)) {
    return {
      changes: { from, to, insert: sel.slice(len, sel.length - len) },
      range: EditorSelection.range(from, to - 2 * len),
    };
  }
  // (2) markers immediately outside the selection
  if (
    markerEndsAt(state, marker, len, from) &&
    markerStartsAt(state, marker, len, to)
  ) {
    return {
      changes: [
        { from: from - len, to: from },
        { from: to, to: to + len },
      ],
      range: EditorSelection.range(from - len, to - len),
    };
  }
  // (3) wrap
  return {
    changes: [
      { from, insert: marker },
      { from: to, insert: marker },
    ],
    range: EditorSelection.range(from + len, to + len),
  };
}

/**
 * Transaction toggling `marker` around each selection range. Exported for
 * headless unit tests (apply with `state.update(...)`); `wrapInline` wires it
 * to a view. When a range already sits inside a parsed span of this marker's
 * type, the whole span is unwrapped — so clicking Bold with the caret anywhere
 * inside **hello world** turns the bold off, matching what the toggle shows.
 */
export function inlineToggleTransaction(state: EditorState, marker: string) {
  const len = marker.length;
  const names = INLINE_NODE[marker];
  return state.changeByRange((range) => {
    const span = names
      ? enclosingInlineSpan(state, names, range.from, range.to)
      : null;
    if (span) return unwrapInlineChanges(state, span, range);

    if (!range.empty) {
      return toggleWrapAround(state, marker, len, range.from, range.to);
    }
    const pos = range.from;
    // Cursor sitting between a bare (unparsed) pair → toggle off. Covers empty
    // markers `**|**` that have no content and so are not a Strong/Em node.
    if (
      markerEndsAt(state, marker, len, pos) &&
      markerStartsAt(state, marker, len, pos)
    ) {
      return {
        changes: [
          { from: pos - len, to: pos },
          { from: pos, to: pos + len },
        ],
        range: EditorSelection.cursor(pos - len),
      };
    }
    // Wrap the word under the cursor when there is one, selecting it so a
    // follow-up keystroke replaces it.
    const word = state.wordAt(pos);
    if (word) {
      return toggleWrapAround(state, marker, len, word.from, word.to);
    }
    // Otherwise drop empty markers and place the caret between them.
    return {
      changes: { from: pos, insert: marker + marker },
      range: EditorSelection.cursor(pos + len),
    };
  });
}

function wrapInline(marker: string): MarkdownCommand {
  return (view) => {
    view.dispatch({
      ...inlineToggleTransaction(view.state, marker),
      scrollIntoView: true,
    });
    return true;
  };
}

function inlineActive(marker: string): (state: EditorState) => boolean {
  const names = INLINE_NODE[marker];
  return (state) => {
    if (!names) return false;
    const { from, to } = state.selection.main;
    return enclosingInlineSpan(state, names, from, to) !== null;
  };
}

// ---------------------------------------------------------------------------
// Inline code: a single backtick can't fence content that itself contains a
// backtick (CommonMark would split the span), so the fence grows to one more
// than the longest interior backtick run, with a padding space when the content
// starts or ends with a backtick. Kept separate from the generic wrap above.
// ---------------------------------------------------------------------------

function longestBacktickRun(text: string): number {
  return (text.match(/`+/g) ?? []).reduce((m, r) => Math.max(m, r.length), 0);
}

/**
 * Transaction toggling an inline-code span for each range. Exported for
 * headless unit tests; `inlineCodeCommand` wires it to a view. A caret inside a
 * parsed `InlineCode` node unwraps the whole span (dropping the fences and one
 * padding space per side, mirroring how it was wrapped).
 */
export function inlineCodeToggleTransaction(state: EditorState) {
  return state.changeByRange((range) => {
    const span = enclosingInlineSpan(
      state,
      INLINE_CODE_NODE,
      range.from,
      range.to,
    );
    if (span) {
      const open = span.firstChild!;
      const close = span.lastChild!;
      const inner = state.sliceDoc(open.to, close.from);
      const extra: ChangeSpec[] = [];
      if (
        inner.length >= 2 &&
        inner.startsWith(" ") &&
        inner.endsWith(" ") &&
        inner.trim().length > 0
      ) {
        extra.push({ from: open.to, to: open.to + 1 });
        extra.push({ from: close.from - 1, to: close.from });
      }
      return unwrapInlineChanges(state, span, range, extra);
    }

    let from = range.from;
    let to = range.to;
    if (range.empty) {
      const word = state.wordAt(from);
      if (!word) {
        // Nothing to wrap → empty fence with the caret between the backticks.
        return {
          changes: { from, insert: "``" },
          range: EditorSelection.cursor(from + 1),
        };
      }
      from = word.from;
      to = word.to;
    }
    const sel = state.sliceDoc(from, to);
    // Unwrap a bare (unparsed) span: equal-length backtick runs on both ends.
    const openLen = /^`+/.exec(sel)?.[0].length ?? 0;
    const closeLen = /`+$/.exec(sel)?.[0].length ?? 0;
    if (openLen > 0 && openLen === closeLen && sel.length >= 2 * openLen) {
      let text = sel.slice(openLen, sel.length - openLen);
      if (
        text.length >= 2 &&
        text.startsWith(" ") &&
        text.endsWith(" ") &&
        text.trim().length > 0
      ) {
        text = text.slice(1, text.length - 1);
      }
      return {
        changes: { from, to, insert: text },
        range: EditorSelection.range(from, from + text.length),
      };
    }
    // Wrap with a fence long enough to survive interior backticks.
    const fence = "`".repeat(longestBacktickRun(sel) + 1);
    const pad = /^`|`$/.test(sel) && sel.trim().length > 0 ? " " : "";
    const insert = fence + pad + sel + pad + fence;
    const lead = fence.length + pad.length;
    return {
      changes: { from, to, insert },
      range: EditorSelection.range(from + lead, from + lead + sel.length),
    };
  });
}

const inlineCodeCommand: MarkdownCommand = (view) => {
  view.dispatch({
    ...inlineCodeToggleTransaction(view.state),
    scrollIntoView: true,
  });
  return true;
};

function inlineCodeActive(state: EditorState): boolean {
  const { from, to } = state.selection.main;
  return enclosingInlineSpan(state, INLINE_CODE_NODE, from, to) !== null;
}

// ---------------------------------------------------------------------------
// Line-prefix toggles: headings, bullet/ordered lists, blockquote
// ---------------------------------------------------------------------------

type LineRule = {
  /** Length of this rule's prefix on `text`, or -1 if the line lacks it. */
  match: (text: string) => number;
  /** Length of any conflicting prefix to strip before adding this one. */
  strip: (text: string) => number;
  /** Prefix to insert; `index` is the 1-based position among touched lines. */
  prefix: (index: number) => string;
};

function makeLinePrefix(rule: LineRule): MarkdownCommand {
  return (view) => {
    const { state } = view;
    const tr = state.changeByRange((range) => {
      const startLine = state.doc.lineAt(range.from);
      let endLineNo = state.doc.lineAt(range.to).number;
      // A selection that ends exactly at a line start should not touch that line.
      if (!range.empty) {
        const endLine = state.doc.lineAt(range.to);
        if (endLine.from === range.to && endLine.number > startLine.number) {
          endLineNo = endLine.number - 1;
        }
      }

      const lines = [];
      for (let n = startLine.number; n <= endLineNo; n++) {
        lines.push(state.doc.line(n));
      }
      const skipBlank = lines.length > 1;
      const nonBlank = lines.filter((l) => l.text.trim().length > 0);
      const allOn =
        nonBlank.length > 0 && nonBlank.every((l) => rule.match(l.text) >= 0);

      const specs: ChangeSpec[] = [];
      if (allOn) {
        // Every relevant line already has the prefix → remove it everywhere.
        for (const l of nonBlank) {
          const m = rule.match(l.text);
          if (m > 0) specs.push({ from: l.from, to: l.from + m });
        }
      } else {
        // Add (replacing any conflicting prefix); numbered lists renumber 1..N.
        let index = 1;
        for (const l of lines) {
          if (skipBlank && l.text.trim().length === 0) continue;
          const stripLen = rule.strip(l.text);
          specs.push({
            from: l.from,
            to: l.from + stripLen,
            insert: rule.prefix(index++),
          });
        }
      }

      const changes = state.changes(specs);
      // An empty caret at a line start maps BEFORE an inserted prefix (assoc
      // defaults to -1); use +1 so the caret lands after the new prefix.
      return {
        changes,
        range: range.empty
          ? EditorSelection.cursor(changes.mapPos(range.from, 1))
          : range.map(changes),
      };
    });
    view.dispatch({ ...tr, scrollIntoView: true });
    return true;
  };
}

/**
 * Line-prefix detector for the block toggles (headings, lists, blockquote).
 *
 * These stay line-anchored — matching the caret's own line against the same
 * raw prefix `makeLinePrefix` strips — rather than reading the syntax tree, so
 * DETECTION and MUTATION always agree: a toggle lights exactly when clicking it
 * can turn the block off. A tree-based detector would light on lines the
 * line-prefix mutation cannot strip (setext headings, an ATX heading nested in
 * a blockquote, or a soft-wrapped list/quote continuation line), so clicking
 * would insert a stray marker and corrupt the document instead of toggling.
 * (Inline emphasis is different: there both detection AND the run were moved to
 * the tree together, so they remain consistent.)
 */
function lineActive(rule: LineRule): (state: EditorState) => boolean {
  return (state) => {
    const line = state.doc.lineAt(state.selection.main.head);
    return rule.match(line.text) >= 0;
  };
}

const ANY_HEADING = /^#{1,6} +/;

function headingRule(level: number): LineRule {
  const exact = new RegExp(`^#{${level}} `);
  const prefix = "#".repeat(level) + " ";
  return {
    match: (t) => {
      const m = exact.exec(t);
      return m ? m[0].length : -1;
    },
    strip: (t) => {
      const m = ANY_HEADING.exec(t);
      return m ? m[0].length : 0;
    },
    prefix: () => prefix,
  };
}

const bulletRule: LineRule = {
  match: (t) => (/^[-*+] /.test(t) ? 2 : -1),
  strip: (t) => (/^[-*+] /.test(t) ? 2 : 0),
  prefix: () => "- ",
};

const orderedRule: LineRule = {
  match: (t) => {
    const m = /^\d+\. /.exec(t);
    return m ? m[0].length : -1;
  },
  strip: (t) => {
    const m = /^\d+\. /.exec(t);
    return m ? m[0].length : 0;
  },
  prefix: (i) => `${i}. `,
};

const quoteRule: LineRule = {
  match: (t) => (/^> /.test(t) ? 2 : -1),
  strip: (t) => (/^> /.test(t) ? 2 : 0),
  prefix: () => "> ",
};

// ---------------------------------------------------------------------------
// Insert / block actions: link, image, code block, table, horizontal rule
// ---------------------------------------------------------------------------

function atLineStart(state: EditorState, pos: number): boolean {
  return state.doc.lineAt(pos).from === pos;
}

const insertLink: MarkdownCommand = (view) => {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const sel = state.sliceDoc(range.from, range.to);
    const label = sel || "text";
    const insert = `[${label}](url)`;
    if (sel) {
      // Select the "url" placeholder so the user types the destination.
      const urlStart = range.from + 1 + label.length + 2; // "[" + label + "]("
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(urlStart, urlStart + 3),
      };
    }
    // Nothing selected → select the "text" placeholder instead.
    return {
      changes: { from: range.from, insert },
      range: EditorSelection.range(range.from + 1, range.from + 1 + 4),
    };
  });
  view.dispatch({ ...tr, scrollIntoView: true });
  return true;
};

const insertImage: MarkdownCommand = (view) => {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const sel = state.sliceDoc(range.from, range.to);
    const label = sel || "alt";
    const insert = `![${label}](url)`;
    if (sel) {
      const urlStart = range.from + 2 + label.length + 2; // "![" + label + "]("
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(urlStart, urlStart + 3),
      };
    }
    return {
      changes: { from: range.from, insert },
      range: EditorSelection.range(range.from + 2, range.from + 2 + 3),
    };
  });
  view.dispatch({ ...tr, scrollIntoView: true });
  return true;
};

const insertCodeBlock: MarkdownCommand = (view) => {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const sel = state.sliceDoc(range.from, range.to);
    const pre = atLineStart(state, range.from) ? "" : "\n";
    const after =
      range.to < state.doc.length ? state.sliceDoc(range.to, range.to + 1) : "";
    const suf = after && after !== "\n" ? "\n" : "";
    const insert = pre + "```\n" + sel + "\n```" + suf;
    // Caret on the empty fenced line (or just past the inserted content).
    const caret = sel
      ? range.from + pre.length + 4 + sel.length
      : range.from + pre.length + 4; // past "```\n"
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(caret),
    };
  });
  view.dispatch({ ...tr, scrollIntoView: true });
  return true;
};

const insertTable: MarkdownCommand = (view) => {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const pre = atLineStart(state, range.from) ? "" : "\n";
    const insert =
      pre +
      "| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\n";
    const start = range.from + pre.length + 2; // past "| "
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(start, start + "Header 1".length),
    };
  });
  view.dispatch({ ...tr, scrollIntoView: true });
  return true;
};

const insertHorizontalRule: MarkdownCommand = (view) => {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const pre = atLineStart(state, range.from) ? "" : "\n";
    // Use "***" not "---": a "---" line directly under text renders as a Setext
    // H2 underline rather than a horizontal rule. "***" is always an <hr>.
    const insert = pre + "***\n";
    const caret = range.from + pre.length + 4; // past "***\n"
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(caret),
    };
  });
  view.dispatch({ ...tr, scrollIntoView: true });
  return true;
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const FORMAT_ACTIONS: readonly FormatActionDef[] = [
  {
    id: "bold",
    label: "Bold",
    group: "text",
    shortcut: "Mod-b",
    toggle: true,
    run: wrapInline("**"),
    isActive: inlineActive("**"),
  },
  {
    id: "italic",
    label: "Italic",
    group: "text",
    shortcut: "Mod-i",
    toggle: true,
    run: wrapInline("*"),
    isActive: inlineActive("*"),
  },
  {
    id: "strikethrough",
    label: "Strikethrough",
    group: "text",
    shortcut: "Mod-Shift-x",
    toggle: true,
    run: wrapInline("~~"),
    isActive: inlineActive("~~"),
  },
  {
    id: "inlineCode",
    label: "Inline code",
    group: "text",
    shortcut: "Mod-e",
    toggle: true,
    run: inlineCodeCommand,
    isActive: inlineCodeActive,
  },
  {
    id: "heading1",
    label: "Heading 1",
    group: "headings",
    toggle: true,
    run: makeLinePrefix(headingRule(1)),
    isActive: lineActive(headingRule(1)),
  },
  {
    id: "heading2",
    label: "Heading 2",
    group: "headings",
    toggle: true,
    run: makeLinePrefix(headingRule(2)),
    isActive: lineActive(headingRule(2)),
  },
  {
    id: "heading3",
    label: "Heading 3",
    group: "headings",
    toggle: true,
    run: makeLinePrefix(headingRule(3)),
    isActive: lineActive(headingRule(3)),
  },
  {
    id: "bulletList",
    label: "Bullet list",
    group: "lists",
    shortcut: "Mod-Shift-8",
    toggle: true,
    run: makeLinePrefix(bulletRule),
    isActive: lineActive(bulletRule),
  },
  {
    id: "orderedList",
    label: "Numbered list",
    group: "lists",
    shortcut: "Mod-Shift-7",
    toggle: true,
    run: makeLinePrefix(orderedRule),
    isActive: lineActive(orderedRule),
  },
  {
    id: "blockquote",
    label: "Quote",
    group: "lists",
    shortcut: "Mod-Shift-.",
    toggle: true,
    run: makeLinePrefix(quoteRule),
    isActive: lineActive(quoteRule),
  },
  {
    id: "link",
    label: "Link",
    group: "insert",
    shortcut: "Mod-k",
    toggle: false,
    run: insertLink,
  },
  {
    id: "image",
    label: "Image",
    group: "insert",
    toggle: false,
    run: insertImage,
  },
  {
    id: "codeBlock",
    label: "Code block",
    group: "insert",
    shortcut: "Mod-Shift-c",
    toggle: false,
    run: insertCodeBlock,
  },
  {
    id: "table",
    label: "Table",
    group: "insert",
    toggle: false,
    run: insertTable,
  },
  {
    id: "horizontalRule",
    label: "Horizontal rule",
    group: "insert",
    toggle: false,
    run: insertHorizontalRule,
  },
];

const BY_ID = new Map<FormatAction, FormatActionDef>(
  FORMAT_ACTIONS.map((a) => [a.id, a]),
);

/** Run a formatting action by id against the given view. */
export function runFormatAction(id: FormatAction, view: EditorView): boolean {
  return BY_ID.get(id)?.run(view) ?? false;
}

/** Ids of toggle actions currently active at the main selection. */
export function getActiveFormatActions(state: EditorState): FormatAction[] {
  const active: FormatAction[] = [];
  for (const a of FORMAT_ACTIONS) {
    if (a.isActive?.(state)) active.push(a.id);
  }
  return active;
}

/** CodeMirror keymap binding the actions that declare a shortcut. */
export const markdownFormattingKeymap: readonly KeyBinding[] = FORMAT_ACTIONS
  .filter((a) => a.shortcut)
  .map((a) => ({ key: a.shortcut!, run: a.run, preventDefault: true }));
