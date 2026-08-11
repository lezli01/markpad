import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown";
import {
  DIAGRAM_SOURCE_CLASS,
  DIAGRAM_VIEW_CLASS,
  findDiagramSlots,
  paintDiagram,
} from "./diagramMount";

// The placeholders under test are the real output of renderMarkdown, so these
// tests cover the seam between the two modules: whatever markdown.ts emits has
// to be what findDiagramSlots can read back after DOMPurify has seen it.
function preview(markdown: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderMarkdown(markdown);
  return container;
}

const FLOWCHART = "```mermaid\nflowchart TB\n    A --> B\n```\n";

describe("findDiagramSlots", () => {
  it("finds a diagram fence with its engine and verbatim source", () => {
    const slots = findDiagramSlots(preview(FLOWCHART), "light");
    expect(slots).toHaveLength(1);
    expect(slots[0].format).toBe("mermaid");
    expect(slots[0].source.trim()).toBe("flowchart TB\n    A --> B");
  });

  it("survives the arrows DOMPurify strips from attribute values", () => {
    // Regression: the source cannot live in a data attribute, because DOMPurify
    // drops any attribute whose value contains "-->" — which is the most common
    // token in a mermaid diagram. It rides in a text node for that reason.
    const source = findDiagramSlots(
      preview("```mermaid\nflowchart LR\n  A -->|no| B\n  B --> C\n```\n"),
      "light",
    )[0].source;
    expect(source).toContain("A -->|no| B");
    expect(source).toContain("B --> C");
  });

  it("finds a Graphviz fence under any of its aliases", () => {
    for (const tag of ["dot", "graphviz", "gv"]) {
      const slots = findDiagramSlots(
        preview("```" + tag + "\ndigraph { a -> b }\n```\n"),
        "light",
      );
      expect(slots).toHaveLength(1);
      expect(slots[0].format).toBe("graphviz");
    }
  });

  it("ignores ordinary code blocks", () => {
    expect(findDiagramSlots(preview("```ts\nconst a = 1;\n```\n"), "light"))
      .toHaveLength(0);
    expect(findDiagramSlots(preview("```\nplain\n```\n"), "light")).toHaveLength(
      0,
    );
  });

  it("skips a diagram already drawn for this theme, but not for the other one", () => {
    const container = preview(FLOWCHART);
    const slot = findDiagramSlots(container, "light")[0];
    paintDiagram(slot, "light", { ok: true, svg: "<svg></svg>" });

    expect(findDiagramSlots(container, "light")).toHaveLength(0);
    // A theme switch has to redraw: the SVG carries the old theme's colours.
    expect(findDiagramSlots(container, "dark")).toHaveLength(1);
  });
});

describe("paintDiagram", () => {
  it("draws the SVG into the view and leaves the source in the DOM", () => {
    const container = preview(FLOWCHART);
    const slot = findDiagramSlots(container, "dark")[0];
    paintDiagram(slot, "dark", { ok: true, svg: '<svg id="s"><g/></svg>' });

    const view = container.querySelector(`.${DIAGRAM_VIEW_CLASS}`);
    expect(view?.querySelector("svg")).not.toBeNull();
    expect(slot.element.dataset.diagramState).toBe("ready");
    expect(slot.element.dataset.diagramTheme).toBe("dark");
    // Kept for the next redraw (a theme switch does not re-parse the markdown).
    expect(
      container.querySelector(`.${DIAGRAM_SOURCE_CLASS}`)?.textContent,
    ).toContain("flowchart TB");
  });

  it("replaces the drawing when the same slot is painted again", () => {
    const container = preview(FLOWCHART);
    const slot = findDiagramSlots(container, "light")[0];
    paintDiagram(slot, "light", { ok: true, svg: '<svg id="first"></svg>' });
    paintDiagram(slot, "dark", { ok: true, svg: '<svg id="second"></svg>' });

    const svgs = container.querySelectorAll("svg");
    expect(svgs).toHaveLength(1);
    expect(svgs[0].id).toBe("second");
    expect(slot.element.dataset.diagramTheme).toBe("dark");
  });

  it("shows the engine's message on an error, and reveals the source", () => {
    const container = preview(FLOWCHART);
    const slot = findDiagramSlots(container, "light")[0];
    paintDiagram(slot, "light", { ok: false, message: "Parse error on line 2" });

    expect(slot.element.dataset.diagramState).toBe("error");
    const view = container.querySelector(`.${DIAGRAM_VIEW_CLASS}`);
    expect(view?.textContent).toContain("Mermaid");
    expect(view?.textContent).toContain("Parse error on line 2");
    // The stylesheet keys off the error state to show the source block.
    expect(container.querySelector(`.${DIAGRAM_SOURCE_CLASS}`)).not.toBeNull();
  });

  it("recovers when a failed diagram is fixed", () => {
    const container = preview(FLOWCHART);
    const slot = findDiagramSlots(container, "light")[0];
    paintDiagram(slot, "light", { ok: false, message: "boom" });
    paintDiagram(slot, "light", { ok: true, svg: "<svg></svg>" });

    expect(slot.element.dataset.diagramState).toBe("ready");
    expect(container.querySelector(".markpad-diagram-message")).toBeNull();
  });
});
