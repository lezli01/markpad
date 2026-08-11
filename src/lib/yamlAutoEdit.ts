// Typing comforts for YAML documents. YAML's structure is its indentation and
// its `- ` markers, so — unlike the JSON comforts, which are mostly about
// quoting — these are about not retyping the shape of the line above:
//
//   • Enter continues a `- ` sequence item at the same indent
//   • Enter on an item that is still empty ends the list instead, stepping back
//     out to the indent the sequence hangs off
//   • Enter after a key with no value indents one level, ready for its block
//   • typing `:` after a bare key adds the space YAML requires — `key:value`
//     is a single scalar, and it is the classic YAML beginner's bug
//   • JSON pasted into an empty buffer lands as YAML
//
// Bracket and quote pairing is upstream closeBrackets(); indentation of a
// continuation line is @codemirror/lang-yaml's own indent service.
//
// The Enter and `:` decisions are pure functions of the caret's line, so the
// whole behaviour is unit testable. A line is a coarser context than a syntax
// tree, and deliberately so: it makes the rules ones a user can predict. The
// cost is that any line carrying a `#` is left alone rather than guessed at,
// and that prose inside a block literal (`text: |`) is treated as YAML if it
// happens to end in a colon.

import { Prec, type Extension, type Text } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentOnInput } from "@codemirror/language";
import {
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import { rewriteDocument } from "./dataActions";
import { jsonToYaml } from "./yamlActions";

/** One indentation level. YAML forbids tabs as indentation, so this is spaces
    by definition; two matches the Format action and lang-yaml's default unit. */
const INDENT_UNIT = "  ";

/** A `- ` item marker, or several of them for a nested sequence (`- - a`). */
const ITEM_MARKERS = /^(?:-[ \t]+)*/;

/** A key with nothing after its colon yet. One bare token: no quotes and no
    spaces, so prose that happens to end in a colon is not mistaken for a key. */
const EMPTY_KEY = /^[^#:'"\s]+:$/;

/** A bare token that a `:` would turn into a key. */
const BARE_KEY = /^[^#:'"\s]+$/;

export type YamlEnterPlan =
  /** Clear the empty item marker and leave the caret on that line, at the
      indent of whatever the sequence hangs off. */
  | { kind: "exitItem"; indent: string }
  /** Break the line and open the next one with `insert`, after dropping
      `trimTrailing` characters of trailing whitespace before the caret. */
  | { kind: "continue"; insert: string; trimTrailing: number };

/**
 * The indent a line "belongs to": the nearest line above it that starts further
 * left, i.e. the key or item the block hangs off. Used to leave the caret
 * somewhere valid when a sequence is abandoned — a mapping key cannot sit at the
 * indent of the sequence items it would follow.
 */
export function outerIndent(doc: Text, lineNumber: number, indent: string): string {
  for (let n = lineNumber - 1; n >= 1; n -= 1) {
    const text = doc.line(n).text;
    if (text.trim() === "") continue;
    const above = /^[ \t]*/.exec(text)![0];
    if (above.length < indent.length) return above;
  }
  return "";
}

/**
 * Decide what Enter should do at the end of `line`. Returns null to leave the
 * keystroke to CodeMirror's own newline-and-indent.
 */
export function planYamlEnter(line: string): YamlEnterPlan | null {
  // A comment anywhere on the line: its text is prose, not structure.
  if (line.includes("#")) return null;
  const indent = /^[ \t]*/.exec(line)![0];
  const body = line.slice(indent.length);
  const markers = ITEM_MARKERS.exec(body)![0];
  const rest = body.slice(markers.length).trimEnd();
  const trimTrailing = body.length - markers.length - rest.length;

  // `- ` with nothing after it: the user is done adding items. The indent is
  // filled in from the document by applyYamlEnter.
  if (markers !== "" && rest === "") {
    return { kind: "exitItem", indent };
  }
  if (EMPTY_KEY.test(rest)) {
    // The key's own column, not the line's indent — a key inside an item
    // (`- name:`) nests below the key, past the marker.
    const column = indent.length + markers.length;
    return {
      kind: "continue",
      insert: " ".repeat(column) + INDENT_UNIT,
      trimTrailing,
    };
  }
  if (markers !== "") {
    // Another item of the same sequence, aligned with this one.
    return { kind: "continue", insert: indent + markers, trimTrailing };
  }
  return null;
}

/** Whether typing `:` at the end of `line` should insert ": " — i.e. the line
    is a bare key waiting for its value. */
export function planYamlColon(line: string): boolean {
  if (line.includes("#")) return false;
  const body = line.slice(/^[ \t]*/.exec(line)![0].length);
  return BARE_KEY.test(body.slice(ITEM_MARKERS.exec(body)![0].length));
}

/** Whether the caret is a plain, empty selection sitting at `pos`. */
function isBareCaret(view: EditorView, pos: number): boolean {
  const { ranges, main } = view.state.selection;
  return ranges.length === 1 && main.empty && main.head === pos;
}

/** Enter, as a CodeMirror command: true when this module handled it. */
export function applyYamlEnter(view: EditorView): boolean {
  const { ranges, main } = view.state.selection;
  if (ranges.length !== 1 || !main.empty) return false;
  const line = view.state.doc.lineAt(main.head);
  // Mid-line, the default break is what the user means.
  if (main.head !== line.to) return false;
  const plan = planYamlEnter(line.text);
  if (!plan) return false;

  if (plan.kind === "exitItem") {
    // Reuse the abandoned line rather than leaving it blank above a new one,
    // and step out to the indent the sequence itself hangs off, so the next key
    // typed is a sibling of the sequence rather than an invalid one inside it.
    const indent = outerIndent(view.state.doc, line.number, plan.indent);
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: indent },
      selection: { anchor: line.from + indent.length },
      userEvent: "input",
      scrollIntoView: true,
    });
    return true;
  }
  const from = line.to - plan.trimTrailing;
  view.dispatch({
    changes: { from, to: line.to, insert: "\n" + plan.insert },
    selection: { anchor: from + 1 + plan.insert.length },
    userEvent: "input",
    scrollIntoView: true,
  });
  return true;
}

