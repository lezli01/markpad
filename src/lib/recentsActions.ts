// Selection logic for the recents context-menu close actions. The panel owns the
// displayed order; these helpers turn a scope plus the right-clicked item into
// the exact set of ids to close.
//
// Bulk actions never discard work: an item whose buffer differs from its disk
// baseline is always skipped, so "Close all" leaves unsaved drafts behind
// instead of prompting. Closing a single item keeps its own save/discard prompt
// (see handleRemove in App.tsx).

export type CloseScope = "all" | "others" | "above" | "below" | "saved";

export type ClosableItem = {
  id: string;
  /** Absolute path; null for untitled drafts. */
  path: string | null;
  /** True when the buffer differs from its saved baseline. */
  unsaved: boolean;
};

/**
 * Ids to close for `scope`, anchored on the right-clicked `targetId`.
 * `items` must be in displayed order — "above"/"below" mean what the user sees.
 */
export function idsToClose(
  items: readonly ClosableItem[],
  scope: CloseScope,
  targetId: string,
): string[] {
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (targetIndex < 0) return [];
  const selected: string[] = [];
  items.forEach((item, index) => {
    if (item.unsaved) return;
    const match =
      scope === "all" ||
      (scope === "others" && item.id !== targetId) ||
      (scope === "above" && index < targetIndex) ||
      (scope === "below" && index > targetIndex) ||
      // "Saved" means a file that exists on disk with no pending edits, so
      // untitled drafts survive even when they are empty.
      (scope === "saved" && item.path !== null);
    if (match) selected.push(item.id);
  });
  return selected;
}
