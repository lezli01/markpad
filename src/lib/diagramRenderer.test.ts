import { describe, it, expect, beforeEach } from "vitest";
import {
  peekDiagram,
  renderDiagram,
  resetDiagramCache,
} from "./diagramRenderer";

// These run the real Graphviz engine: @viz-js/viz is a JavaScript build of
// graphviz that lays out its own text, so it works headlessly under jsdom.
//
// Mermaid deliberately has no unit tests here — it measures every label with
// getBBox() against real layout, which jsdom does not implement, so it can only
// be exercised in the app itself. Everything around it (fence detection,
// placeholder mounting, caching, sanitization) is covered by these tests and
// diagramMount.test.ts.
describe("renderDiagram — Graphviz", () => {
  beforeEach(() => {
    resetDiagramCache();
  });

  it("renders DOT source to an SVG element", async () => {
    const result = await renderDiagram("graphviz", "light", "digraph { a -> b }");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg.startsWith("<svg")).toBe(true);
    expect(result.svg).toContain("viewBox");
  });

  it("drops the standalone document's XML prolog and doctype", async () => {
    // Graphviz emits a full SVG document; this one is inlined into the
    // preview's HTML, where a prolog and a doctype have no meaning.
    const result = await renderDiagram("graphviz", "light", "graph { a -- b }");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain("<?xml");
    expect(result.svg.toLowerCase()).not.toContain("<!doctype");
  });

  it("sanitizes the engine's output", async () => {
    // A DOT node URL becomes an <a xlink:href> in the SVG, so a javascript:
    // URL in an opened document is a real injection route into the preview.
    const result = await renderDiagram(
      "graphviz",
      "light",
      'digraph { a [URL="javascript:alert(1)"]; b [URL="https://example.com"]; a -> b }',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toMatch(/javascript:/i);
    expect(result.svg).toContain("https://example.com"); // real links survive
  });

  it("draws the two themes differently", async () => {
    const source = "digraph { a -> b }";
    const light = await renderDiagram("graphviz", "light", source);
    const dark = await renderDiagram("graphviz", "dark", source);
    expect(light.ok && dark.ok).toBe(true);
    if (!light.ok || !dark.ok) return;
    expect(dark.svg).not.toBe(light.svg);
    // Graphviz would otherwise paint an opaque white page behind the graph.
    expect(dark.svg).not.toContain('fill="white"');
  });

  it("reports a syntax error instead of rejecting", async () => {
    const result = await renderDiagram("graphviz", "light", "digraph { a -> ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/syntax error/i);
  });

  it("caches by source, theme and engine", async () => {
    const source = "digraph { cached -> once }";
    expect(peekDiagram("graphviz", "light", source)).toBeUndefined();

    const first = await renderDiagram("graphviz", "light", source);
    expect(peekDiagram("graphviz", "light", source)).toBe(first);
    // A repeat render must be the very same result, not a second layout pass.
    expect(await renderDiagram("graphviz", "light", source)).toBe(first);

    // The other theme and a changed source are different diagrams.
    expect(peekDiagram("graphviz", "dark", source)).toBeUndefined();
    expect(peekDiagram("graphviz", "light", source + " ")).toBeUndefined();
  });

  it("caches a failure too, so a broken diagram is not retried per keystroke", async () => {
    const broken = "digraph { oops -> ";
    const first = await renderDiagram("graphviz", "light", broken);
    expect(peekDiagram("graphviz", "light", broken)).toBe(first);
  });

  it("shares one render between concurrent requests for the same diagram", async () => {
    const source = "digraph { shared -> work }";
    const [a, b] = await Promise.all([
      renderDiagram("graphviz", "light", source),
      renderDiagram("graphviz", "light", source),
    ]);
    expect(a).toBe(b);
  });
});
