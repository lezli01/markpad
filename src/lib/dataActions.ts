// The CodeMirror adapter shared by the two data languages: the fold commands,
// and the whole-buffer rewrite that Format / Minify / Sort keys produce. The
// transformations themselves are pure functions of the text — jsonActions.ts and
// yamlActions.ts — so they stay unit testable without a DOM.

import type { EditorView } from "@codemirror/view";
import { foldAll, unfoldAll } from "@codemirror/language";
import { isolateHistory } from "@codemirror/commands";
import type { DataLanguage } from "./documentLanguage";
import { applyJsonTextAction, type JsonTextAction } from "./jsonActions";
import { applyYamlTextAction, type YamlTextAction } from "./yamlActions";

/** Language-agnostic: both languages fold their collections. */
export type FoldAction = "collapseAll" | "expandAll";

/** Every action a data-language toolbar can raise. Which of them a given
    language offers is DataToolbar's list — YAML has no Minify. */
export type DataAction = JsonTextAction | YamlTextAction | FoldAction;

/**
 * Replace the whole buffer, as one undo step of its own — never merged into the
 * preceding typing event, so a single Ctrl+Z reverts exactly the rewrite.
 */
export function rewriteDocument(view: EditorView, next: string): void {
  if (next === view.state.doc.toString()) return;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: next },
    annotations: isolateHistory.of("full"),
    // A whole-doc replace can't map the cursor meaningfully; clamping the old
    // offset at least keeps it in the neighborhood instead of jumping to the
    // top.
    selection: {
      anchor: Math.min(view.state.selection.main.head, next.length),
    },
    scrollIntoView: true,
  });
}

function applyTextAction(
  language: DataLanguage,
  text: string,
  action: Exclude<DataAction, FoldAction>,
) {
  if (language === "json") return applyJsonTextAction(text, action);
  // Minify has no YAML counterpart a user would want (flow style is not what
  // "minify" means to anyone editing YAML), so the toolbar does not offer it.
  return action === "minify"
    ? ({ kind: "ok", text } as const)
    : applyYamlTextAction(text, action);
}

/**
 * Run a data-language action on the view. Returns an error message when the
 * buffer does not parse (text actions only), null on success or no-op.
 */
export function runDataAction(
  view: EditorView,
  language: DataLanguage,
  action: DataAction,
): string | null {
  if (action === "collapseAll") {
    foldAll(view);
    return null;
  }
  if (action === "expandAll") {
    unfoldAll(view);
    return null;
  }
  const current = view.state.doc.toString();
  const result = applyTextAction(language, current, action);
  if (result.kind === "error") {
    return result.message;
  }
  rewriteDocument(view, result.text);
  return null;
}
