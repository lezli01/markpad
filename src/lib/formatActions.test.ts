import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import {
  getActiveFormatActions,
  inlineToggleTransaction,
  inlineCodeToggleTransaction,
} from "./formatActions";

// Build an EditorState with the SAME language config as the real editor
// (GFM base, so ~~strike~~ is a Strikethrough node). The spec string carries the
// selection inline: a single `|` marks a collapsed caret, or `[` … `]` mark a
// range. e.g. make("**hel|lo**") or make("**[hello]**").
function make(spec: string): EditorState {
  let doc: string;
  let anchor: number;
  let head: number;
  if (spec.includes("|")) {
    const pos = spec.indexOf("|");
    doc = spec.slice(0, pos) + spec.slice(pos + 1);
    anchor = head = pos;
  } else {
    const open = spec.indexOf("[");
    const close = spec.indexOf("]");
    if (open < 0 || close < 0) throw new Error(`no selection marker in: ${spec}`);
    doc = spec.slice(0, open) + spec.slice(open + 1, close) + spec.slice(close + 1);
    anchor = open;
    head = close - 1;
  }
  const state = EditorState.create({
    doc,
    selection: { anchor, head },
    extensions: [markdown({ base: markdownLanguage })],
  });
  // Force a complete parse so tree detection is deterministic without a view.
  ensureSyntaxTree(state, state.doc.length, 5000);
  return state;
}

const active = (spec: string) => getActiveFormatActions(make(spec));

describe("getActiveFormatActions — inline emphasis at the caret", () => {
  it("lights bold for a caret inside a single-word span", () => {
    expect(active("**b|old**")).toContain("bold");
  });

  it("lights bold for a caret inside a MULTI-WORD span (the core gap)", () => {
    expect(active("**hello wo|rld**")).toContain("bold");
  });

  it("lights bold when a selection sits inside a bold span", () => {
    expect(active("**hello [wor]ld**")).toContain("bold");
  });

  it("does NOT light bold for a caret just outside the markers", () => {
    expect(active("|**bold**")).not.toContain("bold");
    expect(active("**bold**|")).not.toContain("bold");
  });

  it("lights italic (single asterisk) without confusing it for bold", () => {
    expect(active("*hello wo|rld*")).toContain("italic");
    expect(active("*hello wo|rld*")).not.toContain("bold");
  });

  it("lights BOTH bold and italic for a caret in nested emphasis", () => {
    const a = active("**a *b|* c**");
    expect(a).toContain("bold");
    expect(a).toContain("italic");
  });

  it("lights strikethrough for a caret inside ~~…~~ (needs GFM base)", () => {
    expect(active("~~multi wo|rd~~")).toContain("strikethrough");
  });

  it("lights inline code for a caret inside a multi-word span", () => {
    expect(active("`foo b|ar`")).toContain("inlineCode");
  });

  it("is empty for plain unformatted text", () => {
    expect(active("hel|lo world")).toEqual([]);
  });
});

describe("getActiveFormatActions — block & line toggles at the caret", () => {
  it("lights the matching heading level only", () => {
    expect(active("## Titl|e")).toContain("heading2");
    expect(active("## Titl|e")).not.toContain("heading1");
    expect(active("### Deep|er")).toContain("heading3");
  });

  it("lights bullet vs ordered by list kind", () => {
    expect(active("- item o|ne")).toContain("bulletList");
    expect(active("- item o|ne")).not.toContain("orderedList");
    expect(active("1. item o|ne")).toContain("orderedList");
  });

  it("lights blockquote for a caret inside a quote", () => {
    expect(active("> quo|te")).toContain("blockquote");
  });

  // Block detection is line-anchored so it lights ONLY where the line-prefix
  // toggle command can actually strip the marker — never on a line where a
  // click would insert a stray marker and corrupt the document.
  it("does NOT light a heading for a setext underline (the run can't strip it)", () => {
    expect(active("Titl|e\n=====")).not.toContain("heading1");
    expect(active("Titl|e\n=====")).not.toContain("heading2");
  });

  it("does NOT light the bullet toggle on a soft-wrapped continuation line", () => {
    expect(active("- item that\n  wr|aps")).not.toContain("bulletList");
  });

  it("does NOT light a heading for an ATX heading nested in a blockquote", () => {
    expect(active("> # Ti|tle")).not.toContain("heading1");
  });
});

// Apply a toggle transaction headlessly and read back the resulting document.
const applyInline = (spec: string, marker: string) => {
  const state = make(spec);
  return state.update(inlineToggleTransaction(state, marker)).state.doc.toString();
};
const applyCode = (spec: string) => {
  const state = make(spec);
  return state.update(inlineCodeToggleTransaction(state)).state.doc.toString();
};

describe("toggle run — unwraps the detected span (matches what the toggle shows)", () => {
  it("unwraps multi-word bold from a collapsed caret", () => {
    expect(applyInline("**hello wo|rld**", "**")).toBe("hello world");
  });

  it("unwraps bold when a selection sits inside the span", () => {
    expect(applyInline("**hello [wor]ld**", "**")).toBe("hello world");
  });

  it("wraps the word under the caret when nothing is formatted yet", () => {
    expect(applyInline("hel|lo", "**")).toBe("**hello**");
  });

  it("unwraps multi-word italic without touching bold markers", () => {
    expect(applyInline("*hello wo|rld*", "*")).toBe("hello world");
  });

  it("unwraps multi-word inline code from a collapsed caret", () => {
    expect(applyCode("`hello wo|rld`")).toBe("hello world");
  });

  it("round-trips: unwrapping bold clears the active toggle", () => {
    const state = make("**hello wo|rld**");
    const next = state.update(inlineToggleTransaction(state, "**")).state;
    ensureSyntaxTree(next, next.doc.length, 5000);
    expect(getActiveFormatActions(next)).not.toContain("bold");
  });
});
