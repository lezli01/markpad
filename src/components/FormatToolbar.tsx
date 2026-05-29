import { Fragment } from "react";
import {
  FORMAT_ACTIONS,
  type FormatAction,
  type FormatGroup,
} from "../lib/formatActions";

type FormatToolbarProps = {
  onFormat: (id: FormatAction) => void;
  /** "⌘" on macOS, "Ctrl" elsewhere — used only for tooltip text. */
  modKey: string;
  /** Toggle actions currently active at the selection (drives aria-pressed). */
  activeFormats: FormatAction[];
};

// Inner SVG markup per action, matching the 24-viewBox / 16px / stroke-1.75
// round style of the icons in Toolbar.tsx.
const ICON_PATHS: Record<FormatAction, string> = {
  bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7Z"/><path d="M7 12h7a3.5 3.5 0 0 1 0 7H7Z"/>',
  italic: '<path d="M19 5h-6"/><path d="M11 19H5"/><path d="M15 5 9 19"/>',
  strikethrough:
    '<path d="M16 7a4 3 0 0 0-8 .5c0 1.4 1.4 2.1 4 2.5"/><path d="M8 17a4 3 0 0 0 8-.5c0-1-.5-1.7-1.6-2.2"/><path d="M4 12h16"/>',
  inlineCode: '<path d="m9 8-4 4 4 4"/><path d="m15 8 4 4-4 4"/>',
  heading1:
    '<path d="M4 6v12"/><path d="M11 6v12"/><path d="M4 12h7"/><path d="M16 9.5 18 8v10"/>',
  heading2:
    '<path d="M4 6v12"/><path d="M11 6v12"/><path d="M4 12h7"/><path d="M15.5 9.2a1.6 1.6 0 0 1 3 .8c0 1.6-3 2.4-3 5h3"/>',
  heading3:
    '<path d="M4 6v12"/><path d="M11 6v12"/><path d="M4 12h7"/><path d="M15.5 9a1.6 1.6 0 1 1 1.4 2.5 1.6 1.6 0 1 1-1.4 2.5"/>',
  bulletList:
    '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><circle cx="4.5" cy="6" r=".8"/><circle cx="4.5" cy="12" r=".8"/><circle cx="4.5" cy="18" r=".8"/>',
  orderedList:
    '<path d="M10 6h10"/><path d="M10 12h10"/><path d="M10 18h10"/><path d="M4 9V5l-1.2 1"/><path d="M3 13.5a1.2 1.2 0 0 1 2 .9c0 1-2 1.6-2 2.6h2"/>',
  blockquote:
    '<path d="M5 5v14"/><path d="M9 8h11"/><path d="M9 12h11"/><path d="M9 16h7"/>',
  link: '<path d="M9 15 15 9"/><path d="M11 6.5 12.5 5a4 4 0 0 1 5.7 5.7L16.5 12.5"/><path d="M13 17.5 11.5 19a4 4 0 0 1-5.7-5.7L7.5 11.5"/>',
  image:
    '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m4 17 4.5-4.5L12 16l3-3 5 5"/>',
  codeBlock:
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m9 10-2 2 2 2"/><path d="m15 10 2 2-2 2"/>',
  table:
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M3 15h18"/><path d="M12 5v14"/>',
  horizontalRule: '<path d="M4 12h16"/>',
};

const GROUP_LABELS: Record<FormatGroup, string> = {
  text: "Text style",
  headings: "Headings",
  lists: "Lists and quotes",
  insert: "Insert",
};

const GROUP_ORDER: readonly FormatGroup[] = [
  "text",
  "headings",
  "lists",
  "insert",
];

const GROUPED = GROUP_ORDER.map((id) => ({
  id,
  label: GROUP_LABELS[id],
  actions: FORMAT_ACTIONS.filter((a) => a.group === id),
}));

const toolbarShell = "flex items-center gap-1 flex-wrap";
const formatGroup = "inline-flex items-center gap-1";
const divider = "mx-1 h-5 w-px bg-[color:var(--islands-muted)]/30";

// Two complete, mutually-exclusive class strings (rather than layering an
// "active" modifier) so Tailwind never has to resolve conflicting bg/text/ring
// utilities by stylesheet order.
const iconButtonBase =
  "inline-flex items-center justify-center rounded-lg p-1.5 ring-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--islands-cursor)] transition-colors";
const iconButtonInactive = `${iconButtonBase} bg-transparent text-[color:var(--islands-text)] ring-[color:var(--islands-ring)] hover:bg-[color:var(--islands-ring)]`;
const iconButtonActive = `${iconButtonBase} bg-[color:var(--islands-ring)] text-[color:var(--islands-cursor)] ring-[color:var(--islands-cursor)]`;

function prettyShortcut(shortcut: string, modKey: string): string {
  return shortcut
    .split("-")
    .map((part) => {
      if (part === "Mod") return modKey;
      if (part.length === 1) return part.toUpperCase();
      return part;
    })
    .join("+");
}

function Icon({ id }: { id: FormatAction }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[id] }}
    />
  );
}

export default function FormatToolbar({
  onFormat,
  modKey,
  activeFormats,
}: FormatToolbarProps) {
  const activeSet = new Set(activeFormats);
  return (
    <div
      className={toolbarShell}
      role="toolbar"
      aria-label="Text formatting"
    >
      {GROUPED.map((group, groupIndex) => (
        <Fragment key={group.id}>
          {groupIndex > 0 && <span className={divider} aria-hidden="true" />}
          <div className={formatGroup} role="group" aria-label={group.label}>
            {group.actions.map((action) => {
              const active = action.toggle && activeSet.has(action.id);
              const name = action.shortcut
                ? `${action.label} (${prettyShortcut(action.shortcut, modKey)})`
                : action.label;
              return (
                <button
                  key={action.id}
                  type="button"
                  className={active ? iconButtonActive : iconButtonInactive}
                  title={name}
                  aria-label={name}
                  aria-pressed={action.toggle ? active : undefined}
                  // Keep the editor's selection — don't let the button steal focus
                  // before the command runs; Editor.format() restores focus after.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onFormat(action.id)}
                >
                  <Icon id={action.id} />
                </button>
              );
            })}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
