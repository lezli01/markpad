import type { Theme, ViewMode } from "../lib/preferences";

type ToolbarProps = {
  viewMode: ViewMode;
  theme: Theme;
  onOpenFile: () => void;
  onSetViewMode: (mode: ViewMode) => void;
  onToggleTheme: () => void;
};

const toolbarShell =
  "flex items-center gap-2 rounded-2xl bg-[color:var(--islands-surface)] ring-1 ring-[color:var(--islands-ring)] shadow-sm backdrop-blur px-3 py-2";

const buttonBase =
  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-[color:var(--islands-text)] ring-1 ring-[color:var(--islands-ring)] bg-transparent hover:bg-[color:var(--islands-ring)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--islands-cursor)] transition-colors";

const segmentGroup =
  "inline-flex items-center rounded-lg ring-1 ring-[color:var(--islands-ring)] overflow-hidden";

const segmentBase =
  "px-3 py-1.5 text-sm font-medium text-[color:var(--islands-text)] bg-transparent hover:bg-[color:var(--islands-ring)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--islands-cursor)] transition-colors";

const segmentActive = "bg-[color:var(--islands-ring)]";

const iconButton =
  "inline-flex items-center justify-center rounded-lg p-1.5 text-[color:var(--islands-text)] ring-1 ring-[color:var(--islands-ring)] bg-transparent hover:bg-[color:var(--islands-ring)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--islands-cursor)] transition-colors";

function FolderOpenIcon() {
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
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2H3V7Z" />
      <path d="M3 11h17l-2 7a2 2 0 0 1-2 1.5H5A2 2 0 0 1 3 17.5V11Z" />
    </svg>
  );
}

function MoonIcon() {
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
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

function SunIcon() {
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
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

const segments: ReadonlyArray<{ mode: ViewMode; label: string }> = [
  { mode: "editor", label: "Editor" },
  { mode: "split", label: "Split" },
  { mode: "preview", label: "Preview" },
];

export default function Toolbar({
  viewMode,
  theme,
  onOpenFile,
  onSetViewMode,
  onToggleTheme,
}: ToolbarProps) {
  const themeLabel =
    theme === "light" ? "Switch to dark theme" : "Switch to light theme";
  return (
    <div className={toolbarShell} role="toolbar" aria-label="Workspace controls">
      <button type="button" className={buttonBase} onClick={onOpenFile}>
        <FolderOpenIcon />
        <span>Open</span>
      </button>
      <div className={segmentGroup} role="group" aria-label="View mode">
        {segments.map(({ mode, label }) => {
          const active = viewMode === mode;
          return (
            <button
              key={mode}
              type="button"
              className={`${segmentBase}${active ? ` ${segmentActive}` : ""}`}
              aria-pressed={active}
              onClick={() => onSetViewMode(mode)}
            >
              {label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className={iconButton}
        aria-label={themeLabel}
        onClick={onToggleTheme}
      >
        {theme === "light" ? <MoonIcon /> : <SunIcon />}
      </button>
    </div>
  );
}
