import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  FORMAT_ACTIONS,
  getActiveFormatActions,
  markdownFormattingKeymap,
  runFormatAction,
  type FormatAction,
} from "./formatActions";

// The line-prefix (headings/lists/quote) and insert (link/image/…) commands are
// wired to an EditorView rather than exported as pure transactions, so exercise
// them through a real — but headless — view under jsdom: dispatch through the
// registry, then read the resulting document / selection back. The spec string
// carries the selection inline, matching make() in formatActions.test.ts: a
// single `|` is a collapsed caret, `[` … `]` mark a range.
function viewFrom(spec: string): EditorView {
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
    if (open < 0 || close < 0) {
      throw new Error(`no selection marker in: ${spec}`);
    }
    doc =
      spec.slice(0, open) + spec.slice(open + 1, close) + spec.slice(close + 1);
    anchor = open;
    head = close - 1;
  }
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor, head },
      extensions: [markdown({ base: markdownLanguage })],
    }),
    parent,
  });
}

/** Run an action through the registry and return the resulting document. */
function runDoc(spec: string, id: FormatAction): string {
  const view = viewFrom(spec);
  runFormatAction(id, view);
  const doc = view.state.doc.toString();
  view.destroy();
  return doc;
}

/** Run an action and return the doc plus the text now covered by the selection. */
function runSel(spec: string, id: FormatAction): { doc: string; sel: string } {
  const view = viewFrom(spec);
  runFormatAction(id, view);
  const { from, to } = view.state.selection.main;
  const out = {
    doc: view.state.doc.toString(),
    sel: view.state.sliceDoc(from, to),
  };
  view.destroy();
  return out;
}

describe("line-prefix commands — headings", () => {
  it("adds the heading prefix to the caret's line", () => {
    expect(runDoc("Title|", "heading1")).toBe("# Title");
    expect(runDoc("Title|", "heading2")).toBe("## Title");
    expect(runDoc("Title|", "heading3")).toBe("### Title");
  });

  it("toggles the same heading level off", () => {
    expect(runDoc("# Title|", "heading1")).toBe("Title");
  });

  it("switches level by stripping the conflicting heading prefix", () => {
    expect(runDoc("# Title|", "heading2")).toBe("## Title");
    expect(runDoc("### Deep|", "heading1")).toBe("# Deep");
  });
});

describe("line-prefix commands — lists & quote", () => {
  it("adds and removes a bullet prefix", () => {
    expect(runDoc("item|", "bulletList")).toBe("- item");
    expect(runDoc("- item|", "bulletList")).toBe("item");
  });

  it("adds and removes an ordered prefix", () => {
    expect(runDoc("item|", "orderedList")).toBe("1. item");
    expect(runDoc("1. item|", "orderedList")).toBe("item");
  });

  it("renumbers an ordered list 1..N across a multi-line selection", () => {
    expect(runDoc("[a\nb\nc]", "orderedList")).toBe("1. a\n2. b\n3. c");
  });

  it("stacks a new list marker in front of a different one (current limitation)", () => {
    // Unlike heading levels (which strip each other via ANY_HEADING), the list
    // and quote rules only strip their OWN marker — so switching list kind
    // prepends rather than replaces. This locks the current behavior; if
    // cross-kind stripping is ever added, update these expectations.
    expect(runDoc("- a|", "orderedList")).toBe("1. - a");
    expect(runDoc("1. a|", "bulletList")).toBe("- 1. a");
  });

  it("skips blank lines when prefixing a multi-line selection", () => {
    expect(runDoc("[a\n\nb]", "bulletList")).toBe("- a\n\n- b");
  });

  it("adds and removes a blockquote prefix", () => {
    expect(runDoc("quote|", "blockquote")).toBe("> quote");
    expect(runDoc("> quote|", "blockquote")).toBe("quote");
  });

  it("removes the prefix from every line only when all lines already have it", () => {
    expect(runDoc("[- a\n- b]", "bulletList")).toBe("a\nb");
    // Mixed: one line missing the prefix → add it everywhere instead of removing.
    expect(runDoc("[- a\nb]", "bulletList")).toBe("- a\n- b");
  });
});

describe("insert commands — link & image", () => {
  it("inserts a link placeholder and selects the text when nothing is selected", () => {
    const { doc, sel } = runSel("|", "link");
    expect(doc).toBe("[text](url)");
    expect(sel).toBe("text");
  });

  it("keeps the selection as the label and selects the url placeholder", () => {
    const { doc, sel } = runSel("[label]", "link");
    expect(doc).toBe("[label](url)");
    expect(sel).toBe("url");
  });

  it("inserts an image placeholder", () => {
    expect(runDoc("|", "image")).toBe("![alt](url)");
    expect(runDoc("[logo]", "image")).toBe("![logo](url)");
  });
});

describe("insert commands — code block, table, horizontal rule", () => {
  it("wraps a selection in a fenced code block", () => {
    expect(runDoc("[foo]", "codeBlock")).toBe("```\nfoo\n```");
  });

  it("inserts an empty fenced code block at a line start", () => {
    expect(runDoc("|", "codeBlock")).toBe("```\n\n```");
  });

  it("breaks onto a new line when not at the start of a line", () => {
    expect(runDoc("ab|c", "codeBlock")).toBe("ab\n```\n\n```\nc");
  });

  it("inserts a GFM table and selects the first header cell", () => {
    const { doc, sel } = runSel("|", "table");
    expect(doc).toBe(
      "| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\n",
    );
    expect(sel).toBe("Header 1");
  });

  it("inserts *** for a horizontal rule (never --- which is a setext underline)", () => {
    expect(runDoc("|", "horizontalRule")).toBe("***\n");
    expect(runDoc("ab|", "horizontalRule")).toBe("ab\n***\n");
  });
});

describe("format action registry", () => {
  it("has unique action ids", () => {
    const ids = FORMAT_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every toggle an isActive detector and every non-toggle none", () => {
    for (const a of FORMAT_ACTIONS) {
      if (a.toggle) expect(typeof a.isActive).toBe("function");
      else expect(a.isActive).toBeUndefined();
    }
  });

  it("binds the keymap to exactly the actions that declare a shortcut, with unique keys", () => {
    const withShortcut = FORMAT_ACTIONS.filter((a) => a.shortcut);
    expect(markdownFormattingKeymap.length).toBe(withShortcut.length);
    const keys = markdownFormattingKeymap.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const a of withShortcut) {
      expect(keys).toContain(a.shortcut);
    }
  });

  it("runFormatAction returns false for an unknown id and leaves the doc untouched", () => {
    const view = viewFrom("hello|");
    // Cast: deliberately exercising the guard for an id outside the union.
    const handled = runFormatAction("nope" as FormatAction, view);
    const doc = view.state.doc.toString();
    view.destroy();
    expect(handled).toBe(false);
    expect(doc).toBe("hello");
  });

  it("run and isActive agree — each block toggle lights its own detector", () => {
    for (const id of [
      "heading1",
      "bulletList",
      "orderedList",
      "blockquote",
    ] as const) {
      const view = viewFrom("word|");
      runFormatAction(id, view);
      expect(getActiveFormatActions(view.state)).toContain(id);
      view.destroy();
    }
  });
});
