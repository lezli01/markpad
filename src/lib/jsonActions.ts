// Actions for JSON documents: the text transformations (format / minify /
// sort keys) plus the fold commands, dispatched onto the editor view. The
// text transformations are pure functions over strings so they can be unit
// tested without a DOM; runJsonAction is the thin CodeMirror adapter.
//
// Formatting goes through JSON.parse/JSON.stringify, which normalizes numbers
// to double precision and collapses duplicate keys — documented as a v1
// limitation in issue #59.

import type { EditorView } from "@codemirror/view";
import { foldAll, unfoldAll } from "@codemirror/language";

export type JsonTextAction = "format" | "minify" | "sortKeys";
export type JsonAction = JsonTextAction | "collapseAll" | "expandAll";

export type JsonTextResult =
  | { kind: "ok"; text: string }
  | { kind: "error"; message: string };

// Object.fromEntries (not property assignment) so a literal "__proto__" key
// stays an own data property instead of mutating the copy's prototype.
function sortValueDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValueDeep);
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, sortValueDeep(source[key])]),
    );
  }
  return value;
}

export function applyJsonTextAction(
  text: string,
  action: JsonTextAction,
): JsonTextResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { kind: "error", message: `Not valid JSON: ${detail}` };
  }
  const value = action === "sortKeys" ? sortValueDeep(parsed) : parsed;
  const out =
    action === "minify"
      ? JSON.stringify(value)
      : JSON.stringify(value, null, 2);
  // Keep the file's trailing newline (or absence of one) as-is.
  const trailingNewline = text.endsWith("\n") ? "\n" : "";
  return { kind: "ok", text: out + trailingNewline };
}

/**
 * Run a JSON action on the view. Returns an error message when the buffer is
 * not valid JSON (text actions only), null on success or no-op.
 */
export function runJsonAction(
  view: EditorView,
  action: JsonAction,
): string | null {
  if (action === "collapseAll") {
    foldAll(view);
    return null;
  }
  if (action === "expandAll") {
    unfoldAll(view);
    return null;
  }
  const current = view.state.doc.toString();
  const result = applyJsonTextAction(current, action);
  if (result.kind === "error") {
    return result.message;
  }
  if (result.text !== current) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: result.text },
      selection: { anchor: 0 },
      scrollIntoView: true,
    });
  }
  return null;
}
