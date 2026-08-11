import { describe, expect, it } from "vitest";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, undo } from "@codemirror/commands";
import { yaml } from "@codemirror/lang-yaml";
import { closeBrackets, insertBracket } from "@codemirror/autocomplete";
import { Text } from "@codemirror/state";
import {
  applyYamlColon,
  applyYamlEnter,
  outerIndent,
  pasteJsonAsYaml,
  planYamlColon,
  planYamlEnter,
  yamlTypingExtensions,
} from "./yamlAutoEdit";

// Same harness as the JSON comforts: a real — but headless — view under jsdom,
// with the neighbours these extensions have in the editor (yaml() for the
// language data closeBrackets reads, history() for the undo assertions). The
// spec string carries the caret inline as `|`.
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
      extensions: [yaml(), history(), extra],
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

/** Press Enter the way the keymap does. */
function enter(spec: string): string {
  const { view } = viewFrom(spec);
  if (!applyYamlEnter(view)) {
    view.dispatch(view.state.replaceSelection("\n"));
  }
  const out = mark(view);
  view.destroy();
  return out;
}

/** Type one character: the auto-edit layer first, then a plain insertion. */
function type(spec: string, input: string): string {
  const { view, caret } = viewFrom(spec);
  if (input !== ":" || !applyYamlColon(view, caret)) {
    view.dispatch(
      insertBracket(view.state, input) ?? view.state.replaceSelection(input),
    );
  }
  const out = mark(view);
  view.destroy();
  return out;
}

describe("planYamlEnter", () => {
  it("continues a sequence item", () => {
    expect(planYamlEnter("- a")).toEqual({
      kind: "continue",
      insert: "- ",
      trimTrailing: 0,
    });
    expect(planYamlEnter("  - a")).toEqual({
      kind: "continue",
      insert: "  - ",
      trimTrailing: 0,
    });
    expect(planYamlEnter("- - a")).toEqual({
      kind: "continue",
      insert: "- - ",
      trimTrailing: 0,
    });
  });

  it("ends the list on an item that is still empty", () => {
    expect(planYamlEnter("- ")).toEqual({ kind: "exitItem", indent: "" });
    expect(planYamlEnter("    - ")).toEqual({
      kind: "exitItem",
      indent: "    ",
    });
  });

  it("indents one level below a key with no value", () => {
    expect(planYamlEnter("key:")).toEqual({
      kind: "continue",
      insert: "  ",
      trimTrailing: 0,
    });
    expect(planYamlEnter("  key:")).toEqual({
      kind: "continue",
      insert: "    ",
      trimTrailing: 0,
    });
  });

  it("indents below a key inside an item, past the marker", () => {
    expect(planYamlEnter("- name:")).toEqual({
      kind: "continue",
      insert: "    ",
      trimTrailing: 0,
    });
  });

  it("drops the space the colon comfort left behind", () => {
    expect(planYamlEnter("key: ")).toEqual({
      kind: "continue",
      insert: "  ",
      trimTrailing: 1,
    });
  });

  it("leaves everything else to CodeMirror", () => {
    expect(planYamlEnter("")).toBeNull();
    expect(planYamlEnter("  ")).toBeNull();
    expect(planYamlEnter("key: value")).toBeNull();
    expect(planYamlEnter("-")).toBeNull();
    // A colon in prose is not a key: comments and quoted or multi-word text
    // stay outside the rule.
    expect(planYamlEnter("# a note:")).toBeNull();
    expect(planYamlEnter("key: value # why:")).toBeNull();
    expect(planYamlEnter("  and then this:")).toBeNull();
    expect(planYamlEnter('"quoted key":')).toBeNull();
  });
});

describe("outerIndent", () => {
  const doc = (text: string) => Text.of(text.split("\n"));

  it("finds the indent of the block's own key", () => {
    expect(outerIndent(doc("steps:\n  - a\n  - "), 3, "  ")).toBe("");
    expect(
      outerIndent(doc("jobs:\n  build:\n    steps:\n      - a\n      - "), 5, "      "),
    ).toBe("    ");
  });

  it("skips blank lines on the way up", () => {
    expect(outerIndent(doc("a:\n\n    - x\n\n    - "), 5, "    ")).toBe("");
  });

  it("falls back to the left margin", () => {
    expect(outerIndent(doc("- a\n- "), 2, "")).toBe("");
  });
});

