import { describe, expect, it } from "vitest";
import { EditorState, Text, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, undo } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { closeBrackets, insertBracket } from "@codemirror/autocomplete";
import {
  applyJsonAutoEdit,
  jsonTypingExtensions,
  pasteJson,
  planJsonAutoEdit,
} from "./jsonAutoEdit";

// The comforts are wired to a view rather than exposed as transactions, so
// exercise them through a real — but headless — view under jsdom, with the same
// neighbours they have in the editor (json() for the language data closeBrackets
// reads, history() for the undo assertions). The spec string carries the caret
// inline as `|`, matching the other command tests in this directory.
function viewFrom(
  spec: string,
  extra: Extension = closeBrackets(),
): { view: EditorView; caret: number } {
  const caret = spec.indexOf("|");
  if (caret < 0) throw new Error(`no caret marker in: ${spec}`);
  const doc = spec.slice(0, caret) + spec.slice(caret + 1);
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: caret },
      extensions: [json(), history(), extra],
    }),
    parent,
  });
  return { view, caret };
}

/** The document with `|` marking the caret. */
function mark(view: EditorView): string {
  const doc = view.state.doc.toString();
  const head = view.state.selection.main.head;
  return `${doc.slice(0, head)}|${doc.slice(head)}`;
}

/** Type one character the way the editor does: the auto-edit layer first, then
    closeBrackets, then a plain insertion. */
function type(spec: string, input: string): string {
  const { view, caret } = viewFrom(spec);
  if (!applyJsonAutoEdit(view, caret, input)) {
    view.dispatch(
      insertBracket(view.state, input) ?? view.state.replaceSelection(input),
    );
  }
  const out = mark(view);
  view.destroy();
  return out;
}

/** The plan alone — null means the keystroke is left entirely to the editor. */
function plan(spec: string, input: string) {
  const caret = spec.indexOf("|");
  const doc = spec.slice(0, caret) + spec.slice(caret + 1);
  return planJsonAutoEdit(Text.of(doc.split("\n")), caret, input);
}

describe("key quoting", () => {
  it("quotes a key as its first letter is typed", () => {
    expect(type("{|}", "a")).toBe('{"a|"}');
  });

  it("quotes a key on its own line", () => {
    expect(type("{\n  |\n}", "n")).toBe('{\n  "n|"\n}');
  });

  it("quotes a key that starts with a digit", () => {
    expect(type("{ |}", "1")).toBe('{ "1|"}');
  });

  it("leaves the top level alone", () => {
    expect(plan("|", "a")).toBeNull();
    expect(plan("{}\n|", "a")).toBeNull();
  });

  it("leaves a key that has no colon yet alone", () => {
    expect(plan('{ "a" |}', "b")).toBeNull();
  });
});

describe("value quoting", () => {
  it("quotes a string value as its first letter is typed", () => {
    expect(type('{ "a": |}', "h")).toBe('{ "a": "h|"}');
  });

  it("leaves digits bare — they are numbers", () => {
    expect(type('{ "a": |}', "1")).toBe('{ "a": 1|}');
  });

  it("leaves t, f and n bare so the literals can be typed", () => {
    expect(type('{ "a": |}', "t")).toBe('{ "a": t|}');
    expect(type('{ "a": |}', "f")).toBe('{ "a": f|}');
    expect(type('{ "a": |}', "n")).toBe('{ "a": n|}');
  });

  it("lets a literal finish unquoted", () => {
    expect(type('{ "a": tru|}', "e")).toBe('{ "a": true|}');
    expect(type('{ "a": nul|}', "l")).toBe('{ "a": null|}');
  });

  it("quotes retroactively once the word cannot be a literal", () => {
    expect(type('{ "a": t|}', "e")).toBe('{ "a": "te|"}');
    expect(type('{ "a": true|}', "x")).toBe('{ "a": "truex|"}');
  });

  it("leaves a number alone when a letter lands in it", () => {
    expect(type('{ "a": 12|}', "e")).toBe('{ "a": 12e|}');
  });

  it("quotes an array element", () => {
    expect(type("[|]", "h")).toBe('["h|"]');
  });
});

