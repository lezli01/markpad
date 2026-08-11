// Single chokepoint for Tauri's dialog, fs (read AND write), and window APIs.
// No other module in the app should import @tauri-apps/plugin-dialog,
// @tauri-apps/plugin-fs, or @tauri-apps/api/webviewWindow — grep for those
// module names to verify.
//
// Companion chokepoints (added in Feature 007):
//   - src/lib/session.ts        owns load_session / save_session
//   - src/lib/launchFiles.ts    owns get_pending_files + markpad://open-files event
//
// statTextFile and subscribeToAppFocus are the two primitives external-change
// detection needs; the policy that uses them lives in src/lib/externalChange.ts.
//
// Note: openTextFileByPath reads via the Rust `read_text_file_by_path`
// command rather than the fs plugin's readTextFile because programmatic paths
// (CLI args, OS file activations, session restore) don't get the fs plugin's
// implicit per-dialog scope grant. Reading on the Rust side sidesteps the
// scope concern and works uniformly across all OSes.

import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { DocumentLanguage } from "./documentLanguage";

const MARKDOWN_FILTER = { name: "Markdown", extensions: ["md", "markdown"] };
const JSON_FILTER = { name: "JSON", extensions: ["json"] };
const YAML_FILTER = { name: "YAML", extensions: ["yaml", "yml"] };
const ALL_FILES_FILTER = { name: "All Files", extensions: ["*"] };

// Save-As leads with the document's own language so the dialog defaults to the
// right extension for an untitled draft; the others stay available behind it.
const SAVE_FILTERS: Record<
  DocumentLanguage,
  ReadonlyArray<{ name: string; extensions: string[] }>
> = {
  markdown: [MARKDOWN_FILTER, JSON_FILTER, YAML_FILTER, ALL_FILES_FILTER],
  json: [JSON_FILTER, MARKDOWN_FILTER, YAML_FILTER, ALL_FILES_FILTER],
  yaml: [YAML_FILTER, MARKDOWN_FILTER, JSON_FILTER, ALL_FILES_FILTER],
};

export type OpenResult =
  | { kind: "ok"; name: string; path: string; content: string }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

/** Cheap change stamp for a file on disk; see FileStamp in launch_files.rs. */
export type DiskStamp = { mtimeMs: number | null; size: number };

export type StatResult =
  | { kind: "ok"; stamp: DiskStamp }
  | { kind: "missing" }
  | { kind: "error"; message: string };

export type SaveResult = { kind: "ok" } | { kind: "error"; message: string };

export type SaveAsResult =
  | { kind: "ok"; name: string; path: string }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

/**
 * Normalize text loaded from disk so the in-memory representation matches what
 * CodeMirror produces: strip a leading UTF-8 BOM and collapse `\r\n` / lone `\r`
 * line endings to `\n`. Without this, files saved on Windows with CRLF show as
 * "modified" the instant they load (CodeMirror reports `\n`-only text but the
 * raw disk read has `\r\n`).
 */
function normalizeLoadedText(content: string): string {
  let out = content;
  if (out.charCodeAt(0) === 0xfeff) {
    out = out.slice(1);
  }
  return out.replace(/\r\n?/g, "\n");
}

function friendlyMessage(err: unknown): string {
  const raw = typeof err === "string" ? err : err instanceof Error ? err.message : "";
  const lower = raw.toLowerCase();
  if (lower.includes("permission") || lower.includes("denied")) {
    return "Could not open this file: permission denied.";
  }
  if (
    lower.includes("not found") ||
    lower.includes("no such file") ||
    lower.includes("does not exist")
  ) {
    return "Could not open this file: it may have been moved or deleted.";
  }
  if (
    lower.includes("utf-8") ||
    lower.includes("invalid") ||
    lower.includes("stream did not contain") ||
    lower.includes("not a text")
  ) {
    return "Could not open this file: it does not appear to be a text file.";
  }
  return "This file could not be accessed. It may be locked, read-only, or you may not have permission.";
}

export async function openTextFileByPath(path: string): Promise<OpenResult> {
  if (typeof path !== "string" || path.length === 0) {
    return { kind: "error", message: "Empty path." };
  }
  try {
    const raw = await invoke<string>("read_text_file_by_path", { path });
    return {
      kind: "ok",
      name: basename(path),
      path,
      content: normalizeLoadedText(raw),
    };
  } catch (err) {
    console.warn("Failed to read file by path:", err);
    return { kind: "error", message: friendlyMessage(err) };
  }
}

