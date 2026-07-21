import type { Theme, ViewMode } from "../lib/preferences";

type ToolbarProps = {
  viewMode: ViewMode;
  /** False while a JSON document is active — JSON is editor-only, so the
      Editor/Split/Preview segments are disabled (the preference is kept). */
  viewModesEnabled: boolean;
  theme: Theme;
  saveEnabled: boolean;
  saving: boolean;
  autoSave: boolean;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onNewFile: () => void;
  onOpenFile: () => void;
  onSave: () => void;
  onToggleAutoSave: (next: boolean) => void;
  onSetViewMode: (mode: ViewMode) => void;
  onToggleTheme: () => void;
};

const toolbarShell =
  "flex items-center gap-1.5 border-b border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2";

const buttonBase =
  "inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium text-[color:var(--text)] bg-transparent hover:bg-[color:var(--hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent";

const segmentGroup =
  "inline-flex items-center rounded-md border border-[color:var(--border)] overflow-hidden";

const segmentBase =
  "px-3 py-1.5 text-sm font-medium text-[color:var(--muted)] bg-transparent hover:bg-[color:var(--hover)] hover:text-[color:var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--accent)] transition-colors disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[color:var(--muted)]";

const segmentActive = "bg-[color:var(--accent-soft)] text-[color:var(--accent)]";

const iconButton =
  "inline-flex items-center justify-center rounded-md p-1.5 text-[color:var(--muted)] bg-transparent hover:text-[color:var(--text)] hover:bg-[color:var(--hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] transition-colors";

const toolbarDivider = "mx-1 h-6 w-px bg-[color:var(--border)]";

function NewFileIcon() {
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
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
      <path d="M14 3v6h6" />
      <path d="M12 12v6" />
      <path d="M9 15h6" />
    </svg>
  );
}

function SaveIcon() {
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
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

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

function PanelLeftIcon() {
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
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  );
}

const segments: ReadonlyArray<{ mode: ViewMode; label: string }> = [
  { mode: "editor", label: "Editor" },
  { mode: "split", label: "Split" },
  { mode: "preview", label: "Preview" },
];

const autoSaveLabel =
  "flex items-center gap-2 px-2 text-sm font-medium text-[color:var(--text)] cursor-pointer select-none";

const autoSaveCheckbox = "accent-[color:var(--accent)] h-4 w-4";

export default function Toolbar({
  viewMode,
  viewModesEnabled,
  theme,
  saveEnabled,
  saving,
  autoSave,
  sidebarCollapsed,
  onToggleSidebar,
  onNewFile,
  onOpenFile,
  onSave,
  onToggleAutoSave,
  onSetViewMode,
  onToggleTheme,
}: ToolbarProps) {
  const themeLabel =
    theme === "light" ? "Switch to dark theme" : "Switch to light theme";
  const sidebarLabel = sidebarCollapsed
    ? "Show recent files (Ctrl+\\)"
    : "Hide recent files (Ctrl+\\)";
  return (
    <div className={toolbarShell} role="toolbar" aria-label="Workspace controls">
      <button
        type="button"
        className={iconButton}
        aria-label={sidebarLabel}
        aria-pressed={!sidebarCollapsed}
        title={sidebarLabel}
        onClick={onToggleSidebar}
      >
        <PanelLeftIcon />
      </button>
      <span className={toolbarDivider} aria-hidden="true" />
      <button type="button" className={buttonBase} onClick={onNewFile}>
        <NewFileIcon />
        <span>New</span>
      </button>
      <button
        type="button"
        className={buttonBase}
        onClick={onSave}
        disabled={!saveEnabled}
        aria-disabled={!saveEnabled}
        aria-busy={saving}
      >
        <SaveIcon />
        <span>Save</span>
      </button>
      <label className={autoSaveLabel}>
        <input
          type="checkbox"
          className={autoSaveCheckbox}
          checked={autoSave}
          onChange={(e) => onToggleAutoSave(e.target.checked)}
        />
        <span>Auto-save</span>
      </label>
      <button type="button" className={buttonBase} onClick={onOpenFile}>
        <FolderOpenIcon />
        <span>Open</span>
      </button>
      <div
        className={`${segmentGroup} ml-auto`}
        role="group"
        aria-label="View mode"
      >
        {segments.map(({ mode, label }) => {
          const active = viewModesEnabled && viewMode === mode;
          return (
            <button
              key={mode}
              type="button"
              className={`${segmentBase}${active ? ` ${segmentActive}` : ""}`}
              aria-pressed={active}
              disabled={!viewModesEnabled}
              aria-disabled={!viewModesEnabled}
              title={
                viewModesEnabled
                  ? undefined
                  : "View modes are unavailable for JSON documents"
              }
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
