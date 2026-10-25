// What a click on a link in the preview should do. The preview must never
// navigate the app's own window (see navigation.rs for the native backstop), so
// every link resolves to one of four outcomes.

import { hasLanguageExtension } from "./documentLanguage";

export type LinkAction =
  /** `#heading`: scroll the preview to it. Carries the raw fragment. */
  | { kind: "anchor"; fragment: string }
  /** A web, mail or phone link: hand it to the system's default handler. */
  | { kind: "external"; url: string }
  /** Another document markpad can edit: open it as an item of its own. */
  | { kind: "document"; path: string }
  /** Anything else — a non-document file, `javascript:` … — does nothing. */
  | { kind: "blocked" };

const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

// A scheme is two or more characters, so a Windows drive (`C:\notes.md`) is
// read as a path, not as a URL with scheme "c".
const SCHEME = /^[a-z][a-z\d+.-]+:/i;

/**
 * @param documentPath the file the preview is showing, which relative links
 *   resolve against; null for an untitled document, which has no folder.
 */
export function resolveLinkAction(
  href: string,
  documentPath: string | null,
): LinkAction {
  const trimmed = href.trim();
  if (trimmed.startsWith("#")) {
    return { kind: "anchor", fragment: trimmed.slice(1) };
  }
  if (trimmed === "") return { kind: "blocked" };

  if (SCHEME.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return { kind: "blocked" };
    }
    if (EXTERNAL_PROTOCOLS.has(url.protocol)) {
      return { kind: "external", url: url.href };
    }
    if (url.protocol === "file:") {
      return documentAction(fileUrlToPath(url));
    }
    return { kind: "blocked" };
  }

  // A bare path. Drop the `#heading` / `?query` it may carry, and undo the
  // %-escaping markdown-it applies to spaces and non-ASCII characters.
  let path = trimmed.replace(/[?#].*$/, "");
  try {
    path = decodeURIComponent(path);
  } catch {
    // Malformed %-sequence — use the path as written.
  }
  if (isAbsolutePath(path)) return documentAction(path);
  if (documentPath === null) return { kind: "blocked" };
  return documentAction(joinPath(documentPath, path));
}

function documentAction(path: string | null): LinkAction {
  return path !== null && hasLanguageExtension(path)
    ? { kind: "document", path }
    : { kind: "blocked" };
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[a-z]:[\\/]/i.test(path) || path.startsWith("\\\\");
}

function fileUrlToPath(url: URL): string | null {
  // Only local files: `file://server/share` would reach out over the network.
  if (url.host !== "" && url.host !== "localhost") return null;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  // file:///C:/notes.md → C:/notes.md
  return /^\/[a-z]:\//i.test(path) ? path.slice(1) : path;
}

/**
 * Resolve `relative` against the folder holding `documentPath`, folding `.` and
 * `..`. Uses the separator the document path itself uses, so a Windows path
 * stays a Windows path.
 */
export function joinPath(documentPath: string, relative: string): string {
  const separator =
    documentPath.lastIndexOf("\\") > documentPath.lastIndexOf("/") ? "\\" : "/";
  const parts = documentPath.split(/[\\/]/);
  parts.pop(); // the document's own file name
  for (const segment of relative.split(/[\\/]/)) {
    if (segment === "" || segment === ".") continue;
    // Never climb above the root ("" for "/…", the drive for "C:\…").
    if (segment === "..") {
      if (parts.length > 1) parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join(separator);
}

const XLINK_NS = "http://www.w3.org/1999/xlink";

/**
 * The link an event happened inside, with its href, if any. Covers HTML `<a>`
 * and image-map `<area>` from raw HTML, and the SVG `<a>` a Graphviz `URL=`
 * attribute renders, which may carry its target as `xlink:href`.
 */
export function findLink(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const link = target.closest("a, area");
  if (!link) return null;
  return link.getAttribute("href") ?? link.getAttributeNS(XLINK_NS, "href");
}
