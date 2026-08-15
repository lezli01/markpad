import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import {
  Compartment,
  EditorState,
  Prec,
  type StateEffect,
} from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { json, jsonLanguage, jsonParseLinter } from "@codemirror/lang-json";
import { yaml, yamlLanguage } from "@codemirror/lang-yaml";
import { linter } from "@codemirror/lint";
import {
  foldGutter,
  foldKeymap,
  HighlightStyle,
  language as languageFacet,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
  type FormatAction,
  getActiveFormatActions,
  markdownFormattingKeymap,
  runFormatAction,
} from "../lib/formatActions";
import {
  isDataLanguage,
  type DocumentLanguage,
} from "../lib/documentLanguage";
import { runDataAction, type DataAction } from "../lib/dataActions";
import { jsonTypingExtensions } from "../lib/jsonAutoEdit";
import { yamlDiagnostics } from "../lib/yamlActions";
import { yamlTypingExtensions } from "../lib/yamlAutoEdit";
import {
  clearDocumentSearch,
  documentSearchExtension,
  getDocumentSearchStatus,
  moveDocumentSearch,
  setDocumentSearch,
  type SearchStatus,
} from "../lib/documentSearch";

export type EditorHandle = {
  getState(): EditorState;
  setState(state: EditorState): void;
  getScrollSnapshot(): StateEffect<unknown>;
  applyScrollSnapshot(effect: StateEffect<unknown>): void;
  format(action: FormatAction): void;
  runDataAction(action: DataAction): void;
  search(query: string): SearchStatus;
  findNext(): SearchStatus;
  findPrevious(): SearchStatus;
  clearSearch(): void;
  getSelectedText(): string;
  focus(): void;
  getScrollTop(): number;
  /** Source line shown at the top of the viewport, or null before mount. */
  getSyncLine(): number | null;
  scrollToSyncLine(line: number): void;
};

type EditorProps = {
  value: string;
  language: DocumentLanguage;
  onChange: (next: string) => void;
  onActiveFormatsChange?: (active: FormatAction[]) => void;
  /** Outcome of every JSON/YAML action: a parse-error message, or null on
      success so the app can clear a previously shown banner. The editor pane has
      no chrome of its own for messages. */
  onDataActionResult?: (error: string | null) => void;
  /** Active app-level query, reapplied after an external document replacement. */
  searchQuery?: string;
  /** Keeps the find bar's match counter in sync while the document changes. */
  onSearchResultChange?: (status: SearchStatus) => void;
  /** Fired on every scroll of the editor, user-driven or programmatic. */
  onScroll?: () => void;
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--text)",
    backgroundColor: "transparent",
  },
  // Drop CodeMirror's default dotted focus outline (the "select rectangle"
  // around the whole editor). Focus is already obvious from the caret; the
  // outline just clutters the flat, edge-to-edge pane.
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    fontFamily:
      'ui-monospace, "SF Mono", Monaco, Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: "14px",
    lineHeight: "1.6",
  },
  ".cm-content": {
    caretColor: "var(--accent)",
    padding: "0.5rem 0",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--accent)",
  },
  ".cm-searchMatch": {
    backgroundColor: "var(--accent-soft)",
    borderRadius: "2px",
    boxShadow: "inset 0 0 0 1px var(--accent)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "var(--selection)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    {
      backgroundColor: "var(--selection)",
    },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "none",
    color: "var(--muted)",
  },
  ".cm-activeLineGutter, .cm-activeLine": {
    backgroundColor: "transparent",
  },
  // The rules below only apply in JSON and YAML mode (markdown states include
  // no fold or lint extensions).
  ".cm-foldGutter .cm-gutterElement": {
    cursor: "pointer",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--accent-soft)",
    color: "var(--accent)",
    border: "none",
    borderRadius: "0.25rem",
    padding: "0 0.4em",
    margin: "0 0.2em",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--panel)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "0.375rem",
  },
});

