import { invoke } from "@tauri-apps/api/core";

export type WorkspaceSearchMatch = {
  lineNumber: number;
  preview: string;
};

export type WorkspaceSearchScope = "openFiles" | "folder";

export const DEFAULT_WORKSPACE_SEARCH_SCOPE: WorkspaceSearchScope =
  "openFiles";

export type OpenFileSearchSource = {
  itemId: string;
  name: string;
  path: string | null;
  content: string;
};

export type WorkspaceSearchFile = {
  itemId?: string;
  name: string;
  path: string | null;
  relativePath: string;
  matches: WorkspaceSearchMatch[];
};

export type WorkspaceSearchResult =
  | { kind: "ok"; files: WorkspaceSearchFile[] }
  | { kind: "error"; message: string };

export type WorkspaceSearchStatus = "idle" | "searching" | "complete";

export function isWorkspaceSearchShortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === "f"
  );
}

export function countWorkspaceSearchMatches(
  files: WorkspaceSearchFile[],
): number {
  return files.reduce((total, file) => total + file.matches.length, 0);
}

const PREVIEW_LIMIT = 160;

function shortenPreview(line: string): string {
  const characters = Array.from(line.trim());
  const preview = characters.slice(0, PREVIEW_LIMIT).join("");
  return characters.length > PREVIEW_LIMIT ? `${preview}…` : preview;
}

/** Search the live buffers for files currently open in MarkPad. */
export function searchOpenFiles(
  sources: OpenFileSearchSource[],
  query: string,
): WorkspaceSearchFile[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) return [];

  const results: WorkspaceSearchFile[] = [];
  for (const source of sources) {
    const matches: WorkspaceSearchMatch[] = [];
    for (const [index, line] of source.content.split(/\r\n?|\n/).entries()) {
      if (!line.toLowerCase().includes(normalizedQuery)) continue;
      matches.push({
        lineNumber: index + 1,
        preview: shortenPreview(line),
      });
    }
    if (matches.length === 0) continue;

    results.push({
      itemId: source.itemId,
      name: source.name,
      path: source.path,
      relativePath: source.path ?? "Unsaved draft",
      matches,
    });
  }
  return results;
}

export async function searchWorkspace(
  rootPath: string,
  query: string,
): Promise<WorkspaceSearchResult> {
  try {
    const files = await invoke<WorkspaceSearchFile[]>("search_workspace", {
      rootPath,
      query,
    });
    return { kind: "ok", files };
  } catch (error) {
    console.warn("Workspace search failed:", error);
    return {
      kind: "error",
      message:
        "Could not search this folder. It may have moved, or some files may not be accessible.",
    };
  }
}
