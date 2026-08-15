import { EditorSelection, type EditorState } from "@codemirror/state";
import { EditorView, type Panel } from "@codemirror/view";
import {
  closeSearchPanel,
  getSearchQuery,
  openSearchPanel,
  search,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";

export type SearchStatus = {
  /** One-based position of the selected match; zero when no match is selected. */
  current: number;
  total: number;
};

export const EMPTY_SEARCH_STATUS: SearchStatus = { current: 0, total: 0 };

function createHiddenSearchPanel(view: EditorView): Panel {
  const dom = view.dom.ownerDocument.createElement("div");
  dom.hidden = true;
  dom.setAttribute("aria-hidden", "true");
  return { dom };
}

/** Install search state and highlighting while the app supplies the visible UI. */
export const documentSearchExtension = search({
  createPanel: createHiddenSearchPanel,
});

type Match = { from: number; to: number };

function matchesFor(state: EditorState, query: SearchQuery): Match[] {
  if (!query.valid) return [];
  const cursor = query.getCursor(state);
  const matches: Match[] = [];
  for (let result = cursor.next(); !result.done; result = cursor.next()) {
    matches.push(result.value);
  }
  return matches;
}

function selectedMatchIndex(state: EditorState, matches: Match[]): number {
  const { from, to } = state.selection.main;
  return matches.findIndex((match) => match.from === from && match.to === to);
}

function statusFor(state: EditorState, matches: Match[]): SearchStatus {
  const index = selectedMatchIndex(state, matches);
  return { current: index < 0 ? 0 : index + 1, total: matches.length };
}

function selectMatch(
  view: EditorView,
  query: SearchQuery,
  matches: Match[],
  index: number,
): SearchStatus {
  const match = matches[index];
  const selection = EditorSelection.single(match.from, match.to);
  view.dispatch({
    selection,
    effects: [
      setSearchQuery.of(query),
      EditorView.scrollIntoView(selection.main, { y: "center" }),
    ],
    userEvent: "select.search",
  });
  return { current: index + 1, total: matches.length };
}

/** Set a literal, case-insensitive query and select the nearest match. */
export function setDocumentSearch(
  view: EditorView,
  searchText: string,
  selectNearest = true,
): SearchStatus {
  const query = new SearchQuery({ search: searchText, literal: true });
  if (query.valid) openSearchPanel(view);
  const matches = matchesFor(view.state, query);

  if (!selectNearest || matches.length === 0) {
    view.dispatch({ effects: setSearchQuery.of(query) });
    return statusFor(view.state, matches);
  }

  const { from } = view.state.selection.main;
  let index = selectedMatchIndex(view.state, matches);
  if (index < 0) {
    index = matches.findIndex(
      (match) =>
        (match.from <= from && match.to >= from) || match.from >= from,
    );
  }
  return selectMatch(view, query, matches, index < 0 ? 0 : index);
}

export function moveDocumentSearch(
  view: EditorView,
  direction: "next" | "previous",
): SearchStatus {
  const query = getSearchQuery(view.state);
  const matches = matchesFor(view.state, query);
  if (matches.length === 0) return EMPTY_SEARCH_STATUS;

  const selected = selectedMatchIndex(view.state, matches);
  let index: number;
  if (selected >= 0) {
    index =
      direction === "next"
        ? (selected + 1) % matches.length
        : (selected - 1 + matches.length) % matches.length;
  } else if (direction === "next") {
    const { to } = view.state.selection.main;
    const after = matches.findIndex((match) => match.from >= to);
    index = after < 0 ? 0 : after;
  } else {
    const { from } = view.state.selection.main;
    let before = -1;
    for (let candidate = matches.length - 1; candidate >= 0; candidate -= 1) {
      if (matches[candidate].to <= from) {
        before = candidate;
        break;
      }
    }
    index = before < 0 ? matches.length - 1 : before;
  }

  return selectMatch(view, query, matches, index);
}

export function getDocumentSearchStatus(state: EditorState): SearchStatus {
  const matches = matchesFor(state, getSearchQuery(state));
  return statusFor(state, matches);
}

export function clearDocumentSearch(view: EditorView): void {
  view.dispatch({
    effects: setSearchQuery.of(new SearchQuery({ search: "", literal: true })),
  });
  closeSearchPanel(view);
}

export function isDocumentSearchShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"
  >,
): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === "f"
  );
}
