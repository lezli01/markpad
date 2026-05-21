import { useEffect, useRef } from "react";
import type { Tab, TabId } from "../App";

type TabStripProps = {
  tabs: Tab[];
  activeTabId: TabId | null;
  onActivate(id: TabId): void;
  onClose(id: TabId): void;
};

const stripShell =
  "flex items-center gap-1 overflow-x-auto px-2 py-1.5 rounded-2xl bg-[color:var(--islands-surface)] ring-1 ring-[color:var(--islands-ring)] shadow-sm backdrop-blur flex-nowrap min-w-0";

const emptyLabel =
  "text-sm text-[color:var(--islands-muted)] px-2 select-none";

const pillBase =
  "flex items-center gap-1.5 px-2 py-1 min-w-0 max-w-[180px] rounded-md ring-1 text-sm cursor-pointer select-none transition-colors text-[color:var(--islands-text)]";

const pillActive =
  "bg-[color:var(--islands-cursor)]/15 ring-[color:var(--islands-cursor)]/40 font-medium shadow-sm";

const pillInactive =
  "bg-transparent ring-[color:var(--islands-ring)] hover:bg-[color:var(--islands-ring)]/50";

const closeButton =
  "inline-flex items-center justify-center rounded p-0.5 hover:bg-[color:var(--islands-ring)]/60 text-[color:var(--islands-text)]";

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="12"
      height="12"
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

export default function TabStrip({
  tabs,
  activeTabId,
  onActivate,
  onClose,
}: TabStripProps) {
  const tabRefs = useRef<Map<TabId, HTMLButtonElement | null>>(new Map());

  useEffect(() => {
    if (activeTabId === null) return;
    const node = tabRefs.current.get(activeTabId);
    node?.scrollIntoView({ behavior: "instant", inline: "nearest", block: "nearest" });
  }, [activeTabId]);

  if (tabs.length === 0) {
    return (
      <div className={stripShell} role="tablist" aria-label="Open files">
        <span className={emptyLabel}>No files open</span>
      </div>
    );
  }

  return (
    <div className={stripShell} role="tablist" aria-label="Open files">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isModified = tab.text !== tab.savedText;
        const displayName =
          tab.openedFile?.name ?? tab.untitledLabel ?? "Untitled";
        const hoverTitle = tab.openedFile?.path ?? displayName;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            ref={(node) => {
              tabRefs.current.set(tab.id, node);
            }}
            title={hoverTitle}
            onClick={() => onActivate(tab.id)}
            onKeyDown={(e) => {
              if (e.key === "Delete") {
                onClose(tab.id);
              }
            }}
            className={`${pillBase} ${isActive ? pillActive : pillInactive}`}
          >
            {isModified && (
              <span aria-label="modified" className="select-none">
                *
              </span>
            )}
            <span className="truncate flex-1 min-w-0">{displayName}</span>
            <span
              role="button"
              aria-label={`Close ${displayName}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
              className={closeButton}
            >
              <CloseIcon />
            </span>
          </button>
        );
      })}
    </div>
  );
}
