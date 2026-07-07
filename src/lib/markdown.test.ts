import { describe, it, expect } from "vitest";
import { headingSlug, renderMarkdown } from "./markdown";

// Runs under jsdom (see vitest.config.ts) so DOMPurify has a window.
describe("renderMarkdown — heading anchors", () => {
  it("gives headings a slug id so in-document links have a target", () => {
    const html = renderMarkdown("# Hello World");
    expect(html).toMatch(/<h1[^>]*>/);
    expect(html).toContain('id="hello-world"');
  });

  it("keeps the id (and link href) after DOMPurify sanitization", () => {
    const html = renderMarkdown("[Go to intro](#intro)\n\n## Intro");
    expect(html).toContain('href="#intro"');
    expect(html).toContain('id="intro"');
  });

  it("de-duplicates ids for repeated heading text", () => {
    const html = renderMarkdown("# Dup\n\n# Dup");
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBe(2);
    expect(ids).toContain("dup");
    expect(new Set(ids).size).toBe(ids.length); // every id is unique
  });

  it("assigns a heading with ASCII punctuation the id the slug resolves to", () => {
    // Regression: the id and a clicked fragment must normalize to the same slug.
    const html = renderMarkdown("## Q&A");
    expect(html).toContain(`id="${headingSlug("Q&A")}"`);
  });

  it("keeps a dash separator reachable when typographer turns -- into an en-dash", () => {
    // "before--after" becomes "before–after" in the rendered text; the slug must
    // still treat it as a separator so a "#before-after" link resolves.
    const html = renderMarkdown("# before--after");
    expect(html).toContain(`id="before-after"`);
    expect(headingSlug("before-after")).toBe("before-after");
  });
});

describe("headingSlug — heading id and clicked fragment agree", () => {
  it("normalizes ASCII punctuation identically on both sides", () => {
    // "Q&A" heading vs a hand-written "#q&a" link → same slug.
    expect(headingSlug("Q&A")).toBe("qa");
    expect(headingSlug("q&a")).toBe("qa");
    expect(headingSlug("A/B test")).toBe(headingSlug("a/b-test"));
    expect(headingSlug("FAQ: Setup")).toBe(headingSlug("faq:-setup"));
  });

  it("normalizes straight and curly/smart punctuation to the same slug", () => {
    // typographer curls the heading's apostrophe / dashes; the link fragment
    // stays straight — both must reach the same id.
    const curlyApostrophe = "Don" + String.fromCharCode(0x2019) + "t Panic";
    expect(headingSlug(curlyApostrophe)).toBe(headingSlug("Don't Panic"));
    const enDash = "Foo " + String.fromCharCode(0x2013) + " Bar";
    expect(headingSlug(enDash)).toBe(headingSlug("Foo -- Bar"));
  });

  it("treats unicode dashes as separators, not stripped punctuation", () => {
    expect(headingSlug("before" + String.fromCharCode(0x2013) + "after")).toBe(
      "before-after",
    ); // en-dash
    expect(headingSlug("in" + String.fromCharCode(0x2014) + "out")).toBe(
      "in-out",
    ); // em-dash
  });

  it("preserves unicode letters", () => {
    const cafe = "Caf" + String.fromCharCode(0xe9); // é (U+00E9)
    expect(headingSlug(cafe)).toBe(cafe.toLowerCase());
  });

  it("normalizes decomposed (NFD) and precomposed (NFC) accents to one slug", () => {
    const precomposed = "Caf" + String.fromCharCode(0xe9); // é as U+00E9
    const decomposed = "Cafe" + String.fromCharCode(0x301); // e + U+0301
    expect(headingSlug(decomposed)).toBe(headingSlug(precomposed));
  });

  it("is idempotent for an already-slugged fragment", () => {
    expect(headingSlug("hello-world")).toBe("hello-world");
  });
});

describe("renderMarkdown — sanitization & safe rendering", () => {
  it("renders basic inline markdown to HTML", () => {
    expect(renderMarkdown("*hi*")).toContain("<em>hi</em>");
    expect(renderMarkdown("**hi**")).toContain("<strong>hi</strong>");
  });

  it("renders raw HTML with sanitization (html:true)", () => {
    const html = renderMarkdown("<b>x</b> plain");
    expect(html).toContain("<b>x</b>");
    // Scripts are still stripped
    expect(html).not.toContain("<script>");
  });

  it("drops a <script> tag from the output", () => {
    const html = renderMarkdown("hi\n\n<script>alert(1)</script>");
    expect(html.toLowerCase()).not.toContain("<script");
  });

  it("never produces a javascript: link href", () => {
    const html = renderMarkdown("[click](javascript:alert(1))");
    expect(html).not.toMatch(/href\s*=\s*["']?\s*javascript:/i);
  });

  it("linkifies a bare URL", () => {
    const html = renderMarkdown("see https://example.com now");
    expect(html).toContain('href="https://example.com"');
  });
});

describe("in-document anchors — a rendered heading is reachable by a fragment slug", () => {
  // Mirrors Preview.tsx's click handler: resolve a clicked "#fragment" through
  // headingSlug and look for the matching heading id in the rendered HTML. This
  // locks the cross-module contract that a table-of-contents link finds its
  // heading despite punctuation or percent-encoding differences.
  const resolves = (source: string, fragment: string): boolean => {
    const container = document.createElement("div");
    container.innerHTML = renderMarkdown(source);
    let frag = fragment.replace(/^#/, "");
    try {
      frag = decodeURIComponent(frag);
    } catch {
      // Malformed %-sequence — fall back to the raw fragment (as Preview does).
    }
    const id = headingSlug(frag);
    // headingSlug only ever emits letters/digits/hyphens, so the id is always a
    // safe attribute-selector value (no CSS.escape needed, and jsdom's global
    // does not expose it anyway).
    return !!id && container.querySelector(`[id="${id}"]`) !== null;
  };

  it("matches a hand-written fragment despite punctuation and encoding", () => {
    const doc = "## Q&A\n\n### Foo Bar";
    expect(resolves(doc, "#q&a")).toBe(true); // punctuation differs from the id
    expect(resolves(doc, "#Foo%20Bar")).toBe(true); // percent-encoded space
    expect(resolves(doc, "#missing")).toBe(false); // no such heading
  });
});