describe("separator comma", () => {
  it("appears with the first character of the next member", () => {
    expect(type('{\n  "a": 1\n  |\n}', "b")).toBe('{\n  "a": 1,\n  "b|"\n}');
  });

  it("is not repeated when the member already ends with one", () => {
    expect(type('{\n  "a": 1,\n  |\n}', "b")).toBe('{\n  "a": 1,\n  "b|"\n}');
  });

  it("appears before an array element", () => {
    expect(type("[\n  1\n  |\n]", '"')).toBe('[\n  1,\n  "|"\n]');
  });

  it("appears before a bracket that opens the next element", () => {
    expect(type("[\n  {}\n  |\n]", "{")).toBe("[\n  {},\n  {|}\n]");
  });

  it("appears before a key typed with its own quote", () => {
    expect(type('{\n  "a": 1\n  |\n}', '"')).toBe('{\n  "a": 1,\n  "|"\n}');
  });

  it("is never inserted in front of a closing bracket", () => {
    expect(plan('{ "a": 1 |}', "}")).toBeNull();
    expect(plan("[ 1 |]", "]")).toBeNull();
    expect(plan('{ "a": 1 |}', ",")).toBeNull();
  });

  it("is not inserted where the slot is still empty", () => {
    expect(plan("{ |}", '"')).toBeNull();
    expect(plan('{ "a": |}', '"')).toBeNull();
  });
});

describe("colon", () => {
  it("steps out of a finished key and adds a colon", () => {
    expect(type('{ "na|" }', ":")).toBe('{ "na": | }');
  });

  it("adds a colon after a key that is already closed", () => {
    expect(type('{ "na"| }', ":")).toBe('{ "na": | }');
  });

  it("steps over a colon that is already there", () => {
    expect(type('{ "a|": 1 }', ":")).toBe('{ "a": |1 }');
  });

  it("stays literal inside a value", () => {
    expect(type('{ "url": "http|" }', ":")).toBe('{ "url": "http:|" }');
  });
});

describe("closing quote", () => {
  it("is typed over rather than duplicated", () => {
    expect(type('{ "ab|" }', '"')).toBe('{ "ab"| }');
  });

  it("is left alone when the caret follows a backslash", () => {
    expect(plan('{ "a\\|" }', '"')).toBeNull();
  });
});

describe("undo", () => {
  it("removes the quotes on their own, keeping the typed character", () => {
    const { view, caret } = viewFrom("{|}");
    applyJsonAutoEdit(view, caret, "n");
    expect(view.state.doc.toString()).toBe('{"n"}');
    undo(view);
    expect(view.state.doc.toString()).toBe("{n}");
    view.destroy();
  });
});

describe("extension bundle", () => {
  // CodeMirror walks the inputHandler facet in order and stops at the first
  // handler that returns true — the loop below is that walk. Running the real
  // bundle through it covers the ordering the comforts depend on: the comma has
  // to be inserted before closeBrackets consumes the keystroke.
  function typeThrough(spec: string, input: string): string {
    const { view, caret } = viewFrom(spec, jsonTypingExtensions());
    const handled = view.state
      .facet(EditorView.inputHandler)
      .some((handler) =>
        handler(view, caret, caret, input, () =>
          view.state.update({
            changes: { from: caret, insert: input },
            selection: { anchor: caret + input.length },
          }),
        ),
      );
    if (!handled) view.dispatch(view.state.replaceSelection(input));
    const out = mark(view);
    view.destroy();
    return out;
  }

  it("inserts the comma and still lets closeBrackets pair the quote", () => {
    expect(typeThrough('{\n  "a": 1\n  |\n}', '"')).toBe(
      '{\n  "a": 1,\n  "|"\n}',
    );
  });

  it("leaves a keystroke it has nothing to add to fully to closeBrackets", () => {
    expect(typeThrough('{ "a": |}', "{")).toBe('{ "a": {|}}');
  });
});

describe("paste", () => {
  const minified = '{"a":1,"b":[2,3]}';
  const formatted = '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}';

  it("formats JSON pasted into an empty buffer", () => {
    const { view } = viewFrom("|");
    expect(pasteJson(view, 0, 0, minified)).toBe(true);
    expect(view.state.doc.toString()).toBe(formatted);
    view.destroy();
  });

  it("formats JSON pasted over a fully selected buffer", () => {
    const { view } = viewFrom('{"old":1}|');
    expect(pasteJson(view, 0, view.state.doc.length, minified)).toBe(true);
    expect(view.state.doc.toString()).toBe(formatted);
    view.destroy();
  });

  it("keeps the raw paste as its own undo step", () => {
    const { view } = viewFrom("|");
    pasteJson(view, 0, 0, minified);
    undo(view);
    expect(view.state.doc.toString()).toBe(minified);
    undo(view);
    expect(view.state.doc.toString()).toBe("");
    view.destroy();
  });

  it("leaves a paste into an existing document verbatim", () => {
    const { view, caret } = viewFrom('{ "x": | }');
    expect(pasteJson(view, caret, caret, minified)).toBe(false);
    expect(view.state.doc.toString()).toBe('{ "x":  }');
    view.destroy();
  });

  it("leaves clipboard text that is not JSON verbatim", () => {
    const { view } = viewFrom("|");
    expect(pasteJson(view, 0, 0, "not json at all")).toBe(false);
    expect(view.state.doc.toString()).toBe("");
    view.destroy();
  });
});
