// The `yaml` package boundary: the text transformations behind the YAML
// toolbar actions (format / sort keys), the JSON → YAML conversion behind
// paste, and the diagnostics behind the linter. No other module imports `yaml`.
//
// Everything here goes through the package's *document model* rather than
// parse-to-JS-and-dump, so comments, anchors, tags, block literals, the
// author's flow/block choices and multi-document (`---`) structure all survive
// the round trip — a Format that silently dropped every comment would be worse
// than no Format at all.
//
// All three entry points are pure functions of the buffer text, so they unit
// test without a DOM; dataActions.ts is the CodeMirror adapter.

import type { Diagnostic } from "@codemirror/lint";
import {
  isMap,
  isScalar,
  isSeq,
  parseAllDocuments,
  stringify,
  type Document,
  type YAMLError,
  type YAMLWarning,
} from "yaml";

export type YamlTextAction = "format" | "sortKeys";

export type YamlTextResult =
  | { kind: "ok"; text: string }
  | { kind: "error"; message: string };

// lineWidth 0 disables line folding: a long value keeps its own line instead of
// being re-wrapped, which is what an editor's Format should do. 2-space indent
// matches the JSON actions and the app's own sources.
const STRINGIFY = { indent: 2, lineWidth: 0 } as const;

/** The parser appends the offending line and a caret to every message
    ("... at line 3, column 1:\n\n a: 1\n^\n"). The editor shows the position
    itself, so keep the sentence and drop the excerpt. */
function shortMessage(err: YAMLError | YAMLWarning): string {
  return err.message.replace(/ at line \d+, column \d+:[\s\S]*$/, "");
}

/** Sort every mapping's entries by key, depth-first, in place. Comments and
    blank lines are attached to the `Pair` nodes, so they travel with their
    entry. Sequences keep their order — it is data in YAML, as in JSON. */
function sortNodeDeep(node: unknown): void {
  if (isMap(node)) {
    // A mapping with a non-scalar key (`? [a, b]: …`) is left as it is rather
    // than sorted on a stringified key nobody would recognize.
    if (node.items.every((pair) => isScalar(pair.key))) {
      node.items.sort((a, b) => {
        const x = String(isScalar(a.key) ? a.key.value : "");
        const y = String(isScalar(b.key) ? b.key.value : "");
        return x < y ? -1 : x > y ? 1 : 0;
      });
    }
    for (const pair of node.items) sortNodeDeep(pair.value);
    return;
  }
  if (isSeq(node)) {
    for (const item of node.items) sortNodeDeep(item);
  }
}

/** Serialize the parsed documents back out. Each document stringifies with its
    own `---` / `...` markers, so concatenating the parts reproduces a
    multi-document file exactly. */
function serialize(docs: Document[], source: string): YamlTextResult {
  let out: string;
  try {
    out = docs.map((doc) => doc.toString(STRINGIFY)).join("");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { kind: "error", message: `Could not rewrite this YAML: ${detail}` };
  }
  // The serializer always ends on a newline; keep the file's own choice.
  return {
    kind: "ok",
    text: source.endsWith("\n") ? out : out.replace(/\n$/, ""),
  };
}

export function applyYamlTextAction(
  text: string,
  action: YamlTextAction,
): YamlTextResult {
  const docs = parseAllDocuments(text);
  const broken = docs.find((doc) => doc.errors.length > 0);
  if (broken) {
    return {
      kind: "error",
      message: `Not valid YAML: ${shortMessage(broken.errors[0])}`,
    };
  }
  // Nothing but comments, directives or whitespace: there is no content to
  // rewrite, and serializing would materialize an explicit `null`.
  if (docs.every((doc) => doc.contents === null)) {
    return { kind: "ok", text };
  }
  if (action === "sortKeys") {
    for (const doc of docs) sortNodeDeep(doc.contents);
  }
  return serialize(docs, text);
}

/**
 * Convert JSON text to YAML. Used by paste: JSON is valid YAML, so pasting it
 * verbatim would "work" — and leave a JSON-shaped document in a YAML file.
 * Rebuilding from the parsed value (rather than reserializing the parsed YAML)
 * is what turns flow style into block style.
 */
export function jsonToYaml(json: string): YamlTextResult {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { kind: "error", message: `Not valid JSON: ${detail}` };
  }
  // A bare scalar (`42`, `"note"`) is already its own YAML document; converting
  // it would only add a trailing newline, so it is not worth surprising anyone.
  if (value === null || typeof value !== "object") {
    return { kind: "error", message: "Not a JSON object or array." };
  }
  try {
    return { kind: "ok", text: stringify(value, STRINGIFY) };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { kind: "error", message: `Could not convert to YAML: ${detail}` };
  }
}

/**
 * Diagnostics for the editor's linter. Errors (and the parser's warnings, e.g.
 * an unknown directive) carry `pos` offsets into the buffer, so they map
 * straight onto CodeMirror ranges.
 */
export function yamlDiagnostics(text: string): Diagnostic[] {
  // A brand-new empty YAML draft is not a mistake.
  if (text.trim() === "") return [];
  const out: Diagnostic[] = [];
  for (const doc of parseAllDocuments(text)) {
    for (const err of doc.errors) {
      out.push(toDiagnostic(err, "error", text.length));
    }
    for (const warning of doc.warnings) {
      out.push(toDiagnostic(warning, "warning", text.length));
    }
  }
  return out;
}

function toDiagnostic(
  err: YAMLError | YAMLWarning,
  severity: "error" | "warning",
  length: number,
): Diagnostic {
  const from = Math.min(err.pos[0], length);
  // Zero-width ranges draw nothing; a parse error at the very end of the buffer
  // reports one, so widen it back over the last character.
  const to = Math.min(Math.max(err.pos[1], from + 1), length);
  return {
    from: Math.min(from, Math.max(0, to - 1)),
    to,
    severity,
    message: shortMessage(err),
  };
}
