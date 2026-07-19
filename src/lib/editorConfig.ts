import { basicSetup } from "codemirror";
import { json } from "@codemirror/lang-json";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";

/**
 * Gets the CodeMirror extensions for JSON mode.
 * Includes syntax highlighting and folding support.
 */
export function getJSONExtensions(): any[] {
  return [
    basicSetup,
    json(),
    EditorView.lineWrapping,
    EditorView.theme({
      ".cm-editor": {
        fontFamily: 'ui-monospace, "SF Mono", Monaco, Menlo, Consolas, "Liberation Mono", monospace',
      },
      ".cm-content": {
        padding: "0.5rem 0",
      },
    }),
  ];
}

/**
 * Gets the CodeMirror extensions for markdown mode.
 * Includes markdown language support and formatting commands.
 */
export function getMarkdownExtensions(): any[] {
  return [
    history(),
    historyKeymap,
    defaultKeymap,
    markdown({ base: markdownLanguage }),
    EditorView.lineWrapping,
  ];
}
