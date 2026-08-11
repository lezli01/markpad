import { describe, it, expect } from "vitest";
import { isDiagramFormat, resolveDiagramFormat } from "./diagrams";

describe("resolveDiagramFormat", () => {
  it("recognizes the mermaid fence tag", () => {
    expect(resolveDiagramFormat("mermaid")).toBe("mermaid");
  });

  it("recognizes all three tags in use for DOT source", () => {
    expect(resolveDiagramFormat("dot")).toBe("graphviz");
    expect(resolveDiagramFormat("graphviz")).toBe("graphviz");
    expect(resolveDiagramFormat("gv")).toBe("graphviz");
  });

  it("ignores case and surrounding whitespace", () => {
    expect(resolveDiagramFormat("  Mermaid  ")).toBe("mermaid");
    expect(resolveDiagramFormat("DOT")).toBe("graphviz");
  });

  it("reads only the first word, so trailing fence metadata is harmless", () => {
    // Other tools attach attributes after the language; that must not make the
    // language unrecognizable.
    expect(resolveDiagramFormat('mermaid title="Architecture"')).toBe("mermaid");
  });

  it("returns null for ordinary code languages and for a bare fence", () => {
    expect(resolveDiagramFormat("ts")).toBeNull();
    expect(resolveDiagramFormat("json")).toBeNull();
    expect(resolveDiagramFormat("")).toBeNull();
    expect(resolveDiagramFormat("   ")).toBeNull();
    // Not a prefix match: a language that merely starts with a diagram tag is
    // still ordinary code.
    expect(resolveDiagramFormat("dotenv")).toBeNull();
  });
});

describe("isDiagramFormat", () => {
  it("accepts exactly the engine names", () => {
    expect(isDiagramFormat("mermaid")).toBe(true);
    expect(isDiagramFormat("graphviz")).toBe(true);
  });

  it("rejects a fence alias or anything else read off the DOM", () => {
    // The data attribute holds the resolved engine, never the fence tag.
    expect(isDiagramFormat("dot")).toBe(false);
    expect(isDiagramFormat("")).toBe(false);
    expect(isDiagramFormat("Mermaid")).toBe(false);
  });
});