// Syntax token colors come from CSS variables so the light/dark palettes in
// styles.css stay the single source of truth for theming.
const jsonHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--syntax-key)" },
  { tag: tags.string, color: "var(--syntax-string)" },
  { tag: tags.number, color: "var(--syntax-number)" },
  { tag: [tags.bool, tags.null], color: "var(--syntax-literal)" },
  { tag: [tags.separator, tags.bracket], color: "var(--muted)" },
]);

// The YAML parser reports what the grammar can know: a plain scalar is content
// whether it reads as a number or a word, so only quoted scalars are strings and
// there is no number or boolean token to color. Anchors, aliases and tags share
// the literal color — all three are references rather than data.
const yamlHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--syntax-key)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--syntax-string)" },
  { tag: tags.comment, color: "var(--syntax-comment)" },
  { tag: [tags.labelName, tags.typeName], color: "var(--syntax-literal)" },
  {
    tag: [
      tags.separator,
      tags.punctuation,
      tags.bracket,
      tags.meta,
      tags.keyword,
    ],
    color: "var(--muted)",
  },
]);

// Which language a state was built with. Identity check against the language
// facet, so snapshot-restored states report correctly without extra tracking.
function stateLanguage(state: EditorState): DocumentLanguage {
  const facet = state.facet(languageFacet);
  if (facet === jsonLanguage) return "json";
  if (facet === yamlLanguage) return "yaml";
  return "markdown";
}

// The per-language extension set lives in a compartment so a language toggle
// on the same document reconfigures in place — undo history, selection, and
// scroll survive. A full setState is reserved for real document swaps.
const perLanguageConf = new Compartment();

// jsonParseLinter flags an empty buffer ("Unexpected end of JSON input" at
// offset 0); a brand-new empty JSON draft shouldn't open with an error.
const jsonLinter = linter((view) =>
  view.state.doc.toString().trim() === "" ? [] : jsonParseLinter()(view),
);

const yamlLinter = linter((view) => yamlDiagnostics(view.state.doc.toString()));

