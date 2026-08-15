import { describe, expect, it } from "vitest";
import {
  countWorkspaceSearchMatches,
  DEFAULT_WORKSPACE_SEARCH_SCOPE,
  isWorkspaceSearchShortcut,
  searchOpenFiles,
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
  it("defaults global search to the open files scope", () => {
    expect(DEFAULT_WORKSPACE_SEARCH_SCOPE).toBe("openFiles");
  });

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

describe("open file search", () => {
  it("searches live file contents case-insensitively and groups matching lines", () => {
    const files = searchOpenFiles(
      [
        {
          itemId: "item-1",
          name: "notes.md",
          path: "/notes/notes.md",
          content: "First Needle\nno match\nsecond needle",
        },
        {
          itemId: "item-2",
          name: "Untitled-1",
          path: null,
          content: "NEEDLE in an unsaved draft",
        },
        {
          itemId: "item-3",
          name: "other.json",
          path: "/notes/other.json",
          content: '{"key": "different"}',
        },
      ],
      " needle ",
    );

    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({
      itemId: "item-1",
      path: "/notes/notes.md",
      relativePath: "/notes/notes.md",
    });
    expect(files[0].matches.map((match) => match.lineNumber)).toEqual([1, 3]);
    expect(files[1]).toMatchObject({
      itemId: "item-2",
      path: null,
      relativePath: "Unsaved draft",
    });
  });

  it("returns no results for a blank query", () => {
    expect(
      searchOpenFiles(
        [
          {
            itemId: "item-1",
            name: "notes.md",
            path: "/notes/notes.md",
            content: "anything",
          },
        ],
        "   ",
      ),
    ).toEqual([]);
  });
});
