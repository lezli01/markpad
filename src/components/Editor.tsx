import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
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
import type { DocumentLanguage } from "../lib/documentLanguage";
import { runJsonAction, type JsonAction } from "../lib/jsonActions";

export type EditorHandle = {
  getState(): EditorState;
  setState(state: EditorState): void;
  getScrollSnapshot(): StateEffect<unknown>;
  applyScrollSnapshot(effect: StateEffect<unknown>): void;
  format(action: FormatAction): void;
  runJsonAction(action: JsonAction): void;
  focus(): void;
};

type EditorProps = {
  value: string;
  language: DocumentLanguage;
  onChange: (next: string) => void;
  onActiveFormatsChange?: (active: FormatAction[]) => void;
  /** Outcome of every JSON action: a parse-error message, or null on success
      so the app can clear a previously shown banner. The editor pane has no
      chrome of its own for messages. */
  onJsonActionResult?: (error: string | null) => void;
};

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
  // The rules below only apply in JSON mode (markdown states include no
  // gutter, fold, or lint extensions).
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

// JSON token colors come from CSS variables so the light/dark palettes in
// styles.css stay the single source of truth for theming.
const jsonHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--json-key)" },
  { tag: tags.string, color: "var(--json-string)" },
  { tag: tags.number, color: "var(--json-number)" },
  { tag: [tags.bool, tags.null], color: "var(--json-literal)" },
  { tag: [tags.separator, tags.bracket], color: "var(--muted)" },
]);

// Which language a state was built with. Identity check against the language
// facet, so snapshot-restored states report correctly without extra tracking.
function stateLanguage(state: EditorState): DocumentLanguage {
  return state.facet(languageFacet) === jsonLanguage ? "json" : "markdown";
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

const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { value, language, onChange, onActiveFormatsChange, onJsonActionResult },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onActiveFormatsChangeRef = useRef(onActiveFormatsChange);
  const onJsonActionResultRef = useRef(onJsonActionResult);
  const lastActiveKeyRef = useRef<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onActiveFormatsChangeRef.current = onActiveFormatsChange;
  }, [onActiveFormatsChange]);

  useEffect(() => {
    onJsonActionResultRef.current = onJsonActionResult;
  }, [onJsonActionResult]);

  // Recompute which toggle actions are active at the selection and notify the
  // toolbar, deduped so we don't re-render it on every keystroke that doesn't
  // change the active set. Markdown-only: the format toolbar is hidden for
  // JSON documents, and the toggle detection walks a markdown syntax tree.
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

  const dispatchJsonAction = useCallback(
    (view: EditorView, action: JsonAction) => {
      // Always report — null on success clears a previously shown banner.
      onJsonActionResultRef.current?.(runJsonAction(view, action));
    },
    [],
  );

  // The extensions that differ between languages, swapped via perLanguageConf.
  const languageExtensions = useCallback(
    (lang: DocumentLanguage) =>
      lang === "json"
        ? [
            // Format wins over any default binding for the same chord.
            Prec.high(
              keymap.of([
                {
                  key: "Shift-Alt-f",
                  run: (view: EditorView) => {
                    dispatchJsonAction(view, "format");
                    return true;
                  },
                },
              ]),
            ),
            keymap.of([...foldKeymap]),
            json(),
            jsonLinter,
            syntaxHighlighting(jsonHighlightStyle),
            lineNumbers(),
            foldGutter(),
          ]
        : [
            // Formatting shortcuts (Mod-b, Mod-i, …) take precedence so
            // they win over any default binding for the same chord.
            Prec.high(keymap.of([...markdownFormattingKeymap])),
            // GFM base so ~~strikethrough~~ parses as a real
            // `Strikethrough` node — toolbar toggle detection reads the
            // parsed tree.
            markdown({ base: markdownLanguage }),
          ],
    [dispatchJsonAction],
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
          perLanguageConf.of(languageExtensions(lang)),
          EditorView.lineWrapping,
          editorTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
            if (update.docChanged || update.selectionSet) {
              emitActiveFormats(update.state);
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
      runJsonAction: (action) => {
        const view = viewRef.current;
        if (!view) return;
        dispatchJsonAction(view, action);
        // A toolbar click moves focus to the button; return it to the document.
        view.focus();
      },
      focus: () => viewRef.current?.focus(),
    }),
    [emitActiveFormats, dispatchJsonAction],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: buildState(value, language),
      parent: containerRef.current,
    });
    viewRef.current = view;
    emitActiveFormats(view.state);

    return () => {
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
