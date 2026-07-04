import { useEffect, useRef, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

export type RecentEntry = {
  id: string;
  name: string;
  /** Absolute path for hover tooltips; null for untitled drafts. */
  path: string | null;
  /** True for modified/untitled items — shows the dot and sits in the top tier. */
  modified: boolean;
};

type RecentsPanelProps = {
  /** Pre-sorted: modified items first, then clean items, MRU within each tier. */
  items: RecentEntry[];
  activeId: string | null;
  onActivate(id: string): void;
  onRemove(id: string): void;
};

const header =
  "flex items-center px-3 pt-3 pb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)] select-none";

const listShell = "flex-1 min-h-0 overflow-y-auto px-1.5 pb-2";

// Row = a plain flex container holding two SIBLING buttons (activate + remove),
// never a button nested inside a role=button (that breaks keyboard activation of
// the inner control and pollutes the row's accessible name).
const rowWrap =
  "group relative flex items-center rounded-md transition-colors text-[color:var(--text)]";

const rowActive = "bg-[color:var(--accent-soft)]";
const rowInactive = "hover:bg-[color:var(--hover)]";

const activateButton =
  "flex-1 flex items-start gap-2 min-w-0 pl-3 pr-1 py-1.5 text-sm text-left rounded-md cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--accent)]";

const removeButton =
  "shrink-0 inline-flex items-center justify-center rounded p-0.5 mr-1 text-[color:var(--muted)] opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 hover:text-[color:var(--text)] hover:bg-[color:var(--hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] transition-opacity";

const menuShell =
  "fixed z-50 min-w-[10rem] max-w-[18rem] rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] py-1 shadow-lg text-sm text-[color:var(--text)]";

// Non-interactive full-path header shown at the top of the context menu.
// break-all lets a space-less path wrap; select-text keeps it manually copyable.
const menuHeader =
  "px-3 pb-1 pt-0.5 text-xs text-[color:var(--muted)] break-all select-text";

const menuDivider = "mx-1 my-1 h-px bg-[color:var(--border)]";

const menuItem =
  "flex w-full items-center px-3 py-1.5 text-left hover:bg-[color:var(--hover)] focus:outline-none focus-visible:bg-[color:var(--hover)]";

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="13"
      height="13"
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

type ContextMenuState = { id: string; x: number; y: number };

export default function RecentsPanel({
  items,
  activeId,
  onActivate,
  onRemove,
}: RecentsPanelProps) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dismiss the context menu on any outside interaction or Escape.
  useEffect(() => {
    if (menu === null) return;
    function dismiss() {
      setMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(null);
    }
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  // Index of the first clean item, so we can draw a divider between tiers.
  const firstCleanIndex = items.findIndex((it) => !it.modified);
  const hasTierSplit =
    firstCleanIndex > 0 && firstCleanIndex < items.length;

  return (
    <nav
      className="flex h-full flex-col"
      aria-label="Recent files"
      onContextMenu={(e) => {
        // Suppress the native menu on empty sidebar space too.
        e.preventDefault();
      }}
    >
      <div className={header}>
        <span>Recent</span>
        {items.length > 0 && (
          <span className="ml-auto font-normal tabular-nums text-[color:var(--muted)]">
            {items.length}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-start justify-center px-4 pt-6">
          <p className="text-sm text-[color:var(--muted)] text-center">
            No recent files.
          </p>
        </div>
      ) : (
        <ul className={listShell} role="list">
          {items.map((item, index) => {
            const isActive = item.id === activeId;
            const tooltip = item.path ?? item.name;
            return (
              <li key={item.id} role="listitem">
                {hasTierSplit && index === firstCleanIndex && (
                  <div
                    className="mx-2 my-1.5 h-px bg-[color:var(--border)]"
                    aria-hidden="true"
                  />
                )}
                <div
                  className={`${rowWrap} ${isActive ? rowActive : rowInactive}`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenu({ id: item.id, x: e.clientX, y: e.clientY });
                  }}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-[color:var(--accent)]"
                    />
                  )}
                  <button
                    type="button"
                    aria-current={isActive ? "true" : undefined}
                    title={tooltip}
                    className={`${activateButton}${isActive ? " font-medium" : ""}`}
                    onClick={() => onActivate(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Delete") {
                        e.preventDefault();
                        onRemove(item.id);
                      }
                    }}
                  >
                    <span
                      className="flex h-5 w-1.5 shrink-0 items-center justify-center"
                      aria-hidden="true"
                    >
                      {item.modified && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                      )}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">
                        {item.modified && (
                          <span className="sr-only">Modified. </span>
                        )}
                        {item.name}
                      </span>
                      {item.path && (
                        // Absolute path, clamped to two lines with a trailing
                        // ellipsis. line-clamp-2 supplies display:-webkit-box, which
                        // is what the clamp needs — do NOT add a `block` utility
                        // here, as it would override that display and silently
                        // disable the clamp. Full path stays reachable via the row's
                        // title tooltip and the right-click menu, so this truncated
                        // copy is hidden from assistive tech.
                        <span
                          className="mt-0.5 break-all text-[11px] leading-tight text-[color:var(--muted)] line-clamp-2"
                          aria-hidden="true"
                        >
                          {item.path}
                        </span>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${item.name} from recent files`}
                    className={removeButton}
                    onClick={() => onRemove(item.id)}
                  >
                    <CloseIcon />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {menu !== null && (() => {
        // Look up the right-clicked entry to surface its full path. Untitled
        // drafts have no path, so they get only the "Remove" action.
        const target = items.find((it) => it.id === menu.id) ?? null;
        const targetPath = target?.path ?? null;
        return (
          <div
            ref={menuRef}
            className={menuShell}
            style={{ left: menu.x, top: menu.y }}
            role="menu"
            // Keep clicks inside the menu from reaching the window-level
            // dismiss listener, which fires on pointerdown (before click) and
            // would otherwise unmount the item before its onClick runs.
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            {targetPath && (
              <>
                <div className={menuHeader} title={targetPath}>
                  {targetPath}
                </div>
                <div className={menuDivider} aria-hidden="true" />
                <button
                  type="button"
                  role="menuitem"
                  autoFocus
                  className={menuItem}
                  onClick={() => {
                    const path = targetPath;
                    setMenu(null);
                    // Fire-and-forget: a clipboard failure shouldn't block the
                    // menu from closing.
                    writeText(path).catch((err) => {
                      console.warn("Failed to copy path:", err);
                    });
                  }}
                >
                  Copy full path
                </button>
              </>
            )}
            <button
              type="button"
              role="menuitem"
              autoFocus={!targetPath}
              className={menuItem}
              onClick={() => {
                const id = menu.id;
                setMenu(null);
                onRemove(id);
              }}
            >
              Remove from list
            </button>
          </div>
        );
      })()}
    </nav>
  );
}
