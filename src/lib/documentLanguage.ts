// Which language a document is edited as. markpad has three: Markdown (the
// default) and the two data languages, JSON and YAML. The extension decides,
// but the user can override it per item via the pane-header toggle (e.g. to
// edit YAML pasted into an untitled draft before it has a path).

export type DocumentLanguage = "markdown" | "json" | "yaml";

/** The languages that are edited as data rather than prose: a linter, folding
    and the rewrite actions of their own toolbar, and no Markdown preview. */
export type DataLanguage = Exclude<DocumentLanguage, "markdown">;

/** Selectable order for the pane-header toggle. */
export const DOCUMENT_LANGUAGES: ReadonlyArray<DocumentLanguage> = [
  "markdown",
  "json",
  "yaml",
];

export const LANGUAGE_LABELS: Record<DocumentLanguage, string> = {
  markdown: "Markdown",
  json: "JSON",
  yaml: "YAML",
};

export function languageFromPath(path: string | null): DocumentLanguage {
  if (path === null) return "markdown";
  if (/\.json$/i.test(path)) return "json";
  if (/\.ya?ml$/i.test(path)) return "yaml";
  return "markdown";
}

export function resolveLanguage(
  path: string | null,
  override: DocumentLanguage | null,
): DocumentLanguage {
  return override ?? languageFromPath(path);
}

/** Whether the path's extension itself expresses a document language. Save-As
    drops a manual override only for such paths — an extensionless or unknown
    extension says nothing, so the user's explicit choice stands. */
export function hasLanguageExtension(path: string): boolean {
  return /\.(json|ya?ml|md|markdown)$/i.test(path);
}

/** Validate a persisted value (session records survive schema drift). */
export function asDocumentLanguage(value: unknown): DocumentLanguage | null {
  return value === "markdown" || value === "json" || value === "yaml"
    ? value
    : null;
}

/** Data languages share their editor shape: their own toolbar, folding, a
    linter, and no preview. Markdown is the only language with a preview. */
export function isDataLanguage(
  language: DocumentLanguage,
): language is DataLanguage {
  return language !== "markdown";
}

/** Extension the first Save of an untitled draft suggests. `.yaml` over `.yml`
    — the spelling yaml.org itself recommends; both open as YAML. */
export function defaultExtension(language: DocumentLanguage): string {
  return language === "json" ? "json" : language === "yaml" ? "yaml" : "md";
}
