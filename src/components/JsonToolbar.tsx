import { Fragment } from "react";
import type { JsonAction } from "../lib/jsonActions";

// The JSON counterpart of FormatToolbar: shown in the editor pane header
// while a JSON document is active. Text labels instead of icons — actions
// like "Sort keys" have no universally recognized glyph.

type JsonToolbarProps = {
  onAction: (action: JsonAction) => void;
};

type ActionSpec = {
  id: JsonAction;
  label: string;
  title: string;
};

const GROUPS: ReadonlyArray<{
  id: string;
  label: string;
  actions: ReadonlyArray<ActionSpec>;
}> = [
  {
    id: "rewrite",
    label: "Rewrite JSON",
    actions: [
      {
        id: "format",
        label: "Format",
        title: "Format JSON, 2-space indent (Shift+Alt+F)",
      },
      { id: "minify", label: "Minify", title: "Minify JSON to a single line" },
      {
        id: "sortKeys",
        label: "Sort keys",
        title: "Sort object keys recursively (array order is kept)",
      },
    ],
  },
  {
    id: "folding",
    label: "Folding",
    actions: [
      {
        id: "collapseAll",
        label: "Collapse all",
        title: "Collapse all objects and arrays",
      },
      {
        id: "expandAll",
        label: "Expand all",
        title: "Expand all objects and arrays",
      },
    ],
  },
];

const toolbarShell = "flex items-center gap-0.5 flex-nowrap";
const actionGroup = "inline-flex items-center gap-0.5";
const divider = "mx-1 h-5 w-px bg-[color:var(--border)]";

const textButton =
  "h-7 rounded-md px-2 text-xs font-medium whitespace-nowrap bg-transparent text-[color:var(--muted)] hover:text-[color:var(--text)] hover:bg-[color:var(--hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] transition-colors";

export default function JsonToolbar({ onAction }: JsonToolbarProps) {
  return (
    <div className={toolbarShell} role="toolbar" aria-label="JSON actions">
      {GROUPS.map((group, groupIndex) => (
        <Fragment key={group.id}>
          {groupIndex > 0 && <span className={divider} aria-hidden="true" />}
          <div className={actionGroup} role="group" aria-label={group.label}>
            {group.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={textButton}
                // No aria-label: the visible text IS the accessible name
                // (WCAG 2.5.3 Label in Name); the title adds detail only.
                title={action.title}
                // Keep the editor's selection — don't let the button steal
                // focus before the command runs; Editor restores focus after.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onAction(action.id)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
