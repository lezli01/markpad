type ErrorBannerProps = {
  message: string;
  onDismiss: () => void;
};

const bannerShell =
  "flex items-center gap-3 rounded-2xl bg-amber-100/90 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 ring-1 ring-amber-300/60 dark:ring-amber-700/60 shadow-sm px-4 py-2";

const dismissButton =
  "ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-900 dark:text-amber-100 hover:bg-amber-200/60 dark:hover:bg-amber-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500";

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
