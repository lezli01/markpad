import { useCallback, useRef, useState, type RefObject } from "react";
import Editor, { type EditorHandle } from "./Editor";
import Preview, { type PreviewHandle } from "./Preview";
import FormatToolbar from "./FormatToolbar";
import JsonToolbar from "./JsonToolbar";
import type { FormatAction } from "../lib/formatActions";
import type { JsonAction } from "../lib/jsonActions";
import type { DocumentLanguage } from "../lib/documentLanguage";
import type { ViewMode } from "../lib/preferences";

type WorkspaceProps = {
  text: string;
  language: DocumentLanguage;
  viewMode: ViewMode;
  onTextChange: (next: string) => void;
  onFormat: (id: FormatAction) => void;
  onJsonAction: (id: JsonAction) => void;
  /** Parse-error message from a JSON action, or null on success (clears any
      previously shown banner). */
  onJsonActionResult: (error: string | null) => void;
  onLanguageChange: (language: DocumentLanguage) => void;
  modKey: string;
  /** Ref objects (not callback refs): scroll sync reads both handles here. */
  editorRef?: RefObject<EditorHandle | null>;
  previewRef?: RefObject<PreviewHandle | null>;
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

// The drop-down list of a native <select> is painted by the browser, outside our
// CSS tree, and it takes its surface from the control's own background. A
// transparent control therefore leaves the open list on the platform's default
// (light) palette even in the dark theme, so the background is set to the same
// --bg the pane already shows through it — identical when closed, themed when
// open — and the options carry the colors explicitly for the same reason.
const languageSelect =
  "shrink-0 rounded-md border border-[color:var(--border)] bg-[color:var(--bg)] px-1.5 py-1 text-xs font-medium text-[color:var(--muted)] hover:text-[color:var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] transition-colors";

const languageOption = "bg-[color:var(--bg)] text-[color:var(--text)]";

type SyncSource = "editor" | "preview";

export default function Workspace({
  text,
  language,
  viewMode,
  onTextChange,
  onFormat,
  onJsonAction,
  onJsonActionResult,
  onLanguageChange,
  modKey,
  editorRef,
  previewRef,
}: WorkspaceProps) {
  const [activeFormats, setActiveFormats] = useState<FormatAction[]>([]);

  // JSON documents are editor-only: the markdown preview would render the
  // buffer as markdown garbage, so it is never mounted and the view mode is
  // effectively "editor" regardless of the (untouched) saved preference.
  const isJson = language === "json";

  // Editor MUST stay mounted across every view-mode switch so CodeMirror's
  // selection, cursor, and undo history survive (per research.md §3, FR-012).
  // In "preview" mode it is hidden via Tailwind's `hidden` (display: none),
  // not unmounted. Preview is pure and may be conditionally rendered.
  const editorHidden = !isJson && viewMode === "preview";
  const previewMounted = !isJson && viewMode !== "editor";
  const isSplit = !isJson && viewMode === "split";

  // Scroll sync, split view only — with a single pane there is nothing to
  // follow.
  //
  // Moving one pane makes *that* pane fire its own scroll event, which would
  // bounce straight back and fight the user. The echo is recognised by value:
  // the position written to a pane is remembered, and that pane's next scroll
  // event is ignored if it reports exactly that position.
  //
  // Recognising it by time instead (hold a "who is driving" lock, release it
  // on the next animation frame) does not work. A programmatic scroll queues
  // its event for the *following* frame's scroll steps, and those run before
  // that frame's animation-frame callbacks, so the lock is already gone when
  // the echo lands — the driving pane then gets dragged off by however much
  // the mapping is not perfectly invertible (~180px in a mixed document).
  // Waiting an extra frame fixes the ordering but latches the lock forever
  // whenever frames stop arriving, e.g. while the window is hidden.
  const echoScrollTop = useRef<Record<SyncSource, number | null>>({
    editor: null,
    preview: null,
  });

  const syncFrom = useCallback(
    (source: SyncSource) => {
      const editor = editorRef?.current;
      const preview = previewRef?.current;
      if (!isSplit || !editor || !preview) return;
      const from = source === "editor" ? editor : preview;
      const to = source === "editor" ? preview : editor;
      const other: SyncSource = source === "editor" ? "preview" : "editor";

      if (echoScrollTop.current[source] === from.getScrollTop()) {
        echoScrollTop.current[source] = null; // our own write bouncing back
        return;
      }
      const line = from.getSyncLine();
      if (line === null) return;

      to.scrollToSyncLine(line);
      // Read back rather than trusting the requested offset: the browser
      // clamps at the ends of the scroll range, and the echo will report the
      // clamped value.
      echoScrollTop.current[other] = to.getScrollTop();
    },
    [isSplit, editorRef, previewRef],
  );

  const handleEditorScroll = useCallback(() => syncFrom("editor"), [syncFrom]);
  const handlePreviewScroll = useCallback(
    () => syncFrom("preview"),
    [syncFrom],
  );

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
          <div className="flex min-w-0 items-center gap-2">
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
              {isJson ? (
                <JsonToolbar onAction={onJsonAction} />
              ) : (
                <FormatToolbar
                  onFormat={onFormat}
                  modKey={modKey}
                  activeFormats={activeFormats}
                />
              )}
            </div>
            <select
              className={languageSelect}
              aria-label="Document language"
              title="Document language"
              value={language}
              onChange={(e) =>
                onLanguageChange(e.target.value as DocumentLanguage)
              }
            >
              <option className={languageOption} value="markdown">
                Markdown
              </option>
              <option className={languageOption} value="json">
                JSON
              </option>
            </select>
          </div>
        </div>
        <div className="flex-1 min-h-0 px-4 py-2">
          <Editor
            ref={editorRef}
            value={text}
            language={language}
            onChange={onTextChange}
            onActiveFormatsChange={setActiveFormats}
            onJsonActionResult={onJsonActionResult}
            onScroll={handleEditorScroll}
          />
        </div>
      </section>
      {previewMounted && (
        <section className={`${pane}${previewDivider}`} aria-label="Preview">
          <div className={paneHeader}>
            <span className={paneLabel}>Preview</span>
          </div>
          <div className="flex-1 min-h-0">
            <Preview
              ref={previewRef}
              markdown={text}
              onScroll={handlePreviewScroll}
            />
          </div>
        </section>
      )}
    </div>
  );
}
