// Typing comforts for JSON documents. Bracket and quote *pairing* is upstream
// closeBrackets(); this module covers what that does not:
//
//   • a key or string value gets its quotes as the first character is typed
//   • the separating comma appears with the first character of the next member,
//     never on Enter — so a half-finished document is still valid JSON
//   • `:` at the end of a key steps out of the quotes and adds ": "
//   • a paste that fills the whole buffer is pretty-printed
//
// The decision is a pure function of (document, caret, typed character) so the
// whole behaviour is unit testable; applyJsonAutoEdit is the CodeMirror adapter
// that turns a plan into transactions, and jsonAutoEdit() is the extension.
//
// Context comes from scanning the document, not from the syntax tree: a JSON
// document is invalid for most of the time it is being typed ("{ n" has no
// PropertyName node to resolve), while a scan answers the four questions a plan
// needs — which slot the caret is in, whether the member before it is finished,
// whether the caret is inside a string, and whether it continues a bare word.

import {
  Prec,
  type ChangeSpec,
  type Extension,
  type Text,
} from "@codemirror/state";
import { isolateHistory } from "@codemirror/commands";
import { EditorView, keymap } from "@codemirror/view";
import { indentOnInput } from "@codemirror/language";
import {
  closeBrackets,
  closeBracketsKeymap,
  insertBracket,
} from "@codemirror/autocomplete";
import { applyJsonTextAction, runJsonAction } from "./jsonActions";

/** Where the caret sits inside the innermost container.
    - `key`      a property name is expected (`{` or `,` behind the caret)
    - `afterKey` a property name is finished but has no `:` yet
    - `value`    a property value is expected (`:` behind the caret)
    - `item`     an array element position
    - `top`      outside any container, or the text before the caret is broken */
export type JsonSlot = "key" | "afterKey" | "value" | "item" | "top";

export type JsonContext = {
  slot: JsonSlot;
  /** Offset where a separator comma belongs, or null when none is needed. */
  separatorAt: number | null;
  /** The string literal the caret is inside, and the slot that string fills. */
  string: { from: number; slot: JsonSlot } | null;
  /** Start of the bare word the caret continues, or null. */
  tokenStart: number | null;
};

export type AutoEditPlan = {
  /** Offset for the separator comma to insert first, or null for none. */
  comma: number | null;
  /** What to do with the typed character. */
  step:
    | { kind: "default" } // hand it to closeBrackets / plain insertion
    | { kind: "quote"; tokenStart: number } // insert it, then wrap the word
    | { kind: "colon"; at: number } // insert ": " at `at`
    | { kind: "moveTo"; pos: number }; // step over what is already there
};

type Frame = { object: boolean; afterColon: boolean };

