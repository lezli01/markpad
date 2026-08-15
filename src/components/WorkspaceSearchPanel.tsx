import { useEffect, useMemo, useRef } from "react";
import {
  countWorkspaceSearchMatches,
  type WorkspaceSearchFile,
  type WorkspaceSearchStatus,
} from "../lib/workspaceSearch";

type WorkspaceSearchPanelProps = {
  rootPath: string | null;
  query: string;
  files: WorkspaceSearchFile[];
  status: WorkspaceSearchStatus;
  error: string | null;
  focusRequest: number;
  onChooseFolder: () => void;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  onSelectResult: (path: string, lineNumber: number) => void;
  onClose: () => void;
};

const iconButton =
  "inline-flex size-7 items-center justify-center rounded-md text-[color:var(--muted)] transition-colors hover:bg-[color:var(--hover)] hover:text-[color:var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]";

function SearchFilesIcon({ size = 18 }: { size?: number }) {
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
      <path d="M3.5 6.5A2.5 2.5 0 0 1 6 4h3.4l2 2H18a2.5 2.5 0 0 1 2.5 2.5v2" />
      <circle cx="14.5" cy="15" r="4" />
      <path d="m17.5 18 3 3" />
    </svg>
  );
}

function FolderIcon() {
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
      strokeLinejoin="round"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
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

function ArrowIcon() {
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
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function folderName(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/$/, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || normalized;
}

export default function WorkspaceSearchPanel({
  rootPath,
  query,
  files,
  status,
  error,
  focusRequest,
  onChooseFolder,
  onQueryChange,
  onSearch,
  onSelectResult,
  onClose,
}: WorkspaceSearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const totalMatches = useMemo(
    () => countWorkspaceSearchMatches(files),
    [files],
  );

  useEffect(() => {
    if (!rootPath) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest, rootPath]);

  const searched = status === "complete";
  const searching = status === "searching";
  const canSearch = rootPath !== null && query.trim().length > 0 && !searching;

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-[color:var(--panel)]"
      aria-label="Search files"
    >
      <header className="flex items-center gap-2 border-b border-[color:var(--border)] px-3 py-2.5">
        <div className="flex size-7 items-center justify-center rounded-md bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
          <SearchFilesIcon />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight text-[color:var(--text)]">
            Search files
          </h2>
          <p className="text-[11px] leading-tight text-[color:var(--muted)]">
            Markdown, JSON, and YAML
          </p>
        </div>
        <button
          type="button"
          className={iconButton}
          aria-label="Close file search"
          title="Back to recent files"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>

      <div className="border-b border-[color:var(--border)] p-3">
        <button
          type="button"
          onClick={onChooseFolder}
          className="group mb-2.5 flex w-full items-center gap-2 rounded-md border border-[color:var(--border)] bg-[color:var(--bg)] px-2.5 py-2 text-left transition-colors hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
        >
          <span className="text-[color:var(--accent)]">
            <FolderIcon />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
              Workspace
            </span>
            <span
              className="block truncate text-xs font-medium text-[color:var(--text)]"
              title={rootPath ?? undefined}
            >
              {rootPath ? folderName(rootPath) : "Choose a folder"}
            </span>
          </span>
          <span className="text-[color:var(--muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[color:var(--accent)]">
            <ArrowIcon />
          </span>
        </button>

        <form
          className="flex items-stretch overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--bg)] focus-within:border-[color:var(--accent)] focus-within:ring-1 focus-within:ring-[color:var(--accent)]"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSearch) onSearch();
          }}
        >
          <label className="sr-only" htmlFor="workspace-search-input">
            Search text across workspace files
          </label>
          <input
            ref={inputRef}
            id="workspace-search-input"
            type="search"
            value={query}
            disabled={rootPath === null}
            placeholder={rootPath ? "Search text…" : "Choose a folder first"}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onQueryChange(event.target.value)}
            className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-sm text-[color:var(--text)] outline-none placeholder:text-[color:var(--muted)] disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!canSearch}
            className="border-l border-[color:var(--border)] px-2.5 text-xs font-semibold text-[color:var(--accent)] transition-colors hover:bg-[color:var(--accent-soft)] focus:outline-none focus-visible:bg-[color:var(--accent-soft)] disabled:cursor-not-allowed disabled:text-[color:var(--muted)] disabled:opacity-55"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </form>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="sr-only" aria-live="polite">
          {searching
            ? "Searching workspace"
            : searched
              ? `${totalMatches} results in ${files.length} files`
              : ""}
        </div>

        {error !== null ? (
          <div className="m-3 rounded-md border border-[color:var(--danger)]/35 bg-[color:var(--danger)]/8 p-3 text-xs leading-relaxed text-[color:var(--text)]">
            {error}
          </div>
        ) : searching ? (
          <div className="flex items-center gap-2 px-4 py-6 text-xs text-[color:var(--muted)]">
            <span className="size-3.5 animate-spin rounded-full border-2 border-[color:var(--border)] border-t-[color:var(--accent)]" />
            Scanning workspace…
          </div>
        ) : rootPath === null ? (
          <div className="px-5 py-10 text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full border border-[color:var(--border)] text-[color:var(--muted)]">
              <SearchFilesIcon size={20} />
            </div>
            <p className="text-sm font-medium text-[color:var(--text)]">
              Pick a search scope
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--muted)]">
              Choose the folder that contains the notes and data files you want
              to search.
            </p>
          </div>
        ) : searched && files.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-[color:var(--text)]">
              No results found
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--muted)]">
              Nothing in this workspace matches “{query.trim()}”.
            </p>
          </div>
        ) : !searched ? (
          <div className="px-5 py-8 text-center text-xs leading-relaxed text-[color:var(--muted)]">
            Type a word or phrase, then press Enter to search every supported
            file in this folder.
          </div>
        ) : (
          <div className="pb-3">
            <div className="sticky top-0 z-10 border-b border-[color:var(--border)] bg-[color:var(--panel)]/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)] backdrop-blur">
              {totalMatches} {totalMatches === 1 ? "match" : "matches"} in{" "}
              {files.length} {files.length === 1 ? "file" : "files"}
            </div>
            {files.map((file) => (
              <details
                key={file.path}
                open
                className="group border-b border-[color:var(--border)]/75 [content-visibility:auto]"
              >
                <summary className="cursor-pointer list-none px-3 py-2.5 hover:bg-[color:var(--hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--accent)] [&::-webkit-details-marker]:hidden">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="mt-0.5 text-[10px] text-[color:var(--muted)] transition-transform group-open:rotate-90">
                      ▶
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-[color:var(--text)]">
                        {file.name}
                      </span>
                      <span
                        className="block truncate text-[10px] text-[color:var(--muted)]"
                        title={file.path}
                      >
                        {file.relativePath}
                      </span>
                    </span>
                    <span className="rounded-full bg-[color:var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[color:var(--accent)]">
                      {file.matches.length}
                    </span>
                  </div>
                </summary>
                <div className="pb-1.5">
                  {file.matches.map((match) => (
                    <button
                      key={`${match.lineNumber}:${match.preview}`}
                      type="button"
                      onClick={() =>
                        onSelectResult(file.path, match.lineNumber)
                      }
                      className="grid w-full grid-cols-[2.5rem_minmax(0,1fr)] gap-2 border-l-2 border-transparent px-3 py-1.5 text-left transition-colors hover:border-[color:var(--accent)] hover:bg-[color:var(--hover)] focus:outline-none focus-visible:border-[color:var(--accent)] focus-visible:bg-[color:var(--accent-soft)]"
                      title={`${file.relativePath}, line ${match.lineNumber}`}
                    >
                      <span className="pt-px text-right font-mono text-[10px] tabular-nums text-[color:var(--muted)]">
                        L{match.lineNumber}
                      </span>
                      <span className="truncate font-mono text-[11px] leading-4 text-[color:var(--text)]">
                        {match.preview || "(blank line)"}
                      </span>
                    </button>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
