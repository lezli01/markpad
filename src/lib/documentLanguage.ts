// Which language a document is edited as. markpad has exactly two: Markdown
// (the default) and JSON. The extension decides, but the user can override it
// per item via the pane-header toggle (e.g. to edit JSON pasted into an
// untitled draft before it has a path).

export type DocumentLanguage = "markdown" | "json";

export function languageFromPath(path: string | null): DocumentLanguage {
  return path !== null && /\.json$/i.test(path) ? "json" : "markdown";
}

export function resolveLanguage(
  path: string | null,
  override: DocumentLanguage | null,
): DocumentLanguage {
  return override ?? languageFromPath(path);
}

/** Validate a persisted value (session records survive schema drift). */
export function asDocumentLanguage(
  value: unknown,
): DocumentLanguage | null {
  return value === "markdown" || value === "json" ? value : null;
}
