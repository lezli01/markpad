import { invoke } from "@tauri-apps/api/core";

export type WorkspaceSearchMatch = {
  lineNumber: number;
  preview: string;
};

export type WorkspaceSearchFile = {
  name: string;
  path: string;
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