describe("Enter", () => {
  it("opens the next item of a sequence", () => {
    expect(enter("steps:\n  - build|")).toBe("steps:\n  - build\n  - |");
  });

  it("clears an item marker the user did not fill in", () => {
    expect(enter("steps:\n  - build\n  - |")).toBe("steps:\n  - build\n|");
  });

  it("steps back out to the indent the sequence hangs off", () => {
    expect(enter("jobs:\n  build:\n    steps:\n      - a\n      - |")).toBe(
      "jobs:\n  build:\n    steps:\n      - a\n    |",
    );
  });

  it("opens the block below a key", () => {
    expect(enter("jobs:\n  build:|")).toBe("jobs:\n  build:\n    |");
  });

  it("keeps the rest of the document", () => {
    expect(enter("a:\n  - one|\nb: 2\n")).toBe("a:\n  - one\n  - |\nb: 2\n");
  });

  it("leaves a break in the middle of a line alone", () => {
    const { view } = viewFrom("- one| two");
    expect(applyYamlEnter(view)).toBe(false);
    view.destroy();
  });

  it("leaves a break over a selection alone", () => {
    const { view } = viewFrom("- one|");
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    expect(applyYamlEnter(view)).toBe(false);
    view.destroy();
  });
});

describe("colon", () => {
  it("adds the space YAML needs after a key", () => {
    expect(type("name|", ":")).toBe("name: |");
    expect(type("  name|", ":")).toBe("  name: |");
    expect(type("- name|", ":")).toBe("- name: |");
    expect(type("a:\n  b|", ":")).toBe("a:\n  b: |");
  });

  it("stays literal once the line already has its colon", () => {
    expect(type("url: http|", ":")).toBe("url: http:|");
    expect(planYamlColon("url: http")).toBe(false);
  });

  it("stays literal in a comment or a quoted scalar", () => {
    expect(planYamlColon("# note")).toBe(false);
    expect(planYamlColon('"key')).toBe(false);
  });

  it("stays literal where there is no key to end", () => {
    expect(planYamlColon("")).toBe(false);
    expect(planYamlColon("  ")).toBe(false);
    expect(planYamlColon("- ")).toBe(false);
    expect(planYamlColon("two words")).toBe(false);
  });

  it("is not applied in the middle of a line", () => {
    const { view, caret } = viewFrom("nam|e");
    expect(applyYamlColon(view, caret)).toBe(false);
    view.destroy();
  });
});

describe("extension bundle", () => {
  // CodeMirror walks the inputHandler facet in order and stops at the first
  // handler that returns true — the loop below is that walk.
  function typeThrough(spec: string, input: string): string {
    const { view, caret } = viewFrom(spec, yamlTypingExtensions());
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

  it("adds the space after a key", () => {
    expect(typeThrough("name|", ":")).toBe("name: |");
  });

  it("still lets closeBrackets pair a flow collection", () => {
    expect(typeThrough("ports: |", "[")).toBe("ports: [|]");
    expect(typeThrough("name: |", '"')).toBe('name: "|"');
  });
});

describe("paste", () => {
  const json = '{"name":"markpad","tags":["editor","tauri"]}';
  const converted = "name: markpad\ntags:\n  - editor\n  - tauri\n";

  it("lands JSON pasted into an empty buffer as YAML", () => {
    const { view } = viewFrom("|");
    expect(pasteJsonAsYaml(view, 0, 0, json)).toBe(true);
    expect(view.state.doc.toString()).toBe(converted);
    view.destroy();
  });

  it("lands JSON pasted over a fully selected buffer as YAML", () => {
    const { view } = viewFrom("old: 1|");
    expect(pasteJsonAsYaml(view, 0, view.state.doc.length, json)).toBe(true);
    expect(view.state.doc.toString()).toBe(converted);
    view.destroy();
  });

  it("keeps the raw paste as its own undo step", () => {
    const { view } = viewFrom("|");
    pasteJsonAsYaml(view, 0, 0, json);
    undo(view);
    expect(view.state.doc.toString()).toBe(json);
    undo(view);
    expect(view.state.doc.toString()).toBe("");
    view.destroy();
  });

  it("leaves a paste into an existing document verbatim", () => {
    const { view, caret } = viewFrom("name: |\n");
    expect(pasteJsonAsYaml(view, caret, caret, json)).toBe(false);
    view.destroy();
  });

  it("leaves clipboard text that is not JSON verbatim", () => {
    const { view } = viewFrom("|");
    expect(pasteJsonAsYaml(view, 0, 0, "a: 1\nb: 2\n")).toBe(false);
    expect(pasteJsonAsYaml(view, 0, 0, '"just a string"')).toBe(false);
    expect(view.state.doc.toString()).toBe("");
    view.destroy();
  });
});
