import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import DOMPurify from "dompurify";
import { resolveDiagramFormat } from "./diagrams";
import {
  DIAGRAM_CLASS,
  DIAGRAM_SOURCE_CLASS,
  DIAGRAM_VIEW_CLASS,
} from "./diagramMount";

/**
 * Turn heading text into a slug `id`, GitHub-style: lowercase, drop everything
 * that is not a letter/number/space/hyphen, then collapse whitespace runs to
 * single hyphens. Unicode letters are kept (valid in HTML ids).
 *
 * Preview.tsx runs this SAME function over a clicked link's fragment, so a
 * hand-written anchor resolves to its heading regardless of punctuation or
 * smart-quote differences — `#q&a`, `#Q&A`, and a generated `#qa` all reach the
 * "Q&A" heading, and `#don't` reaches a "Don't" heading even though the
 * typographer curls the apostrophe in the rendered text. It stays encoding-free
 * (no `encodeURIComponent`) on purpose: markdown-it's link normalizer and the
 * browser percent-encode punctuation differently, so an encoded id and an
 * encoded href would not compare equal — normalizing both sides by stripping
 * punctuation instead makes them byte-identical.
 */
export function headingSlug(text: string): string {
  return String(text)
    .normalize("NFC") // unify decomposed vs precomposed accents (café)
    .trim()
    .toLowerCase()
    // Any Unicode dash → ASCII hyphen FIRST, so it survives as a separator:
    // typographer rewrites "--"/"---" in heading text to en/em dashes, which
    // would otherwise be stripped below and fuse the surrounding words.
    .replace(/\p{Pd}/gu, "-")
    .replace(/[^\p{L}\p{N} \t\r\n-]/gu, "") // keep letters, numbers, ws, hyphen
    .replace(/\s+/g, "-") // whitespace runs → single hyphen
    .replace(/-+/g, "-") // collapse hyphen runs
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
});

// markdown-it 15 ships linkify-it v6, which turned fuzzy links OFF by default.
// Without this, `www.example.com` and bare domains like `example.com/docs` stop
// being links in the preview — they were linked before, and GitHub's renderer
// links them too, so keep the pre-15 behaviour. Scheme URLs, `<...>` autolinks
// and emails are unaffected either way; a TLD is still required, so `file.txt`
// and `3.50` are not linkified.
md.linkify.set({ fuzzyLink: true });

// Give every heading a slug `id` so in-document links (a table of contents such
// as `[Intro](#intro)`) have a target to scroll to. markdown-it-anchor
// de-duplicates repeated slugs (e.g. a second "Intro" becomes "intro-1").
md.use(anchor, { slugify: headingSlug });

/**
 * Stamp every rendered block with the 1-based source line it started on. These
 * are the anchors the split-view scroll sync interpolates between (see
 * scrollSync.ts): without them the preview can only be scrolled by pixel ratio,
 * which drifts wherever the two panes disagree about height.
 *
 * Block tokens carry `map` (a [startLine, endLine) pair); inline tokens and
 * closing tags do not get an attribute, and `hidden` tokens (the implicit
 * paragraphs of a tight list) render no tag to carry one. A raw `html_block`
 * also renders its content verbatim and silently drops the attribute — the
 * surrounding anchors keep the interpolation sane across that gap.
 */
md.core.ruler.push("source_line", (state) => {
  for (const token of state.tokens) {
    if (token.type === "inline" || token.hidden) continue;
    if (token.nesting < 0 || !token.map) continue;
    token.attrSet("data-source-line", String(token.map[0] + 1));
  }
});

/**
 * A fenced block in a diagram language becomes a placeholder that <Preview />
 * fills in asynchronously (see diagramMount.ts): drawing a diagram needs a real
 * DOM to measure text in, which this pure string pass does not have, and the
 * engines are megabytes that should not load until a document actually uses one.
 *
 * The source is emitted as the text of a `<pre>` inside the placeholder — not as
 * a data attribute — because DOMPurify strips any attribute whose value contains
 * `-->`, and that is the most common token in a mermaid diagram. Keeping it in
 * the DOM (rather than only in the markdown) is what lets the preview redraw a
 * diagram on a theme change without re-parsing the document.
 *
 * Anything that is not a diagram language falls through to markdown-it's own
 * fence rendering, so ordinary code blocks are untouched.
 */
const renderCodeFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const format = resolveDiagramFormat(md.utils.unescapeAll(token.info));
  if (!format || !renderCodeFence) {
    return renderCodeFence?.(tokens, idx, options, env, self) ?? "";
  }
  // The source_line rule above put the anchor on the token; carry it onto the
  // placeholder so split-view scroll sync still has a landmark here.
  const line = token.attrGet("data-source-line");
  const lineAttr =
    line === null ? "" : ` data-source-line="${md.utils.escapeHtml(String(line))}"`;
  return (
    `<div class="${DIAGRAM_CLASS}" data-diagram-format="${format}"` +
    ` data-diagram-state="pending"${lineAttr}>` +
    `<div class="${DIAGRAM_VIEW_CLASS}"></div>` +
    `<pre class="${DIAGRAM_SOURCE_CLASS}"><code>` +
    md.utils.escapeHtml(token.content) +
    `</code></pre></div>\n`
  );
};

export function renderMarkdown(source: string): string {
  // Keep the heading `id`s markdown-it-anchor adds; DOMPurify allows `id` by
  // default, but be explicit so a future config change can't silently break
  // anchor navigation. `data-source-line` rides on DOMPurify's ALLOW_DATA_ATTR
  // (on by default) and is listed for the same reason, as are the diagram
  // placeholder's attributes.
  return DOMPurify.sanitize(md.render(source), {
    ADD_ATTR: [
      "id",
      "data-source-line",
      "data-diagram-format",
      "data-diagram-state",
    ],
  });
}
