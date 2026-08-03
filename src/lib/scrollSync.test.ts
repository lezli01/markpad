import { describe, expect, it } from "vitest";
import {
  lineToOffset,
  normalizeAnchors,
  offsetToLine,
  type SyncAnchor,
} from "./scrollSync";

// A three-block document: line 1 at the top, line 5 at 100px, line 9 at 300px.
// The second block is twice as tall as the first, which is the whole point of
// anchoring — a pixel-ratio sync could not represent it.
const anchors: SyncAnchor[] = [
  { line: 1, offset: 0 },
  { line: 5, offset: 100 },
  { line: 9, offset: 300 },
];

describe("normalizeAnchors", () => {
  it("sorts by source line", () => {
    expect(
      normalizeAnchors([
        { line: 9, offset: 300 },
        { line: 1, offset: 0 },
        { line: 5, offset: 100 },
      ]),
    ).toEqual(anchors);
  });

  it("keeps the first anchor of a duplicated line", () => {
    expect(
      normalizeAnchors([
        { line: 3, offset: 40 },
        { line: 3, offset: 90 },
      ]),
    ).toEqual([{ line: 3, offset: 40 }]);
  });

  it("clamps a decreasing offset so the mapping stays invertible", () => {
    expect(
      normalizeAnchors([
        { line: 1, offset: 50 },
        { line: 4, offset: 20 },
        { line: 7, offset: 80 },
      ]),
    ).toEqual([
      { line: 1, offset: 50 },
      { line: 4, offset: 50 },
      { line: 7, offset: 80 },
    ]);
  });

  it("drops non-finite entries", () => {
    expect(
      normalizeAnchors([
        { line: Number.NaN, offset: 10 },
        { line: 2, offset: Number.POSITIVE_INFINITY },
        { line: 3, offset: 30 },
      ]),
    ).toEqual([{ line: 3, offset: 30 }]);
  });
});

describe("lineToOffset", () => {
  it("returns the exact offset at an anchor", () => {
    expect(lineToOffset(anchors, 5)).toBe(100);
  });

  it("interpolates between anchors", () => {
    expect(lineToOffset(anchors, 3)).toBe(50);
    expect(lineToOffset(anchors, 7)).toBe(200);
  });

  it("interpolates a fractional line", () => {
    expect(lineToOffset(anchors, 5.5)).toBe(125);
  });

  it("clamps outside the anchor range", () => {
    expect(lineToOffset(anchors, -4)).toBe(0);
    expect(lineToOffset(anchors, 999)).toBe(300);
  });

  it("returns 0 with no anchors", () => {
    expect(lineToOffset([], 7)).toBe(0);
  });
});

describe("offsetToLine", () => {
  it("inverts lineToOffset", () => {
    for (const line of [1, 2.5, 5, 6.25, 9]) {
      expect(offsetToLine(anchors, lineToOffset(anchors, line))).toBeCloseTo(
        line,
      );
    }
  });

  it("clamps outside the offset range", () => {
    expect(offsetToLine(anchors, -20)).toBe(1);
    expect(offsetToLine(anchors, 5000)).toBe(9);
  });

  it("resolves an offset shared by a zero-height block to the visible line", () => {
    // Line 4 renders nothing, so lines 4 and 5 both sit at 60px. The line that
    // actually occupies the pixels below 60 is 5, and that is what the other
    // pane should scroll to.
    const flat: SyncAnchor[] = [
      { line: 1, offset: 0 },
      { line: 4, offset: 60 },
      { line: 5, offset: 60 },
      { line: 8, offset: 120 },
    ];
    expect(offsetToLine(flat, 60)).toBe(5);
  });

  it("returns line 1 with no anchors", () => {
    expect(offsetToLine([], 40)).toBe(1);
  });
});
