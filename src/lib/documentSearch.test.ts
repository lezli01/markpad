import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  clearDocumentSearch,
  documentSearchExtension,
  getDocumentSearchStatus,
  isDocumentSearchShortcut,
  moveDocumentSearch,
  setDocumentSearch,
} from "./documentSearch";

function viewFrom(doc: string, anchor = 0): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor },
      extensions: [documentSearchExtension],
    }),
    parent,
  });
}

function selectedText(view: EditorView): string {
  const { from, to } = view.state.selection.main;
  return view.state.sliceDoc(from, to);
}

describe("document search", () => {
  it("finds literal matches case-insensitively and selects the nearest one", () => {
    const view = viewFrom("Alpha alpha ALPHA", 7);

    expect(setDocumentSearch(view, "alpha")).toEqual({ current: 2, total: 3 });
    expect(selectedText(view)).toBe("alpha");
    expect(view.dom.querySelectorAll(".cm-searchMatch")).toHaveLength(3);

    view.destroy();
  });

  it("moves in both directions and wraps at the ends", () => {
    const view = viewFrom("one two one");

    expect(setDocumentSearch(view, "one")).toEqual({ current: 1, total: 2 });
    expect(moveDocumentSearch(view, "next")).toEqual({ current: 2, total: 2 });
    expect(moveDocumentSearch(view, "next")).toEqual({ current: 1, total: 2 });
    expect(moveDocumentSearch(view, "previous")).toEqual({
      current: 2,
      total: 2,
    });

    view.destroy();
  });

  it("keeps the match count current as the document changes", () => {
    const view = viewFrom("mark mark mark");
    setDocumentSearch(view, "mark");

    view.dispatch({ changes: { from: 0, to: 5 } });

    expect(getDocumentSearchStatus(view.state).total).toBe(2);
    view.destroy();
  });

  it("reports no results for an empty or missing query and clears highlights", () => {
    const view = viewFrom("plain text");

    expect(setDocumentSearch(view, "missing")).toEqual({ current: 0, total: 0 });
    clearDocumentSearch(view);
    expect(getDocumentSearchStatus(view.state)).toEqual({ current: 0, total: 0 });
    expect(view.dom.querySelector(".cm-panels")).toBeNull();

    view.destroy();
  });
});

describe("document search shortcut", () => {
  const event = (overrides: Partial<KeyboardEvent> = {}) =>
    ({
      key: "f",
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      ...overrides,
    }) as KeyboardEvent;

  it("accepts Ctrl+F and Command+F", () => {
    expect(isDocumentSearchShortcut(event({ ctrlKey: true }))).toBe(true);
    expect(isDocumentSearchShortcut(event({ key: "F", metaKey: true }))).toBe(
      true,
    );
  });

  it("leaves modified and unrelated shortcuts alone", () => {
    expect(
      isDocumentSearchShortcut(event({ ctrlKey: true, shiftKey: true })),
    ).toBe(false);
    expect(isDocumentSearchShortcut(event({ ctrlKey: true, altKey: true }))).toBe(
      false,
    );
    expect(isDocumentSearchShortcut(event({ ctrlKey: true, key: "s" }))).toBe(
      false,
    );
  });
});