const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  {
    value,
    language,
    onChange,
    onActiveFormatsChange,
    onDataActionResult,
    searchQuery,
    onSearchResultChange,
    onScroll,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onActiveFormatsChangeRef = useRef(onActiveFormatsChange);
  const onDataActionResultRef = useRef(onDataActionResult);
  const searchQueryRef = useRef(searchQuery);
  const onSearchResultChangeRef = useRef(onSearchResultChange);
  const onScrollRef = useRef(onScroll);
  const lastActiveKeyRef = useRef<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onActiveFormatsChangeRef.current = onActiveFormatsChange;
  }, [onActiveFormatsChange]);

  useEffect(() => {
    onDataActionResultRef.current = onDataActionResult;
  }, [onDataActionResult]);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  useEffect(() => {
    onSearchResultChangeRef.current = onSearchResultChange;
  }, [onSearchResultChange]);

  useEffect(() => {
    onScrollRef.current = onScroll;
  }, [onScroll]);

  // Recompute which toggle actions are active at the selection and notify the
  // toolbar, deduped so we don't re-render it on every keystroke that doesn't
  // change the active set. Markdown-only: the format toolbar is hidden for
  // data documents, and the toggle detection walks a markdown syntax tree.
  const emitActiveFormats = useCallback((state: EditorState) => {
    const cb = onActiveFormatsChangeRef.current;
    if (!cb) return;
    const active =
      stateLanguage(state) === "markdown" ? getActiveFormatActions(state) : [];
    const key = active.join("|");
    if (key === lastActiveKeyRef.current) return;
    lastActiveKeyRef.current = key;
    cb(active);
  }, []);

  const dispatchDataAction = useCallback(
    (view: EditorView, action: DataAction) => {
      const lang = stateLanguage(view.state);
      if (!isDataLanguage(lang)) return;
      // Always report — null on success clears a previously shown banner.
      onDataActionResultRef.current?.(runDataAction(view, lang, action));
    },
    [],
  );

  // Format wins over any default binding for the same chord. Shared by both
  // data languages — dispatchDataAction routes on the state's own language.
  const formatKeymap = useMemo(
    () =>
      Prec.high(
        keymap.of([
          {
            key: "Shift-Alt-f",
            run: (view: EditorView) => {
              dispatchDataAction(view, "format");
              return true;
            },
          },
        ]),
      ),
    [dispatchDataAction],
  );

  // The extensions that differ between languages, swapped via perLanguageConf.
  const languageExtensions = useCallback(
    (lang: DocumentLanguage) => {
      if (lang === "json") {
        return [
          formatKeymap,
          keymap.of([...foldKeymap]),
          jsonTypingExtensions(),
          json(),
          jsonLinter,
          syntaxHighlighting(jsonHighlightStyle),
          foldGutter(),
        ];
      }
      if (lang === "yaml") {
        return [
          formatKeymap,
          keymap.of([...foldKeymap]),
          yamlTypingExtensions(),
          yaml(),
          yamlLinter,
          syntaxHighlighting(yamlHighlightStyle),
          foldGutter(),
        ];
      }
      return [
        // Formatting shortcuts (Mod-b, Mod-i, …) take precedence so
        // they win over any default binding for the same chord.
        Prec.high(keymap.of([...markdownFormattingKeymap])),
        // GFM base so ~~strikethrough~~ parses as a real
        // `Strikethrough` node — toolbar toggle detection reads the
        // parsed tree.
        markdown({ base: markdownLanguage }),
      ];
    },
    [formatKeymap],
  );

  // Build a fresh EditorState for a document. Used on mount and whenever the
  // active document is swapped from outside (via the `value` prop) or its
  // language changes. Because the single EditorView is persistent (kept
  // mounted across view-mode switches so selection/cursor/history survive),
  // swapping documents MUST replace the whole state — a plain change
  // transaction would leave the previous document's undo history live, so one
  // undo could pull another file's content into this buffer.
  const buildState = useCallback(
    (doc: string, lang: DocumentLanguage): EditorState =>
      EditorState.create({
        doc,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          documentSearchExtension,
          // Shared by every language; listed before perLanguageConf so the
          // number gutter stays left of the data languages' fold gutter.
          lineNumbers(),
          perLanguageConf.of(languageExtensions(lang)),
          EditorView.lineWrapping,
          editorTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
            if (update.docChanged || update.selectionSet) {
              emitActiveFormats(update.state);
              onSearchResultChangeRef.current?.(
                getDocumentSearchStatus(update.state),
              );
            }
          }),
        ],
      }),
    [emitActiveFormats, languageExtensions],
  );

  useImperativeHandle(
    ref,
    () => ({
      getState: () => viewRef.current!.state,
      setState: (state) => {
        viewRef.current!.setState(state);
        emitActiveFormats(viewRef.current!.state);
      },
      getScrollSnapshot: () => viewRef.current!.scrollSnapshot(),
      applyScrollSnapshot: (effect) =>
        viewRef.current!.dispatch({ effects: effect }),
      format: (action) => {
        const view = viewRef.current;
        if (!view) return;
        // The command dispatches synchronously, so the updateListener below has
        // already emitted the new active formats by the time this returns.
        runFormatAction(action, view);
        // A toolbar click moves focus to the button; return it to the document.
        view.focus();
      },
      runDataAction: (action) => {
        const view = viewRef.current;
        if (!view) return;
        dispatchDataAction(view, action);
        // A toolbar click moves focus to the button; return it to the document.
        view.focus();
      },
      search: (query) => {
        const view = viewRef.current;
        return view
          ? setDocumentSearch(view, query)
          : { current: 0, total: 0 };
      },
      findNext: () => {
        const view = viewRef.current;
        return view
          ? moveDocumentSearch(view, "next")
          : { current: 0, total: 0 };
      },
      findPrevious: () => {
        const view = viewRef.current;
        return view
          ? moveDocumentSearch(view, "previous")
          : { current: 0, total: 0 };
      },
      clearSearch: () => {
        const view = viewRef.current;
        if (view) clearDocumentSearch(view);
      },
      getSelectedText: () => {
        const view = viewRef.current;
        if (!view) return "";
        const { from, to } = view.state.selection.main;
        return view.state.sliceDoc(from, to);
      },
      focus: () => viewRef.current?.focus(),
      getScrollTop: () => viewRef.current?.scrollDOM.scrollTop ?? 0,
      // CodeMirror measures block geometry relative to the document's top,
      // which moves as the scroller scrolls. `documentTop` is that origin in
      // viewport coordinates, so subtracting it from the scroller's top edge
      // gives the document height currently at the top of the viewport —
      // padding-independent in both directions.
      getSyncLine: () => {
        const view = viewRef.current;
        if (!view) return null;
        const height =
          view.scrollDOM.getBoundingClientRect().top - view.documentTop;
        const block = view.lineBlockAtHeight(height);
        const line = view.state.doc.lineAt(block.from).number;
        // Fraction into a (possibly wrapped, multi-row) line, so scrolling
        // through one long paragraph moves the preview smoothly rather than in
        // one jump at the paragraph boundary.
        const within =
          block.height > 0 ? clamp01((height - block.top) / block.height) : 0;
        return line + within;
      },
      scrollToSyncLine: (line) => {
        const view = viewRef.current;
        if (!view) return;
        const doc = view.state.doc;
        const number = Math.min(doc.lines, Math.max(1, Math.floor(line)));
        const within = clamp01(line - number);
        const block = view.lineBlockAt(doc.line(number).from);
        const target = block.top + within * block.height;
        const current =
          view.scrollDOM.getBoundingClientRect().top - view.documentTop;
        // Scrolling by d moves documentTop by -d, so the delta lands the target
        // height exactly at the top edge.
        view.scrollDOM.scrollTop += target - current;
      },
    }),
    [emitActiveFormats, dispatchDataAction],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: buildState(value, language),
      parent: containerRef.current,
    });
    viewRef.current = view;
    emitActiveFormats(view.state);

    // `scroll` does not bubble, so it is listened for on CodeMirror's own
    // scroller rather than routed through the view's dom event handlers.
    const notifyScroll = () => onScrollRef.current?.();
    view.scrollDOM.addEventListener("scroll", notifyScroll, { passive: true });

    return () => {
      view.scrollDOM.removeEventListener("scroll", notifyScroll);
      view.destroy();
      viewRef.current = null;
    };
    // Mount once; subsequent value syncs handled by the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An external `value` that differs from the view means the active document
  // was swapped (or reloaded from disk). Replace the whole state so undo
  // history and cursor reset with the new document rather than bleeding
  // across files. A language mismatch alone means the user toggled the
  // language of the document they are editing — reconfigure the compartment
  // in place so undo history, selection, and scroll survive. (Snapshot
  // restores via setState land before this effect runs and already match
  // both doc and language, so they trigger neither branch.) Typing never
  // reaches here — onChange keeps `value` equal to the view's own doc.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() !== value) {
      view.setState(buildState(value, language));
      emitActiveFormats(view.state);
      if (searchQueryRef.current) {
        onSearchResultChangeRef.current?.(
          setDocumentSearch(view, searchQueryRef.current),
        );
      }
    } else if (stateLanguage(view.state) !== language) {
      view.dispatch({
        effects: perLanguageConf.reconfigure(languageExtensions(language)),
      });
      // The reconfigure transaction changes neither doc nor selection, so the
      // update listener won't re-emit; do it here (markdown -> [] and back).
      emitActiveFormats(view.state);
    }
  }, [value, language, buildState, languageExtensions, emitActiveFormats]);

  return <div ref={containerRef} className="h-full w-full" />;
});

Editor.displayName = "Editor";

export default Editor;