/** `:` typed at the end of a bare key: add the mandatory space with it. */
export function applyYamlColon(view: EditorView, from: number): boolean {
  const line = view.state.doc.lineAt(from);
  if (from !== line.to || !planYamlColon(line.text)) return false;
  view.dispatch({
    changes: { from, insert: ": " },
    selection: { anchor: from + 2 },
    userEvent: "input.type",
    scrollIntoView: true,
  });
  return true;
}

/** True when a paste over [from, to) is the whole content of the buffer. */
function isWholeBufferPaste(view: EditorView, from: number, to: number): boolean {
  if (from === 0 && to === view.state.doc.length) return true;
  return view.state.doc.toString().trim() === "";
}

/**
 * Land JSON pasted into an empty YAML buffer (or over a fully selected one) as
 * YAML. Returns false — leaving the paste to CodeMirror — for a paste into an
 * existing document, or for clipboard text that is not a JSON object or array.
 *
 * JSON *is* valid YAML, so pasting it verbatim would look like it worked and
 * leave a JSON-shaped file behind; this is the JSON document's
 * pretty-print-on-paste, pointed at the language of the buffer it lands in.
 */
export function pasteJsonAsYaml(
  view: EditorView,
  from: number,
  to: number,
  clipboard: string,
): boolean {
  if (clipboard.trim() === "") return false;
  if (!isWholeBufferPaste(view, from, to)) return false;
  const converted = jsonToYaml(clipboard);
  if (converted.kind !== "ok") return false;

  view.dispatch({
    changes: { from, to, insert: clipboard },
    selection: { anchor: from + clipboard.length },
    userEvent: "input.paste",
  });
  // A second transaction, isolated in the history by rewriteDocument: one undo
  // hands back the exact clipboard text, a second removes the paste.
  rewriteDocument(view, converted.text);
  return true;
}

function handlePaste(event: ClipboardEvent, view: EditorView): boolean {
  const { ranges, main } = view.state.selection;
  if (ranges.length !== 1) return false;
  const clipboard = event.clipboardData?.getData("text/plain") ?? "";
  if (!pasteJsonAsYaml(view, main.from, main.to, clipboard)) return false;
  event.preventDefault();
  return true;
}

/** The colon comfort and JSON-as-YAML paste. */
export function yamlAutoEdit(): Extension {
  return [
    EditorView.inputHandler.of((view, from, to, text) => {
      // One plain `:` at a bare caret. Compositions, typing over a selection
      // and multiple cursors are all left alone.
      if (view.composing || from !== to || text !== ":") return false;
      if (!isBareCaret(view, from)) return false;
      return applyYamlColon(view, from);
    }),
    EditorView.domEventHandlers({ paste: handlePaste }),
  ];
}

/**
 * Everything that makes typing YAML comfortable, for the YAML half of the
 * editor's language compartment. Enter and Backspace need Prec.high to win over
 * the base keymap outside the compartment; the rest is upstream behaviour that
 * only wants to be present while a YAML document is active.
 */
export function yamlTypingExtensions(): Extension {
  return [
    Prec.high(
      keymap.of([
        { key: "Enter", run: applyYamlEnter },
        // Backspace between an auto-inserted pair deletes both characters.
        ...closeBracketsKeymap,
      ]),
    ),
    yamlAutoEdit(),
    closeBrackets(),
    // `]` and `}` re-indent their line, off lang-yaml's language data.
    indentOnInput(),
  ];
}
