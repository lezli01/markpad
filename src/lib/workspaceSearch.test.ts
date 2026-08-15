import { describe, expect, it } from "vitest";
import {
  countWorkspaceSearchMatches,
  isWorkspaceSearchShortcut,
  type WorkspaceSearchFile,
} from "./workspaceSearch";

const event = (overrides: Partial<KeyboardEvent> = {}) =>
  ({
    key: "f",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  }) as KeyboardEvent;

describe("workspace search shortcut", () => {
  it("accepts Ctrl+Shift+F and Command+Shift+F", () => {
    expect(
      isWorkspaceSearchShortcut(event({ ctrlKey: true, shiftKey: true })),
    ).toBe(true);
    expect(
      isWorkspaceSearchShortcut(event({ metaKey: true, shiftKey: true })),
    ).toBe(true);
  });

  it("leaves document-search and modified chords alone", () => {
    expect(isWorkspaceSearchShortcut(event({ ctrlKey: true }))).toBe(false);
    expect(
      isWorkspaceSearchShortcut(
        event({ ctrlKey: true, shiftKey: true, altKey: true }),
      ),
    ).toBe(false);
    expect(
      isWorkspaceSearchShortcut(
        event({ ctrlKey: true, shiftKey: true, key: "s" }),
      ),
    ).toBe(false);
  });
});

describe("workspace search result count", () => {
  it("counts matching lines across grouped files", () => {
    const files: WorkspaceSearchFile[] = [
      {
        name: "one.md",
        path: "/notes/one.md",
        relativePath: "one.md",
        matches: [
          { lineNumber: 1, preview: "first" },
          { lineNumber: 8, preview: "second" },
        ],
      },
      {
        name: "two.yaml",
        path: "/notes/two.yaml",
        relativePath: "two.yaml",
        matches: [{ lineNumber: 4, preview: "third" }],
      },
    ];

    expect(countWorkspaceSearchMatches(files)).toBe(3);
  });
});
