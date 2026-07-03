type ErrorBannerProps = {
  message: string;
  onDismiss: () => void;
};

const bannerShell =
  "flex items-center gap-3 border-b border-[color:var(--border)] border-l-2 border-l-amber-500 bg-amber-500/10 px-4 py-2 text-[color:var(--text)]";

const dismissButton =
  "ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--muted)] hover:text-[color:var(--text)] hover:bg-[color:var(--hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]";

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export default function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div className={bannerShell} role="status">
      <span className="text-sm">{message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        className={dismissButton}
        onClick={onDismiss}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
