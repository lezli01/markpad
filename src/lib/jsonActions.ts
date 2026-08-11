// The text transformations behind the JSON toolbar actions: format, minify and
// sort keys. Pure functions over strings, so they can be unit tested without a
// DOM; dataActions.ts is the thin CodeMirror adapter that dispatches them (and
// the fold commands) onto a view.
//
// Formatting goes through JSON.parse/JSON.stringify, which normalizes numbers
// to double precision and collapses duplicate keys — documented as a v1
// limitation in issue #59.

export type JsonTextAction = "format" | "minify" | "sortKeys";

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
