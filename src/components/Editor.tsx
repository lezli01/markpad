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

const islandsTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--islands-text)",
    backgroundColor: "transparent",
  },
  ".cm-scroller": {
    fontFamily:
      'ui-monospace, "SF Mono", Monaco, Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: "14px",
    lineHeight: "1.6",
  },
  ".cm-content": {
    caretColor: "var(--islands-cursor)",
    padding: "0.5rem 0",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--islands-cursor)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    {
      backgroundColor: "var(--islands-selection)",
    },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "none",
    color: "var(--islands-muted)",
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
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          // Formatting shortcuts (Mod-b, Mod-i, …) take precedence so they win
          // over any default binding for the same chord.
          Prec.high(keymap.of([...markdownFormattingKeymap])),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          islandsTheme,
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

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={containerRef} className="h-full w-full" />;
});

Editor.displayName = "Editor";

export default Editor;
