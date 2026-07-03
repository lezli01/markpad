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
