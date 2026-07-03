import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import DOMPurify from "dompurify";

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
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
});

// Give every heading a slug `id` so in-document links (a table of contents such
// as `[Intro](#intro)`) have a target to scroll to. markdown-it-anchor
// de-duplicates repeated slugs (e.g. a second "Intro" becomes "intro-1").
md.use(anchor, { slugify: headingSlug });

export function renderMarkdown(source: string): string {
  // Keep the heading `id`s markdown-it-anchor adds; DOMPurify allows `id` by
  // default, but be explicit so a future config change can't silently break
  // anchor navigation.
  return DOMPurify.sanitize(md.render(source), { ADD_ATTR: ["id"] });
}
