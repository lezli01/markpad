import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { EditorState, Prec, type StateEffect } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  type FormatAction,
  getActiveFormatActions,
  markdownFormattingKeymap,
  runFormatAction,
} from "../lib/formatActions";

export type EditorHandle = {
  getState(): EditorState;
  setState(state: EditorState): void;
  getScrollSnapshot(): StateEffect<unknown>;
  applyScrollSnapshot(effect: StateEffect<unknown>): void;
  format(action: FormatAction): void;
  focus(): void;
};

type EditorProps = {
  value: string;
  onChange: (next: string) => void;
  onActiveFormatsChange?: (active: FormatAction[]) => void;
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
});

const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { value, onChange, onActiveFormatsChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onActiveFormatsChangeRef = useRef(onActiveFormatsChange);
  const lastActiveKeyRef = useRef<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onActiveFormatsChangeRef.current = onActiveFormatsChange;
  }, [onActiveFormatsChange]);

  // Recompute which toggle actions are active at the selection and notify the
  // toolbar, deduped so we don't re-render it on every keystroke that doesn't
  // change the active set.
  const emitActiveFormats = useCallback((state: EditorState) => {
    const cb = onActiveFormatsChangeRef.current;
    if (!cb) return;
    const active = getActiveFormatActions(state);
    const key = active.join("|");
    if (key === lastActiveKeyRef.current) return;
    lastActiveKeyRef.current = key;
    cb(active);
  }, []);

  // Build a fresh EditorState for a document. Used both on mount and whenever the
  // active document is swapped from outside (via the `value` prop). Because the
  // single EditorView is persistent (kept mounted across view-mode switches so
  // selection/cursor/history survive), swapping documents MUST replace the whole
  // state — a plain change transaction would leave the previous document's undo
  // history live, so one undo could pull another file's content into this buffer.
  const buildState = useCallback(
    (doc: string): EditorState =>
      EditorState.create({
        doc,
        extensions: [
          history(),
          // Formatting shortcuts (Mod-b, Mod-i, …) take precedence so they win
          // over any default binding for the same chord.
          Prec.high(keymap.of([...markdownFormattingKeymap])),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
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
    [emitActiveFormats],
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
      focus: () => viewRef.current?.focus(),
    }),
    [emitActiveFormats],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: buildState(value),
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

  // An external `value` that differs from the view means the active document was
  // swapped (or reloaded from disk). Replace the whole state so undo history and
  // cursor reset with the new document rather than bleeding across files. Typing
  // never reaches here — onChange keeps `value` equal to the view's own doc.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() !== value) {
      view.setState(buildState(value));
      emitActiveFormats(view.state);
    }
  }, [value, buildState, emitActiveFormats]);

  return <div ref={containerRef} className="h-full w-full" />;
});

Editor.displayName = "Editor";

export default Editor;
