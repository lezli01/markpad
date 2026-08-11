// Shown when the file in the active pane was rewritten (or removed) on disk
// behind markpad's back — see lib/externalChange.ts for how that is detected.
//
// Deliberately a banner and not a modal: the user has just come back to the
// window and may well want to look at their buffer before deciding. Nothing is
// reloaded without them asking, so leaving the banner up is always safe.

type ExternalChangeBannerProps = {
  name: string;
  kind: "changed" | "deleted";
  /** True when reloading would throw away edits the user has not saved. */
  unsaved: boolean;
  onReload(): void;
  onDismiss(): void;
};

// Indigo rather than <ErrorBanner />'s amber: nothing has gone wrong, there is
// just a decision to make.
const bannerShell =
  "flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[color:var(--border)] border-l-2 border-l-[color:var(--accent)] bg-[color:var(--accent-soft)] px-4 py-2 text-[color:var(--text)]";

const actionButton =
  "shrink-0 inline-flex items-center rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-2.5 py-1 text-xs font-medium hover:bg-[color:var(--hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] transition-colors";

const primaryButton =
  "shrink-0 inline-flex items-center rounded-md border border-transparent bg-[color:var(--accent)] px-2.5 py-1 text-xs font-medium text-[color:var(--accent-fg)] hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] transition-opacity";

function ChangedIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="15"
      height="15"
      className="shrink-0 text-[color:var(--accent)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

function DeletedIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="15"
      height="15"
      className="shrink-0 text-[color:var(--accent)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

export default function ExternalChangeBanner({
  name,
  kind,
  unsaved,
  onReload,
  onDismiss,
}: ExternalChangeBannerProps) {
  if (kind === "deleted") {
    return (
      <div className={bannerShell} role="status">
        <DeletedIcon />
        <span className="text-sm">
          <span className="font-medium">{name}</span> no longer exists on disk.
          Your copy is still open here — save it to write the file again.
        </span>
        <button
          type="button"
          className={`${actionButton} ml-auto`}
          onClick={onDismiss}
        >
          Keep in editor
        </button>
      </div>
    );
  }

  return (
    <div className={bannerShell} role="status">
      <ChangedIcon />
      <span className="text-sm">
        <span className="font-medium">{name}</span> has changed on disk.
        {unsaved
          ? " Reloading discards the unsaved changes in this buffer."
          : " Reload to pick up the new content."}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button type="button" className={primaryButton} onClick={onReload}>
          Reload from disk
        </button>
        <button type="button" className={actionButton} onClick={onDismiss}>
          Keep my version
        </button>
      </div>
    </div>
  );
}
