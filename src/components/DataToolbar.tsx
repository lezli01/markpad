import { Fragment } from "react";
import type { DataAction } from "../lib/dataActions";
import { LANGUAGE_LABELS, type DataLanguage } from "../lib/documentLanguage";

// The data-language counterpart of FormatToolbar: shown in the editor pane
// header while a JSON or YAML document is active. Text labels instead of icons
// — actions like "Sort keys" have no universally recognized glyph.

type DataToolbarProps = {
  language: DataLanguage;
  onAction: (action: DataAction) => void;
};

type ActionSpec = {
  id: DataAction;
  label: string;
  title: string;
};

type Group = {
  id: string;
  label: string;
  actions: ReadonlyArray<ActionSpec>;
};

// Per language, because the words differ where the languages do: YAML has
// mappings and sequences rather than objects and arrays, and no Minify —
// collapsing YAML to flow style is not what anyone means by minifying it.
const GROUPS: Record<DataLanguage, ReadonlyArray<Group>> = {
  json: [
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
  ],
  yaml: [
    {
      id: "rewrite",
      label: "Rewrite YAML",
      actions: [
        {
          id: "format",
          label: "Format",
          title:
            "Format YAML, 2-space indent, comments kept (Shift+Alt+F)",
        },
        {
          id: "sortKeys",
          label: "Sort keys",
          title: "Sort mapping keys recursively (sequence order is kept)",
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
          title: "Collapse all mappings, sequences and block literals",
        },
        {
          id: "expandAll",
          label: "Expand all",
          title: "Expand all mappings, sequences and block literals",
        },
      ],
    },
  ],
};

const toolbarShell = "flex items-center gap-0.5 flex-nowrap";
const actionGroup = "inline-flex items-center gap-0.5";
const divider = "mx-1 h-5 w-px bg-[color:var(--border)]";

const textButton =
  "h-7 rounded-md px-2 text-xs font-medium whitespace-nowrap bg-transparent text-[color:var(--muted)] hover:text-[color:var(--text)] hover:bg-[color:var(--hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] transition-colors";

export default function DataToolbar({ language, onAction }: DataToolbarProps) {
  return (
    <div
      className={toolbarShell}
      role="toolbar"
      aria-label={`${LANGUAGE_LABELS[language]} actions`}
    >
      {GROUPS[language].map((group, groupIndex) => (
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
