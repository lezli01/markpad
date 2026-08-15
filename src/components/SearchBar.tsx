import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import type { SearchStatus } from "../lib/documentSearch";

type SearchBarProps = {
  query: string;
  status: SearchStatus;
  modKey: string;
  focusRequest: number;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
};

const iconButton =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[color:var(--muted)] transition-colors hover:bg-[color:var(--hover)] hover:text-[color:var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent";

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function searchStatusText(query: string, status: SearchStatus): string {
  if (query === "") return "Type to search";
  if (status.total === 0) return "No results";
  if (status.current === 0) return `${status.total} results`;
  return `${status.current} of ${status.total}`;
}

export default function SearchBar({
  query,
  status,
  modKey,
  focusRequest,
  onQueryChange,
  onNext,
  onPrevious,
  onClose,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hasMatches = status.total > 0;
  const statusText = searchStatusText(query, status);

  useLayoutEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (event.shiftKey) onPrevious();
    else onNext();
  }

  return (
    <div
      role="search"
      aria-label="Find in document"
      className="flex h-12 shrink-0 items-center justify-end gap-2 border-b border-[color:var(--border)] bg-[color:var(--panel)] px-3 max-sm:fixed max-sm:inset-x-2 max-sm:top-14 max-sm:z-30 max-sm:rounded-lg max-sm:border max-sm:shadow-lg"
    >
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[color:var(--border)] bg-[color:var(--bg)] focus-within:ring-2 focus-within:ring-[color:var(--accent)] sm:max-w-md">
        <span className="sr-only">Find in document</span>
        <span className="pointer-events-none ml-2 text-[color:var(--muted)]">
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
          placeholder="Find in document"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-[color:var(--text)] outline-none placeholder:text-[color:var(--muted)]"
        />
        <kbd className="mr-1 hidden rounded border border-[color:var(--border)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--muted)] sm:inline">
          {modKey} F
        </kbd>
      </label>
      <span
        role="status"
        aria-live="polite"
        className="min-w-20 text-right text-xs tabular-nums text-[color:var(--muted)]"
      >
        {statusText}
      </span>
      <div className="flex items-center gap-0.5" role="group" aria-label="Match navigation">
        <button
          type="button"
          className={iconButton}
          disabled={!hasMatches}
          aria-label="Previous match"
          title="Previous match (Shift+Enter)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onPrevious}
        >
          <span aria-hidden="true">↑</span>
        </button>
        <button
          type="button"
          className={iconButton}
          disabled={!hasMatches}
          aria-label="Next match"
          title="Next match (Enter)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onNext}
        >
          <span aria-hidden="true">↓</span>
        </button>
        <button
          type="button"
          className={iconButton}
          aria-label="Close search"
          title="Close search (Escape)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClose}
        >
          <span className="text-lg leading-none" aria-hidden="true">
            ×
          </span>
        </button>
      </div>
    </div>
  );
}