const WORD = /[A-Za-z_$]/;
const DIGIT = /[0-9]/;
// Characters that can begin a JSON value or key. A separator comma is only ever
// inserted in front of one of these — never before `}`, `]` or `,`, which is
// why a trailing comma cannot be produced.
const VALUE_START = /[-0-9"{[A-Za-z_$]/;
const LITERALS = ["true", "false", "null"];

// How far ahead to look for an existing colon after a key. Generous: legal JSON
// may put the colon on the next line.
const LOOKAHEAD = 200;

/** Whether `word` could still grow into true/false/null. */
function isLiteralPrefix(word: string): boolean {
  return LITERALS.some((literal) => literal.startsWith(word));
}

/** The text before the caret does not parse far enough to reason about. */
const BROKEN: JsonContext = {
  slot: "top",
  separatorAt: null,
  string: null,
  tokenStart: null,
};

function slotAt(
  frames: Frame[],
  prev: { char: string } | null,
  continuingWord: boolean,
): JsonSlot {
  const frame = frames[frames.length - 1];
  if (!frame) return "top";
  if (!frame.object) return "item";
  const char = prev?.char ?? null;
  // `{`/`[`/`,`/`:` mean the slot after them is still empty.
  const slotEmpty =
    char === null ||
    char === "{" ||
    char === "[" ||
    char === "," ||
    char === ":";
  if (!frame.afterColon) return slotEmpty ? "key" : "afterKey";
  if (slotEmpty) return "value";
  // A finished value: unless the caret is still inside that value's word, the
  // next thing typed belongs to the following member's key.
  return continuingWord ? "value" : "key";
}

function separatorNeeded(
  frames: Frame[],
  prev: { char: string } | null,
  continuingWord: boolean,
): boolean {
  const frame = frames[frames.length - 1];
  if (!frame || !prev || continuingWord) return false;
  const char = prev.char;
  if (char === "{" || char === "[" || char === "," || char === ":") return false;
  // In an object, a member without its colon yet is a key, not a finished
  // member — a comma there would be wrong.
  return frame.object ? frame.afterColon : true;
}

/** Read the caret's surroundings out of the text before it. */
export function analyzeJsonContext(doc: Text, pos: number): JsonContext {
  const frames: Frame[] = [];
  let prev: { char: string; to: number } | null = null;
  let tokenStart: number | null = null;
  let str: { from: number; slot: JsonSlot } | null = null;

  const lastLine = doc.lineAt(pos).number;
  for (let n = 1; n <= lastLine; n++) {
    const line = doc.line(n);
    const limit = n === lastLine ? pos - line.from : line.text.length;
    let i = 0;
    while (i < limit) {
      const char = line.text[i];
      const at = line.from + i;
      if (str) {
        if (char === "\\") {
          i += 2;
          continue;
        }
        i += 1;
        if (char === '"') {
          str = null;
          prev = { char: '"', to: at + 1 };
        }
        continue;
      }
      i += 1;
      if (char === " " || char === "\t" || char === "\r") {
        tokenStart = null;
        continue;
      }
      if (char === '"') {
        str = { from: at, slot: slotAt(frames, prev, false) };
        tokenStart = null;
        continue;
      }
      if (char === "{" || char === "[") {
        frames.push({ object: char === "{", afterColon: false });
        tokenStart = null;
      } else if (char === "}" || char === "]") {
        frames.pop();
        tokenStart = null;
      } else if (char === ",") {
        if (frames.length > 0) frames[frames.length - 1].afterColon = false;
        tokenStart = null;
      } else if (char === ":") {
        if (frames.length > 0) frames[frames.length - 1].afterColon = true;
        tokenStart = null;
      } else if (tokenStart === null) {
        // First character of a bare word: a number, or true/false/null.
        tokenStart = at;
      }
      prev = { char, to: at + 1 };
    }
    if (n < lastLine) {
      // A JSON string cannot span lines, so one left open means the text before
      // the caret is broken — decline rather than guess at its structure.
      if (str) return BROKEN;
      tokenStart = null;
    } else if (str) {
      // Still open where the scan stopped: the caret is inside this string.
      return { slot: str.slot, separatorAt: null, string: str, tokenStart: null };
    }
  }

  const continuingWord = tokenStart !== null;
  return {
    slot: slotAt(frames, prev, continuingWord),
    separatorAt: separatorNeeded(frames, prev, continuingWord)
      ? prev!.to
      : null,
    string: null,
    tokenStart,
  };
}

/** Whether the character at `pos` is escaped by an odd run of backslashes. */
function isEscaped(doc: Text, pos: number): boolean {
  const line = doc.lineAt(pos);
  let count = 0;
  for (let i = pos - line.from - 1; i >= 0 && line.text[i] === "\\"; i -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}

function nextSignificant(
  doc: Text,
  from: number,
): { char: string; at: number } | null {
  const text = doc.sliceString(from, Math.min(doc.length, from + LOOKAHEAD));
  for (let i = 0; i < text.length; i += 1) {
    if (!/\s/.test(text[i])) return { char: text[i], at: from + i };
  }
  return null;
}

/** Typing `:` where a key has just ended: add ": ", or step over the colon that
    is already there rather than typing a second one. */
function planColon(doc: Text, at: number): AutoEditPlan {
  const next = nextSignificant(doc, at);
  if (next?.char === ":") {
    const after = next.at + 1;
    const space = doc.sliceString(after, after + 1) === " " ? 1 : 0;
    return { comma: null, step: { kind: "moveTo", pos: after + space } };
  }
  return { comma: null, step: { kind: "colon", at } };
}

function planInString(
  doc: Text,
  pos: number,
  input: string,
  string: { slot: JsonSlot },
): AutoEditPlan | null {
  if (input !== ":" && input !== '"') return null;
  // Only right before the literal's closing quote, and never just after a
  // backslash — there the user is deliberately typing an escape.
  if (doc.sliceString(pos, pos + 1) !== '"' || isEscaped(doc, pos)) return null;
  if (input === '"') {
    // Step over the closing quote. Quotes this module inserts carry no
    // closeBrackets marker, so upstream would open a second pair here.
    return { comma: null, step: { kind: "moveTo", pos: pos + 1 } };
  }
  // A colon inside a *value* is ordinary text (URLs, timestamps).
  if (string.slot !== "key") return null;
  return planColon(doc, pos + 1);
}

/**
 * Decide what a single typed character should do. Returns null to leave the
 * keystroke to closeBrackets and CodeMirror's own insertion.
 */
export function planJsonAutoEdit(
  doc: Text,
  pos: number,
  input: string,
): AutoEditPlan | null {
  if (input.length !== 1) return null;
  const ctx = analyzeJsonContext(doc, pos);

  if (ctx.string) return planInString(doc, pos, input, ctx.string);

  if (ctx.tokenStart !== null) {
    // Mid-word, so the only comfort left is rescuing a value that was left
    // bare to protect true/false/null and has now stopped looking like one.
    if (!WORD.test(input) && !DIGIT.test(input)) return null;
    const word = doc.sliceString(ctx.tokenStart, pos);
    if (!/^[a-z]+$/.test(word)) return null; // numbers stay numbers
    if (!isLiteralPrefix(word)) return null; // never was a declined literal
    if (isLiteralPrefix(word + input)) return null; // could still become one
    return { comma: null, step: { kind: "quote", tokenStart: ctx.tokenStart } };
  }

  if (ctx.slot === "afterKey") {
    return input === ":" ? planColon(doc, pos) : null;
  }
  if (ctx.slot === "top") return null;

  const comma = ctx.separatorAt;
  const quote =
    ctx.slot === "key"
      ? // Every key is a string, so any word character can be quoted at once.
        WORD.test(input) || DIGIT.test(input)
      : // In a value, digits are numbers and t/f/n may be starting a literal.
        WORD.test(input) && !isLiteralPrefix(input);
  if (quote) return { comma, step: { kind: "quote", tokenStart: pos } };
  if (comma !== null && VALUE_START.test(input)) {
    return { comma, step: { kind: "default" } };
  }
  return null;
}

/**
 * Apply a plan for `input` typed at `from`. Returns false when there is nothing
 * to do, leaving the keystroke to the handlers behind this one.
 *
 * The typed character and the quote pair are two transactions on purpose: the
 * quotes then undo on their own, so one Ctrl+Z leaves the character behind.
 */
export function applyJsonAutoEdit(
  view: EditorView,
  from: number,
  input: string,
): boolean {
  const plan = planJsonAutoEdit(view.state.doc, from, input);
  if (!plan) return false;

  // Everything after the comma shifts by one; the comma always precedes the
  // caret, and only ever accompanies a `quote` or `default` step.
  const shift = plan.comma !== null ? 1 : 0;
  if (plan.comma !== null) {
    view.dispatch({
      changes: { from: plan.comma, insert: "," },
      selection: { anchor: from + shift },
      userEvent: "input.type",
    });
  }
  const caret = from + shift;
  const step = plan.step;

  if (step.kind === "moveTo") {
    view.dispatch({
      selection: { anchor: step.pos + shift },
      scrollIntoView: true,
    });
    return true;
  }
  if (step.kind === "colon") {
    const at = step.at + shift;
    view.dispatch({
      changes: { from: at, insert: ": " },
      selection: { anchor: at + 2 },
      userEvent: "input.type",
      scrollIntoView: true,
    });
    return true;
  }
  if (step.kind === "default") {
    // Let closeBrackets insert the pair (it also owns the marker that makes
    // typing the closer step over it), or fall back to a plain insertion.
    const bracket = insertBracket(view.state, input);
    view.dispatch(
      bracket ?? {
        ...view.state.replaceSelection(input),
        userEvent: "input.type",
        scrollIntoView: true,
      },
    );
    return true;
  }

  view.dispatch({
    changes: { from: caret, insert: input },
    selection: { anchor: caret + 1 },
    userEvent: "input.type",
    scrollIntoView: true,
  });
  const end = caret + 1;
  const quotes: ChangeSpec[] = [
    { from: step.tokenStart + shift, insert: '"' },
    { from: end, insert: '"' },
  ];
  view.dispatch({
    changes: quotes,
    // The opening quote shifts the caret along with the word it wraps.
    selection: { anchor: end + 1 },
    annotations: isolateHistory.of("full"),
    scrollIntoView: true,
  });
  return true;
}

/** True when a paste over [from, to) is the whole content of the buffer. */
function isWholeBufferPaste(doc: Text, from: number, to: number): boolean {
  if (from === 0 && to === doc.length) return true;
  return doc.toString().trim() === "";
}

/**
 * Pretty-print JSON pasted into an empty buffer, or over a fully selected one.
 * Returns false — leaving the paste to CodeMirror — for a paste into an
 * existing document, or for clipboard text that is not JSON.
 */
export function pasteJson(
  view: EditorView,
  from: number,
  to: number,
  clipboard: string,
): boolean {
  if (clipboard.trim() === "") return false;
  if (!isWholeBufferPaste(view.state.doc, from, to)) return false;
  if (applyJsonTextAction(clipboard, "format").kind !== "ok") return false;

  view.dispatch({
    changes: { from, to, insert: clipboard },
    selection: { anchor: from + clipboard.length },
    userEvent: "input.paste",
  });
  // A second transaction, isolated in the history by runJsonAction: one undo
  // hands back the exact clipboard text, a second removes the paste.
  runJsonAction(view, "format");
  return true;
}

function handlePaste(event: ClipboardEvent, view: EditorView): boolean {
  const { ranges, main } = view.state.selection;
  if (ranges.length !== 1) return false;
  const clipboard = event.clipboardData?.getData("text/plain") ?? "";
  if (!pasteJson(view, main.from, main.to, clipboard)) return false;
  event.preventDefault();
  return true;
}

/** Quoting, separators and format-on-paste. */
export function jsonAutoEdit(): Extension {
  return [
    EditorView.inputHandler.of((view, from, to, text) => {
      // One plain character at a bare caret. Compositions, typing over a
      // selection and multiple cursors are all left alone.
      if (view.composing || from !== to || text.length !== 1) return false;
      const { ranges, main } = view.state.selection;
      if (ranges.length !== 1 || !main.empty || main.head !== from) return false;
      return applyJsonAutoEdit(view, from, text);
    }),
    EditorView.domEventHandlers({ paste: handlePaste }),
  ];
}

/**
 * Everything that makes typing JSON comfortable, for the JSON half of the
 * editor's language compartment. The order matters and is the reason this is a
 * bundle rather than four lines in the component: jsonAutoEdit must see a
 * keystroke before closeBrackets so it can insert a separator comma and hand
 * the character on to the pairing.
 */
export function jsonTypingExtensions(): Extension {
  return [
    // Backspace between an auto-inserted pair deletes both characters; the base
    // keymap outside the compartment would delete only one.
    Prec.high(keymap.of([...closeBracketsKeymap])),
    jsonAutoEdit(),
    closeBrackets(),
    // `}` and `]` re-indent their line, off lang-json's language data.
    indentOnInput(),
  ];
}
