import type { Heading } from "../lib/markdown";

type OutlinePanelProps = {
  /** Name of the active document, or null when nothing is open. */
  fileName: string | null;
  /** Only Markdown has headings; JSON and YAML get an explanation instead. */
  isMarkdown: boolean;
  headings: Heading[];
  onSelect: (line: number) => void;
  onClose: () => void;
};

const iconButton =
  "inline-flex size-7 items-center justify-center rounded-md text-[color:var(--muted)] transition-colors hover:bg-[color:var(--hover)] hover:text-[color:var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]";

// Each level below the document's shallowest heading indents by this much, so a
// document that starts at `##` is not pushed in by an empty first column.
const INDENT_REM = 0.75;

function OutlineIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6h.01M8 6h12M7 12h.01M11 12h9M7 18h.01M11 18h9" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full border border-[color:var(--border)] text-[color:var(--muted)]">
        <OutlineIcon size={20} />
      </div>
      <p className="text-sm font-medium text-[color:var(--text)]">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-[color:var(--muted)]">
        {detail}
      </p>
    </div>
  );
}

export default function OutlinePanel({
  fileName,
  isMarkdown,
  headings,
  onSelect,
  onClose,
}: OutlinePanelProps) {
  const topLevel = Math.min(...headings.map((heading) => heading.level));

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-[color:var(--panel)]"
      aria-label="Outline"
    >
      <header className="flex items-center gap-2 border-b border-[color:var(--border)] px-3 py-2.5">
        <div className="flex size-7 items-center justify-center rounded-md bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
          <OutlineIcon />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight text-[color:var(--text)]">
            Outline
          </h2>
          <p
            className="truncate text-[11px] leading-tight text-[color:var(--muted)]"
            title={fileName ?? undefined}
          >
            {fileName ?? "No document"}
          </p>
        </div>
        <button
          type="button"
          className={iconButton}
          aria-label="Close outline"
          title="Back to recent files"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {fileName === null ? (
          <EmptyState
            title="No document open"
            detail="Open or create a Markdown file to browse its headings here."
          />
        ) : !isMarkdown ? (
          <EmptyState
            title="No outline for this file"
            detail="The outline lists the headings of Markdown documents."
          />
        ) : headings.length === 0 ? (
          <EmptyState
            title="No headings yet"
            detail="Start a line with # to add a heading, and it will show up here."
          />
        ) : (
          <nav aria-label="Document headings" className="py-1.5">
            <ul>
              {headings.map((heading) => (
                <li key={`${heading.line}:${heading.text}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(heading.line)}
                    title={`${heading.text} (line ${heading.line})`}
                    style={{
                      paddingLeft: `${0.75 + (heading.level - topLevel) * INDENT_REM}rem`,
                    }}
                    className={`block w-full truncate border-l-2 border-transparent py-1.5 pr-3 text-left text-xs transition-colors hover:border-[color:var(--accent)] hover:bg-[color:var(--hover)] focus:outline-none focus-visible:border-[color:var(--accent)] focus-visible:bg-[color:var(--accent-soft)] ${
                      heading.level === topLevel
                        ? "font-semibold text-[color:var(--text)]"
                        : "text-[color:var(--muted)] hover:text-[color:var(--text)]"
                    }`}
                  >
                    {heading.text}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </section>
  );
}