/**
 * Read a file and stamp it in one go, for the callers that want a baseline to
 * compare against later (see lib/externalChange.ts).
 *
 * The stamp is taken FIRST, on purpose: a write landing between the two calls
 * then leaves a stamp that looks older than the content it labels, which costs
 * one redundant read on the next check. Stamping afterwards would leave one that
 * looks current for content we never saw, hiding that change for good.
 *
 * `stamp` is null when only the stat failed — an unknown baseline is safe, it
 * just means the next check reads instead of trusting the stamp.
 */
export async function openTextFileByPathWithStamp(
  path: string,
): Promise<{ result: OpenResult; stamp: DiskStamp | null }> {
  const stat = await statTextFile(path);
  const result = await openTextFileByPath(path);
  return { result, stamp: stat.kind === "ok" ? stat.stamp : null };
}

/**
 * Stamp a file without reading it, so an open document can be checked against
 * disk cheaply. A path that no longer exists reports `missing` rather than an
 * error — see lib/externalChange.ts for what the caller does with each outcome.
 */
export async function statTextFile(path: string): Promise<StatResult> {
  try {
    const stamp = await invoke<DiskStamp | null>("stat_text_file_by_path", {
      path,
    });
    return stamp === null ? { kind: "missing" } : { kind: "ok", stamp };
  } catch (err) {
    console.warn("Failed to stat file:", err);
    return { kind: "error", message: friendlyMessage(err) };
  }
}

export async function openTextFile(): Promise<OpenResult> {
  let picked: string | string[] | null;
  try {
    picked = await open({
      multiple: false,
      directory: false,
      filters: [
        MARKDOWN_FILTER,
        JSON_FILTER,
        YAML_FILTER,
        ALL_FILES_FILTER,
      ],
    });
  } catch (err) {
    console.warn("Open dialog failed:", err);
    return { kind: "error", message: friendlyMessage(err) };
  }

  if (picked === null) {
    return { kind: "cancelled" };
  }

  const path = Array.isArray(picked) ? picked[0] : picked;
  if (typeof path !== "string" || path.length === 0) {
    return { kind: "cancelled" };
  }

  try {
    const raw = await readTextFile(path);
    return {
      kind: "ok",
      name: basename(path),
      path,
      content: normalizeLoadedText(raw),
    };
  } catch (err) {
    console.warn("Failed to read file:", err);
    return { kind: "error", message: friendlyMessage(err) };
  }
}

export async function saveTextFile(
  path: string,
  content: string,
): Promise<SaveResult> {
  try {
    await invoke<void>("write_text_file_by_path", { path, content });
    return { kind: "ok" };
  } catch (err) {
    console.warn("Failed to save file:", err);
    return { kind: "error", message: friendlyMessage(err) };
  }
}

export async function saveTextFileAs(
  content: string,
  defaultName?: string,
  language: DocumentLanguage = "markdown",
): Promise<SaveAsResult> {
  let picked: string | null;
  try {
    picked = await save({
      filters: [...SAVE_FILTERS[language]],
      defaultPath: defaultName,
    });
  } catch (err) {
    console.warn("Save dialog failed:", err);
    return { kind: "error", message: friendlyMessage(err) };
  }

  if (picked === null) {
    return { kind: "cancelled" };
  }

  try {
    await invoke<void>("write_text_file_by_path", { path: picked, content });
    return { kind: "ok", name: basename(picked), path: picked };
  } catch (err) {
    console.warn("Failed to save file:", err);
    return { kind: "error", message: friendlyMessage(err) };
  }
}

/**
 * Fire `handler` whenever the user comes back to markpad from somewhere else.
 * This is the trigger for the external-change sweep (see lib/externalChange.ts):
 * the window regaining focus is the moment the file they just edited elsewhere
 * could have changed.
 *
 * Two sources, because neither alone is dependable across platforms: Tauri's own
 * `tauri://focus`, which reports OS window focus, and the webview's DOM `focus`,
 * which covers a webview that takes focus without the window event firing.
 * Duplicate fires are expected and harmless — the sweep coalesces them.
 */
export async function subscribeToAppFocus(
  handler: () => void,
): Promise<() => void> {
  const onDomFocus = () => handler();
  window.addEventListener("focus", onDomFocus);

  let unlistenTauri: (() => void) | null = null;
  try {
    unlistenTauri = await getCurrentWebviewWindow().onFocusChanged(
      ({ payload: focused }) => {
        if (focused) handler();
      },
    );
  } catch (err) {
    console.warn("Failed to subscribe to window focus:", err);
  }

  return () => {
    window.removeEventListener("focus", onDomFocus);
    unlistenTauri?.();
  };
}

export async function setWindowTitle(fileName: string | null): Promise<void> {
  try {
    const win = getCurrentWebviewWindow();
    await win.setTitle(fileName ? `${fileName} — MarkPad` : "MarkPad");
  } catch (err) {
    console.warn("Failed to set window title:", err);
  }
}
