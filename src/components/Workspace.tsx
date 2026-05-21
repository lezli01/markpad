import type { Ref } from "react";
import Editor, { type EditorHandle } from "./Editor";
import Preview, { type PreviewHandle } from "./Preview";
import type { ViewMode } from "../lib/preferences";

type WorkspaceProps = {
  text: string;
  viewMode: ViewMode;
  onTextChange: (next: string) => void;
  editorRef?: Ref<EditorHandle>;
  previewRef?: Ref<PreviewHandle>;
};

const islandCard =
  "flex-1 min-w-0 min-h-0 min-h-[200px] flex flex-col rounded-2xl bg-[color:var(--islands-surface)] ring-1 ring-[color:var(--islands-ring)] shadow-sm backdrop-blur overflow-hidden";

const islandLabel =
  "text-xs uppercase tracking-wide text-[color:var(--islands-muted)] px-4 pt-3 pb-1 select-none";

export default function Workspace({
  text,
  viewMode,
  onTextChange,
  editorRef,
  previewRef,
}: WorkspaceProps) {
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
        <div className={islandLabel}>Editor</div>
        <div className="flex-1 min-h-0 px-4 pb-4">
          <Editor ref={editorRef} value={text} onChange={onTextChange} />
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
