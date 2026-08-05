import { describe, expect, it } from "vitest";

import { idsToClose, type ClosableItem } from "./recentsActions";

// Displayed order: modified items first, then clean ones (see sortItems in App).
const items: ClosableItem[] = [
  { id: "a", path: "/tmp/a.md", unsaved: true },
  { id: "b", path: null, unsaved: true },
  { id: "c", path: "/tmp/c.md", unsaved: false },
  { id: "d", path: null, unsaved: false },
  { id: "e", path: "/tmp/e.md", unsaved: false },
];

describe("idsToClose", () => {
  it("closes every item without unsaved work", () => {
    expect(idsToClose(items, "all", "c")).toEqual(["c", "d", "e"]);
  });

  it("keeps the target when closing others", () => {
    expect(idsToClose(items, "others", "c")).toEqual(["d", "e"]);
  });

  it("closes only items displayed above the target", () => {
    expect(idsToClose(items, "above", "e")).toEqual(["c", "d"]);
  });

  it("closes only items displayed below the target", () => {
    expect(idsToClose(items, "below", "c")).toEqual(["d", "e"]);
  });

  it("closes saved files but keeps untitled drafts", () => {
    expect(idsToClose(items, "saved", "c")).toEqual(["c", "e"]);
  });

  it("never closes an item with unsaved work", () => {
    for (const scope of ["all", "others", "above", "below", "saved"] as const) {
      const closed = idsToClose(items, scope, "e");
      expect(closed).not.toContain("a");
      expect(closed).not.toContain("b");
    }
  });

  it("returns nothing when the target is gone", () => {
    expect(idsToClose(items, "all", "missing")).toEqual([]);
  });

  it("returns nothing for above/below at the edges", () => {
    expect(idsToClose(items, "above", "a")).toEqual([]);
    expect(idsToClose(items, "below", "e")).toEqual([]);
  });

  it("handles an empty list", () => {
    expect(idsToClose([], "all", "a")).toEqual([]);
  });
});
