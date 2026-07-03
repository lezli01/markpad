import { useState, type Ref } from "react";
import Editor, { type EditorHandle } from "./Editor";
import Preview, { type PreviewHandle } from "./Preview";
import FormatToolbar from "./FormatToolbar";
import type { FormatAction } from "../lib/formatActions";
import type { ViewMode } from "../lib/preferences";

type WorkspaceProps = {
  text: string;
  viewMode: ViewMode;
  onTextChange: (next: string) => void;
  onFormat: (id: FormatAction) => void;
  modKey: string;
  editorRef?: Ref<EditorHandle>;
  previewRef?: Ref<PreviewHandle>;
};

// Flat, edge-to-edge panes (no rounded "island" cards, no gaps). Panes share the
// main surface and are separated only by a hairline divider in split view.
const pane =
  "flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-[color:var(--bg)]";

// Fixed-height header so the editor's format toolbar and the preview's label
// line up their bottom borders exactly, regardless of which controls each holds.
const paneHeader =
  "flex items-center justify-between gap-2 px-4 h-11 shrink-0 border-b border-[color:var(--border)]";

const paneLabel =
  "shrink-0 text-xs font-medium uppercase tracking-wide text-[color:var(--muted)] select-none";

export default function Workspace({
  text,
  viewMode,
  onTextChange,
  onFormat,
  modKey,
  editorRef,
  previewRef,
}: WorkspaceProps) {
  const [activeFormats, setActiveFormats] = useState<FormatAction[]>([]);

  // Editor MUST stay mounted across every view-mode switch so CodeMirror's
  // selection, cursor, and undo history survive (per research.md §3, FR-012).
  // In "preview" mode it is hidden via Tailwind's `hidden` (display: none),
  // not unmounted. Preview is pure and may be conditionally rendered.
  const editorHidden = viewMode === "preview";
  const previewMounted = viewMode !== "editor";
  const isSplit = viewMode === "split";

  const layoutClass = isSplit
    ? "flex flex-col md:flex-row h-full"
    : "flex flex-col h-full";

  // The divider lives on the preview pane and only appears in split view, so a
  // single visible pane never shows a stray edge line.
  const previewDivider = isSplit
    ? " border-t border-[color:var(--border)] md:border-t-0 md:border-l"
    : "";

  return (
    <div className={layoutClass}>
      <section
        className={`${pane}${editorHidden ? " hidden" : ""}`}
        aria-label="Editor"
      >
        <div className={paneHeader}>
          <span className={paneLabel}>Editor</span>
          {/* Toolbar stays a single row and scrolls sideways when the pane is
              too narrow, so the header height (and its border) never shifts.
              p-1 keeps each button's focus ring from being clipped by the
              scroll container; the wheel handler lets a plain vertical mouse
              wheel reach the toolbar while its scrollbar is hidden. */}
          <div
            className="min-w-0 overflow-x-auto no-scrollbar p-1"
            onWheel={(e) => {
              if (e.deltaY !== 0 && e.deltaX === 0) {
                e.currentTarget.scrollLeft += e.deltaY;
              }
            }}
          >
            <FormatToolbar
              onFormat={onFormat}
              modKey={modKey}
              activeFormats={activeFormats}
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 px-4 py-2">
          <Editor
            ref={editorRef}
            value={text}
            onChange={onTextChange}
            onActiveFormatsChange={setActiveFormats}
          />
        </div>
      </section>
      {previewMounted && (
        <section className={`${pane}${previewDivider}`} aria-label="Preview">
          <div className={paneHeader}>
            <span className={paneLabel}>Preview</span>
          </div>
          <div className="flex-1 min-h-0">
            <Preview ref={previewRef} markdown={text} />
          </div>
        </section>
      )}
    </div>
  );
}
