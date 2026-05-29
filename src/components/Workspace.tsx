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

const islandCard =
  "flex-1 min-w-0 min-h-0 min-h-[200px] flex flex-col rounded-2xl bg-[color:var(--islands-surface)] ring-1 ring-[color:var(--islands-ring)] shadow-sm backdrop-blur overflow-hidden";

const islandLabel =
  "text-xs uppercase tracking-wide text-[color:var(--islands-muted)] px-4 pt-3 pb-1 select-none";

// The editor island's header carries the formatting toolbar alongside the
// label, so it inherits the section's `hidden` in preview mode (below) for free.
const editorHeader = "flex items-center justify-between gap-2 px-4 pt-3 pb-2";

const islandLabelInline =
  "text-xs uppercase tracking-wide text-[color:var(--islands-muted)] select-none";

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

  // Responsive stacking from Feature 002 only applies in split mode.
  const layoutClass =
    viewMode === "split"
      ? "flex flex-col md:flex-row gap-4 h-full"
      : "flex flex-col gap-4 h-full";

  return (
    <div className={layoutClass}>
      <section
        className={`${islandCard}${editorHidden ? " hidden" : ""}`}
        aria-label="Editor"
      >
        <div className={editorHeader}>
          <span className={islandLabelInline}>Editor</span>
          <FormatToolbar
            onFormat={onFormat}
            modKey={modKey}
            activeFormats={activeFormats}
          />
        </div>
        <div className="flex-1 min-h-0 px-4 pb-4">
          <Editor
            ref={editorRef}
            value={text}
            onChange={onTextChange}
            onActiveFormatsChange={setActiveFormats}
          />
        </div>
      </section>
      {previewMounted && (
        <section className={islandCard} aria-label="Preview">
          <div className={islandLabel}>Preview</div>
          <div className="flex-1 min-h-0">
            <Preview ref={previewRef} markdown={text} />
          </div>
        </section>
      )}
    </div>
  );
}
