// The DOM half of diagram support: find the placeholders markdown.ts left in
// the preview, and draw finished renders into them.
//
// Kept apart from diagramRenderer.ts so this side stays synchronous and
// engine-free — it is the part that has to be correct on every keystroke.

import { DIAGRAM_ENGINE_LABELS, isDiagramFormat } from "./diagrams";
import type { DiagramFormat } from "./diagrams";
import type { DiagramResult } from "./diagramRenderer";
import type { Theme } from "./preferences";

/** Class on the placeholder element markdown.ts emits for a diagram fence. */
export const DIAGRAM_CLASS = "markpad-diagram";
/** Class on the child the SVG (or the error) is drawn into. */
export const DIAGRAM_VIEW_CLASS = "markpad-diagram-view";
/** Class on the child holding the verbatim diagram source. */
export const DIAGRAM_SOURCE_CLASS = "markpad-diagram-source";

export type DiagramSlot = {
  element: HTMLElement;
  format: DiagramFormat;
  source: string;
};

/**
 * Every diagram in `container` that is not already drawn for `theme`: the
 * placeholders of freshly rendered markdown, plus anything still showing the
 * other theme's colours after a theme switch.
 *
 * The source is read back out of the DOM rather than passed alongside the HTML
 * because it cannot live in an attribute: DOMPurify strips any attribute whose
 * value contains `-->`, and that is the most common token in a mermaid diagram.
 * A text node round-trips through the sanitizer untouched.
 */
export function findDiagramSlots(
  container: ParentNode,
  theme: Theme,
): DiagramSlot[] {
  const slots: DiagramSlot[] = [];
  for (const element of container.querySelectorAll<HTMLElement>(
    `.${DIAGRAM_CLASS}`,
  )) {
    if (element.dataset.diagramTheme === theme) continue; // already drawn
    const format = element.dataset.diagramFormat ?? "";
    const source = element.querySelector(`.${DIAGRAM_SOURCE_CLASS}`)?.textContent;
    if (!isDiagramFormat(format) || source === null || source === undefined) {
      continue;
    }
    slots.push({ element, format, source });
  }
  return slots;
}

/**
 * Draw a render into its placeholder. Idempotent, and safe to call again for a
 * different theme: only the view child is rewritten, so the source text stays
 * available for the next redraw.
 */
export function paintDiagram(
  { element, format }: DiagramSlot,
  theme: Theme,
  result: DiagramResult,
): void {
  const view = element.querySelector(`.${DIAGRAM_VIEW_CLASS}`);
  if (view === null) return;
  element.dataset.diagramTheme = theme;
  if (result.ok) {
    element.dataset.diagramState = "ready";
    // Sanitized by diagramRenderer before it was cached.
    view.innerHTML = result.svg;
    return;
  }
  // The stylesheet reveals the source block in this state, so the user can see
  // which diagram failed and where.
  element.dataset.diagramState = "error";
  const message = document.createElement("p");
  message.className = "markpad-diagram-message";
  message.textContent = `${DIAGRAM_ENGINE_LABELS[format]} could not draw this diagram — ${result.message}`;
  view.replaceChildren(message);
}
