// Single chokepoint for the launch-files protocol — how OS-routed files (file association,
// CLI args, second-invocation handoffs) reach the frontend. Two surfaces:
//   - getPendingFiles(): drain the cold-start buffer (call once on mount, BEFORE doing anything
//     that would replay events). Marks the frontend as "ready" on the Rust side; subsequent
//     arrivals come via the live event below.
//   - subscribeToOpenFiles(handler): listen for the live "markpad://open-files" event for handoffs
//     that arrive after the frontend is ready (second invocations, macOS Opened after launch).
// The Rust side guarantees that every routed file is delivered exactly once via one of these
// two paths. This module is the only TS importer of `invoke("get_pending_files")` and
// `listen("markpad://open-files", …)`.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type OpenFilesPayload = { paths: string[] };

export async function getPendingFiles(): Promise<string[]> {
  try {
    return await invoke<string[]>("get_pending_files");
  } catch (err) {
    console.warn("get_pending_files failed; no pending files this launch:", err);
    return [];
  }
}

export async function subscribeToOpenFiles(
  handler: (paths: string[]) => void,
): Promise<UnlistenFn> {
  return listen<OpenFilesPayload>("markpad://open-files", (event) => {
    handler(event.payload.paths);
  });
}
