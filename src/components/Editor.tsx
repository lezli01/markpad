import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState, type StateEffect } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";

export type EditorHandle = {
  getState(): EditorState;
  setState(state: EditorState): void;
  getScrollSnapshot(): StateEffect<unknown>;
  applyScrollSnapshot(effect: StateEffect<unknown>): void;
};

type EditorProps = {
  value: string;
  onChange: (next: string) => void;
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
  { value, onChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useImperativeHandle(
    ref,
    () => ({
      getState: () => viewRef.current!.state,
      setState: (state) => viewRef.current!.setState(state),
      getScrollSnapshot: () => viewRef.current!.scrollSnapshot(),
      applyScrollSnapshot: (effect) =>
        viewRef.current!.dispatch({ effects: effect }),
    }),
    [],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          islandsTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;

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
