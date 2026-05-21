type FileHeaderProps = {
  fileName: string | null;
  fullPath: string | null;
  isModified: boolean;
};

const headerShell =
  "flex items-center gap-2 min-w-0 rounded-2xl bg-[color:var(--islands-surface)] ring-1 ring-[color:var(--islands-ring)] shadow-sm backdrop-blur px-3 py-2 text-sm font-medium text-[color:var(--islands-text)]";

export default function FileHeader({
  fileName,
  fullPath,
  isModified,
}: FileHeaderProps) {
  const displayName = fileName ?? "Untitled";
  const hoverTitle = fullPath ?? fileName ?? "No file open";
  return (
    <header className={headerShell} role="status" aria-live="polite">
      <img
        src="/favicon.svg"
        alt=""
        aria-hidden="true"
        className="h-6 w-6 flex-shrink-0"
      />
      {isModified && <span aria-label="modified">* </span>}
      <span className="truncate" title={hoverTitle}>
        {displayName}
      </span>
    </header>
  );
}
