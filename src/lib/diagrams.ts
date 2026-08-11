// Which fenced code blocks the preview draws as a picture instead of as source.
//
// Both engines run in-process — mermaid is JavaScript, and Graphviz is a
// JavaScript build of the real graphviz (@viz-js/viz) — so a diagram renders
// with no network round-trip. That is also why PlantUML and Kroki are absent:
// their renderers live on a server, and markpad is an offline desktop editor.
//
// This module is deliberately string-only (no DOM, no engine imports) so the
// markdown renderer can ask "is this fence a diagram?" without pulling either
// multi-megabyte engine into the startup bundle.

export type DiagramFormat = "mermaid" | "graphviz";

/**
 * Fence languages, lower-cased, that select an engine. `mermaid` is the tag
 * GitHub, GitLab and VS Code all use; `dot`/`graphviz`/`gv` are the three tags
 * in common use for DOT source.
 */
const FORMAT_BY_LANGUAGE: Readonly<Record<string, DiagramFormat>> = {
  mermaid: "mermaid",
  dot: "graphviz",
  graphviz: "graphviz",
  gv: "graphviz",
};

/** Engine name as shown to the user, e.g. in a render error. */
export const DIAGRAM_ENGINE_LABELS: Readonly<Record<DiagramFormat, string>> = {
  mermaid: "Mermaid",
  graphviz: "Graphviz",
};

/**
 * Resolve a fenced block's info string to an engine, or null when the block is
 * ordinary code. Only the first word is the language: the rest of the info
 * string is free-form metadata other tools attach (```mermaid title="Flow"), so
 * it is ignored rather than making the language unrecognizable.
 */
export function resolveDiagramFormat(info: string): DiagramFormat | null {
  const language = info.trim().split(/\s+/, 1)[0]?.toLowerCase();
  if (!language) return null;
  return FORMAT_BY_LANGUAGE[language] ?? null;
}

/** Narrow an unvalidated string (a DOM data attribute) to a DiagramFormat. */
export function isDiagramFormat(value: string): value is DiagramFormat {
  return value === "mermaid" || value === "graphviz";
}
