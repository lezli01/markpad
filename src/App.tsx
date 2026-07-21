import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { EditorState, StateEffect } from "@codemirror/state";
import Workspace from "./components/Workspace";
import Toolbar from "./components/Toolbar";
import ErrorBanner from "./components/ErrorBanner";
import RecentsPanel, { type RecentEntry } from "./components/RecentsPanel";
import ConfirmDialog from "./components/ConfirmDialog";
import type { EditorHandle } from "./components/Editor";
import type { PreviewHandle } from "./components/Preview";
import {
  openTextFile,
  openTextFileByPath,
  saveTextFile,
  saveTextFileAs,
  setWindowTitle,
} from "./lib/fileOpen";
import { getPendingFiles, subscribeToOpenFiles } from "./lib/launchFiles";
import { loadSession, saveSession, type SessionItem } from "./lib/session";
import {
  asDocumentLanguage,
  resolveLanguage,
  type DocumentLanguage,
} from "./lib/documentLanguage";
import {
  getAutoSave,
  getSidebarCollapsed,
  getSidebarWidth,
  getTheme,
  getViewMode,
  setAutoSave as persistAutoSave,
  setSidebarCollapsed as persistSidebarCollapsed,
  setSidebarWidth as persistSidebarWidth,
  setTheme as persistTheme,
  setViewMode as persistViewMode,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  type Theme,
  type ViewMode,
} from "./lib/preferences";

export type ItemId = string;

/**
 * A recents entry. Files on disk are reloaded lazily (buffer released when they
 * go inactive and clean); untitled drafts and any modified item keep their live
 * buffer in memory. `text`/`savedText` are only meaningful while `loaded`.
 */
export type RecentItem = {
  id: ItemId;
  kind: "file" | "untitled";
  path: string | null;
  name: string;
  loaded: boolean;
  text: string;
  savedText: string;
  lastActive: number;
  /** Manual language choice from the pane-header toggle; null means "derive
      from the path" (see resolveLanguage). Cleared on Save-As, where the
      chosen extension becomes authoritative. */
  languageOverride: DocumentLanguage | null;
};

type ItemSnapshot = {
  state: EditorState;
  scrollSnapshot: StateEffect<unknown>;
  previewScrollTop: number;
};

const MAX_ITEMS = 50;
const AUTO_SAVE_DEBOUNCE_MS = 1500;
const SESSION_DEBOUNCE_MS = 400;

// An item shows in the top "modified" tier (and keeps its buffer) when it's an
// untitled draft, or a file with unsaved edits.
function isModified(item: RecentItem): boolean {
  return item.kind === "untitled" || item.text !== item.savedText;
}

// Whether removing the item would discard actual unsaved content (drives the
// confirm prompt). An empty untitled has nothing to lose.
function hasUnsavedWork(item: RecentItem): boolean {
  return item.text !== item.savedText;
}

// Display order: modified items on top, then clean items; MRU within each tier.
function sortItems(items: RecentItem[]): RecentItem[] {
  return [...items].sort((a, b) => {
    const am = isModified(a) ? 1 : 0;
    const bm = isModified(b) ? 1 : 0;
    if (am !== bm) return bm - am;
    return b.lastActive - a.lastActive;
  });
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function clampWidth(px: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, px));
}

const nextItemId = (() => {
  let n = 0;
  return (): ItemId => `item-${++n}`;
})();

function makeUntitledLabel(existing: RecentItem[]): string {
  let max = 0;
  for (const t of existing) {
    if (t.kind !== "untitled") continue;
    const m = /^Untitled-(\d+)$/.exec(t.name);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `Untitled-${max + 1}`;
}

const kbdClass =
  "inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 text-xs font-medium rounded border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--text)] font-mono";

function EmptyState({ modKey }: { modKey: string }) {
  return (
    <div className="h-full flex items-center justify-center bg-[color:var(--bg)]">
      <div className="text-center max-w-sm px-6">
        <h2 className="text-lg font-semibold text-[color:var(--text)] mb-2">
          No file open
        </h2>
        <p className="text-sm text-[color:var(--muted)] mb-6">
          Open an existing markdown or JSON file, or create a new one to start
          editing.
        </p>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center text-sm text-[color:var(--text)] text-left">
          <kbd className={kbdClass}>{modKey}+N</kbd>
          <span>New file</span>
          <kbd className={kbdClass}>{modKey}+O</kbd>
          <span>Open file</span>
          <kbd className={kbdClass}>{modKey}+S</kbd>
          <span>Save current file</span>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [items, setItems] = useState<RecentItem[]>([]);
  const [activeId, setActiveId] = useState<ItemId | null>(null);
  const [savingById, setSavingById] = useState<Record<ItemId, boolean>>({});
  const [pendingRemove, setPendingRemove] = useState<ItemId | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => getViewMode());
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  const [autoSave, setAutoSaveState] = useState<boolean>(() => getAutoSave());
  const [sidebarWidth, setSidebarWidth] = useState<number>(() =>
    getSidebarWidth(),
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() =>
    getSidebarCollapsed(),
  );

  const editorStatesRef = useRef<Map<ItemId, ItemSnapshot>>(new Map());
  const editorRef = useRef<EditorHandle>(null);
  const previewRef = useRef<PreviewHandle>(null);
  const pendingSaveRef = useRef<Map<ItemId, boolean>>(new Map());
  const itemsRef = useRef<RecentItem[]>([]);
  const activeIdRef = useRef<ItemId | null>(null);
  const sidebarWidthRef = useRef<number>(sidebarWidth);
  const activationSeqRef = useRef(0);
  const activeCounterRef = useRef(1);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  const activeItem = items.find((t) => t.id === activeId) ?? null;
  const activeText = activeItem?.text ?? "";
  const activeLanguage: DocumentLanguage = activeItem
    ? resolveLanguage(activeItem.path, activeItem.languageOverride)
    : "markdown";
  const activeSaving =
    activeItem !== null && (savingById[activeItem.id] ?? false);
  const saveEnabled = activeItem !== null && !activeSaving;

  const recentEntries = useMemo<RecentEntry[]>(
    () =>
      sortItems(items).map((t) => ({
        id: t.id,
        name: t.name,
        path: t.path,
        modified: isModified(t),
      })),
    [items],
  );

  function nextActive(): number {
    return activeCounterRef.current++;
  }

  function bumpActive(id: ItemId) {
    const stamp = nextActive();
    setItems((list) =>
      list.map((t) => (t.id === id ? { ...t, lastActive: stamp } : t)),
    );
  }

  // Capture the outgoing item's editor state, and release its buffer when it's a
  // clean file (reloadable from disk). Modified/untitled items keep their buffer.
  function detachActive() {
    // Any switch invalidates an in-flight disk read: bumping the sequence here
    // (not only inside loadItemFromDisk) ensures a load started for a now-released
    // clean file can't resurrect its buffer after we've moved to another item.
    activationSeqRef.current++;
    const prevId = activeIdRef.current;
    if (prevId === null) return;
    const prev = itemsRef.current.find((t) => t.id === prevId);
    const willRelease =
      prev != null && prev.kind === "file" && prev.text === prev.savedText;
    if (!willRelease && editorRef.current) {
      const previous = editorStatesRef.current.get(prevId);
      editorStatesRef.current.set(prevId, {
        state: editorRef.current.getState(),
        scrollSnapshot: editorRef.current.getScrollSnapshot(),
        previewScrollTop:
          previewRef.current?.getScrollTop() ??
          previous?.previewScrollTop ??
          0,
      });
    }
    if (willRelease) {
      editorStatesRef.current.delete(prevId);
      setItems((list) =>
        list.map((t) =>
          t.id === prevId
            ? { ...t, loaded: false, text: "", savedText: "" }
            : t,
        ),
      );
    }
  }

  async function loadItemFromDisk(id: ItemId): Promise<void> {
    const item = itemsRef.current.find((t) => t.id === id);
    if (!item || item.kind !== "file" || !item.path) return;
    const seq = ++activationSeqRef.current;
    const result = await openTextFileByPath(item.path);
    if (seq !== activationSeqRef.current) return;
    if (result.kind === "ok") {
      setItems((list) =>
        list.map((t) =>
          t.id === id
            ? {
                ...t,
                loaded: true,
                text: result.content,
                savedText: result.content,
                name: result.name,
              }
            : t,
        ),
      );
    } else {
      setError(
        result.kind === "error"
          ? result.message
          : "This file could not be opened.",
      );
      removeItemImmediate(id);
    }
  }

  async function activateItem(id: ItemId): Promise<void> {
    if (activeIdRef.current === id) return;
    detachActive();
    const target = itemsRef.current.find((t) => t.id === id);
    if (!target) return;
    setActiveId(id);
    activeIdRef.current = id;
    // Selecting an item must NOT reorder the list — a recent stays where it is
    // until it's actually modified. The promotion to the top happens in
    // updateActiveItemText, only on the first (clean → dirty) edit.
    if (target.kind === "file" && !target.loaded) {
      await loadItemFromDisk(id);
    }
  }

  useLayoutEffect(() => {
    if (activeId === null) return;
    const snapshot = editorStatesRef.current.get(activeId);
    if (snapshot) {
      if (editorRef.current) {
        editorRef.current.setState(snapshot.state);
        editorRef.current.applyScrollSnapshot(snapshot.scrollSnapshot);
      }
      previewRef.current?.setScrollTop(snapshot.previewScrollTop);
    } else {
      previewRef.current?.setScrollTop(0);
    }
  }, [activeId]);

  // Prune per-item bookkeeping for items no longer in the list.
  useEffect(() => {
    const ids = new Set(items.map((t) => t.id));
    for (const key of Array.from(editorStatesRef.current.keys())) {
      if (!ids.has(key)) editorStatesRef.current.delete(key);
    }
    for (const key of Array.from(pendingSaveRef.current.keys())) {
      if (!ids.has(key)) pendingSaveRef.current.delete(key);
    }
  }, [items]);

  // --- Mount: subscribe to OS file routing, restore the session, drain pending. ---
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    (async () => {
      unlisten = await subscribeToOpenFiles((paths) => {
        void openPaths(paths);
      });
      if (cancelled) {
        unlisten();
        return;
      }

      const session = await loadSession();
      if (cancelled) return;

      const count = session.items.length;
      const restored: RecentItem[] = session.items
        .map((s, i): RecentItem => {
          const stamp = count - i;
          if (s.kind === "untitled") {
            const text = s.text ?? "";
            const savedText = s.saved_text ?? "";
            return {
              id: nextItemId(),
              kind: "untitled",
              path: null,
              name: s.name || "Untitled-1",
              loaded: true,
              text,
              savedText,
              lastActive: stamp,
              languageOverride: asDocumentLanguage(s.language),
            };
          }
          const path = s.path ?? "";
          const name = s.name || basename(path);
          if (s.dirty && s.text != null) {
            return {
              id: nextItemId(),
              kind: "file",
              path,
              name,
              loaded: true,
              text: s.text,
              savedText: s.saved_text ?? "",
              lastActive: stamp,
              languageOverride: asDocumentLanguage(s.language),
            };
          }
          return {
            id: nextItemId(),
            kind: "file",
            path,
            name,
            loaded: false,
            text: "",
            savedText: "",
            lastActive: stamp,
            languageOverride: asDocumentLanguage(s.language),
          };
        })
        .filter((t) => t.kind === "untitled" || (t.path?.length ?? 0) > 0);

      activeCounterRef.current = count + 1;

      let initialActiveId: ItemId | null = null;
      const idx = session.active_index;
      if (idx !== null && idx >= 0 && idx < restored.length) {
        initialActiveId = restored[idx].id;
      }
      if (initialActiveId === null && restored.length > 0) {
        initialActiveId = restored[0].id;
      }

      // Enforce the 50-item cap on restore as well (e.g. a migrated v1 session
      // carrying more tabs), protecting the active item and any modified drafts.
      const capped = capList(restored, initialActiveId ?? "", initialActiveId);
      setItems(capped);
      itemsRef.current = capped;
      setActiveId(initialActiveId);
      activeIdRef.current = initialActiveId;

      if (initialActiveId !== null) {
        const act = capped.find((t) => t.id === initialActiveId);
        if (act && act.kind === "file" && !act.loaded) {
          await loadItemFromDisk(initialActiveId);
        }
      }

      const pending = await getPendingFiles();
      if (cancelled) return;
      if (pending.length > 0) {
        await openPaths(pending);
      }
    })();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setWindowTitle(activeItem?.name ?? null);
  }, [activeId, activeItem?.name]);

  // --- Persist the recents list (+ drafts) on any change. ---
  useEffect(() => {
    const handle = setTimeout(() => {
      const displayed = sortItems(itemsRef.current);
      const sessionItems: SessionItem[] = displayed.map((t) => {
        if (t.kind === "untitled") {
          return {
            kind: "untitled",
            path: null,
            name: t.name,
            dirty: t.text !== t.savedText,
            text: t.text,
            saved_text: t.savedText,
            language: t.languageOverride,
          };
        }
        if (isModified(t)) {
          return {
            kind: "file",
            path: t.path,
            name: t.name,
            dirty: true,
            text: t.text,
            saved_text: t.savedText,
            language: t.languageOverride,
          };
        }
        return {
          kind: "file",
          path: t.path,
          name: t.name,
          dirty: false,
          text: null,
          saved_text: null,
          language: t.languageOverride,
        };
      });
      let activeIndex: number | null = null;
      const aId = activeIdRef.current;
      if (aId !== null) {
        const i = displayed.findIndex((t) => t.id === aId);
        activeIndex = i >= 0 ? i : null;
      }
      void saveSession({
        version: 2,
        items: sessionItems,
        active_index: activeIndex,
      });
    }, SESSION_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [items, activeId]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // --- Auto-save (files with a path only; never auto-Save-As an untitled draft). ---
  useEffect(() => {
    if (!autoSave) return;
    if (activeItem === null) return;
    if (activeItem.kind !== "file" || !activeItem.path) return;
    if (activeItem.text === activeItem.savedText) return;
    if (savingById[activeItem.id]) return;
    const id = activeItem.id;
    const handle = setTimeout(() => {
      void performSave(id);
    }, AUTO_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // performSave reads latest state via refs; intentionally not in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, items, autoSave, savingById]);

  function updateActiveItemText(next: string) {
    const id = activeIdRef.current;
    if (id === null) return;
    const cur = itemsRef.current.find((t) => t.id === id);
    setItems((list) =>
      list.map((t) => (t.id === id ? { ...t, text: next } : t)),
    );
    // Clean file just became dirty → promote it to the top of the modified tier.
    if (
      cur &&
      cur.kind === "file" &&
      cur.text === cur.savedText &&
      next !== cur.savedText
    ) {
      bumpActive(id);
    }
  }

  function handleNewFile() {
    detachActive();
    const label = makeUntitledLabel(itemsRef.current);
    const stamp = nextActive();
    const id = nextItemId();
    const newItem: RecentItem = {
      id,
      kind: "untitled",
      path: null,
      name: label,
      loaded: true,
      text: "",
      savedText: "",
      lastActive: stamp,
      languageOverride: null,
    };
    const prevActive = activeIdRef.current;
    setItems((prev) => capList([...prev, newItem], id, prevActive));
    setActiveId(id);
    activeIdRef.current = id;
    setError(null);
  }

  async function handleOpenFile() {
    const result = await openTextFile();
    if (result.kind === "ok") {
      const existing = itemsRef.current.find((t) => t.path === result.path);
      if (existing) {
        await activateItem(existing.id);
        setError(null);
        return;
      }
      detachActive();
      const stamp = nextActive();
      const id = nextItemId();
      const newItem: RecentItem = {
        id,
        kind: "file",
        path: result.path,
        name: result.name,
        loaded: true,
        text: result.content,
        savedText: result.content,
        lastActive: stamp,
        languageOverride: null,
      };
      const prevActive = activeIdRef.current;
      setItems((prev) => capList([...prev, newItem], id, prevActive));
      setActiveId(id);
      activeIdRef.current = id;
      setError(null);
    } else if (result.kind === "error") {
      setError(result.message);
    }
    // kind === "cancelled": no-op
  }

  // Add file references for OS-routed paths (pending/live). References are loaded
  // lazily; only the finally-activated item is read from disk here, so any read
  // error surfaces via loadItemFromDisk when that item becomes active.
  async function openPaths(paths: string[]): Promise<void> {
    let lastId: ItemId | null = null;
    for (const path of paths) {
      const existing = itemsRef.current.find((t) => t.path === path);
      if (existing) {
        lastId = existing.id;
        continue;
      }
      const stamp = nextActive();
      const id = nextItemId();
      const newItem: RecentItem = {
        id,
        kind: "file",
        path,
        name: basename(path),
        loaded: false,
        text: "",
        savedText: "",
        lastActive: stamp,
        languageOverride: null,
      };
      const prevActive = activeIdRef.current;
      const next = capList([...itemsRef.current, newItem], id, prevActive);
      itemsRef.current = next;
      setItems(next);
      lastId = id;
    }
    if (lastId !== null) {
      await activateItem(lastId);
    }
  }

  // Evict the least-recently-used clean files when over the cap. Modified items,
  // the freshly added item, and the active item are protected.
  function capList(
    list: RecentItem[],
    keepId: ItemId,
    activeItemId: ItemId | null,
  ): RecentItem[] {
    if (list.length <= MAX_ITEMS) return list;
    const removable = list
      .filter(
        (t) =>
          t.id !== keepId && t.id !== activeItemId && !isModified(t),
      )
      .sort((a, b) => a.lastActive - b.lastActive);
    const need = list.length - MAX_ITEMS;
    const removeIds = new Set(removable.slice(0, need).map((t) => t.id));
    if (removeIds.size === 0) return list;
    return list.filter((t) => !removeIds.has(t.id));
  }

  async function performSave(id: ItemId | null = activeId): Promise<boolean> {
    if (id === null) return false;
    if (savingById[id]) {
      pendingSaveRef.current.set(id, true);
      return false;
    }
    const item = itemsRef.current.find((t) => t.id === id);
    if (!item) return false;
    setSavingById((prev) => ({ ...prev, [id]: true }));
    const outbound = item.text;
    const displayName = item.name;
    let success = false;
    if (item.kind === "untitled") {
      const language = resolveLanguage(item.path, item.languageOverride);
      const result = await saveTextFileAs(
        outbound,
        `${item.name}.${language === "json" ? "json" : "md"}`,
        language,
      );
      if (result.kind === "ok") {
        setItems((list) =>
          list.map((t) =>
            t.id === id
              ? {
                  ...t,
                  kind: "file",
                  path: result.path,
                  name: result.name,
                  savedText: outbound,
                  // The saved extension is authoritative from here on.
                  languageOverride: null,
                }
              : t,
          ),
        );
        setError(null);
        success = true;
      } else if (result.kind === "error") {
        setError(`Could not save ${displayName}: ${result.message}`);
      }
      // cancelled: no-op
    } else if (item.path) {
      const result = await saveTextFile(item.path, outbound);
      if (result.kind === "ok") {
        setItems((list) =>
          list.map((t) => (t.id === id ? { ...t, savedText: outbound } : t)),
        );
        setError(null);
        success = true;
      } else {
        setError(`Could not save ${displayName}: ${result.message}`);
      }
    }
    setSavingById((prev) => ({ ...prev, [id]: false }));
    if (pendingSaveRef.current.get(id)) {
      pendingSaveRef.current.set(id, false);
      queueMicrotask(() => {
        void performSave(id);
      });
    }
    return success;
  }

  function handleSave() {
    void performSave();
  }

  function removeItemImmediate(id: ItemId) {
    const wasActive = activeIdRef.current === id;
    const displayed = sortItems(itemsRef.current);
    const idx = displayed.findIndex((t) => t.id === id);
    const next = itemsRef.current.filter((t) => t.id !== id);
    editorStatesRef.current.delete(id);
    pendingSaveRef.current.delete(id);
    itemsRef.current = next;
    setItems(next);
    setSavingById((prev) => {
      const out = { ...prev };
      delete out[id];
      return out;
    });
    if (wasActive) {
      const neighbor =
        displayed[idx + 1] ?? displayed[idx - 1] ?? null;
      const neighborId = neighbor?.id ?? null;
      setActiveId(neighborId);
      activeIdRef.current = neighborId;
      if (neighbor && neighbor.kind === "file" && !neighbor.loaded) {
        void loadItemFromDisk(neighbor.id);
      }
    }
    setPendingRemove((prev) => (prev === id ? null : prev));
  }

  function handleRemove(id: ItemId) {
    const item = itemsRef.current.find((t) => t.id === id);
    if (!item) return;
    if (hasUnsavedWork(item)) {
      setPendingRemove(id);
      return;
    }
    removeItemImmediate(id);
  }

  async function handleConfirmSave() {
    if (pendingRemove === null) return;
    const id = pendingRemove;
    const ok = await performSave(id);
    if (!ok) {
      setPendingRemove(null);
      return;
    }
    removeItemImmediate(id);
    setPendingRemove(null);
  }

  function handleConfirmDiscard() {
    if (pendingRemove === null) return;
    removeItemImmediate(pendingRemove);
    setPendingRemove(null);
  }

  function handleConfirmCancel() {
    setPendingRemove(null);
  }

  function handleSetViewMode(mode: ViewMode) {
    setViewMode(mode);
    persistViewMode(mode);
  }

  function handleSetLanguage(language: DocumentLanguage) {
    const id = activeIdRef.current;
    if (id === null) return;
    setItems((list) =>
      list.map((t) =>
        t.id === id ? { ...t, languageOverride: language } : t,
      ),
    );
  }

  function handleToggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setThemeState(next);
    persistTheme(next);
  }

  function handleToggleAutoSave(next: boolean) {
    setAutoSaveState(next);
    persistAutoSave(next);
  }

  function handleToggleSidebar() {
    setSidebarCollapsed((c) => {
      const next = !c;
      persistSidebarCollapsed(next);
      return next;
    });
  }

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidthRef.current;
    document.body.style.userSelect = "none";
    function onMove(ev: PointerEvent) {
      setSidebarWidth(clampWidth(startWidth + (ev.clientX - startX)));
    }
    function onUp() {
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      persistSidebarWidth(sidebarWidthRef.current);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const handleSaveRef = useRef(handleSave);
  const handleNewFileRef = useRef(handleNewFile);
  const handleOpenFileRef = useRef(handleOpenFile);
  const handleToggleSidebarRef = useRef(handleToggleSidebar);

  useEffect(() => {
    handleSaveRef.current = handleSave;
    handleNewFileRef.current = handleNewFile;
    handleOpenFileRef.current = handleOpenFile;
    handleToggleSidebarRef.current = handleToggleSidebar;
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.shiftKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        handleSaveRef.current();
      } else if (key === "n") {
        e.preventDefault();
        handleNewFileRef.current();
      } else if (key === "o") {
        e.preventDefault();
        void handleOpenFileRef.current();
      } else if (key === "\\") {
        e.preventDefault();
        handleToggleSidebarRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const pendingRemoveItem =
    items.find((t) => t.id === pendingRemove) ?? null;
  const pendingRemoveName = pendingRemoveItem?.name ?? "Untitled";

  const isMac =
    typeof navigator !== "undefined" &&
    /mac/i.test(navigator.platform || navigator.userAgent || "");
  const modKey = isMac ? "⌘" : "Ctrl";

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[color:var(--bg)] text-[color:var(--text)]">
      {!sidebarCollapsed && (
        <>
          <aside
            style={{ width: sidebarWidth }}
            className="shrink-0 h-full overflow-hidden bg-[color:var(--panel)]"
          >
            <RecentsPanel
              items={recentEntries}
              activeId={activeId}
              onActivate={(id) => void activateItem(id)}
              onRemove={handleRemove}
            />
          </aside>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize recent files panel"
            onPointerDown={startResize}
            style={{ touchAction: "none" }}
            className="relative w-px shrink-0 cursor-col-resize bg-[color:var(--border)] transition-colors hover:bg-[color:var(--accent)] before:absolute before:inset-y-0 before:-left-1 before:-right-1 before:content-['']"
          />
        </>
      )}
      <div className="flex-1 min-w-0 h-full flex flex-col">
        <Toolbar
          viewMode={viewMode}
          viewModesEnabled={activeLanguage !== "json"}
          theme={theme}
          saveEnabled={saveEnabled}
          saving={activeSaving}
          autoSave={autoSave}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={handleToggleSidebar}
          onNewFile={handleNewFile}
          onOpenFile={handleOpenFile}
          onSave={handleSave}
          onToggleAutoSave={handleToggleAutoSave}
          onSetViewMode={handleSetViewMode}
          onToggleTheme={handleToggleTheme}
        />
        {error !== null && (
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        )}
        <div className="flex-1 min-h-0">
          {activeItem === null ? (
            <EmptyState modKey={modKey} />
          ) : (
            <Workspace
              text={activeText}
              language={activeLanguage}
              viewMode={viewMode}
              onTextChange={updateActiveItemText}
              onFormat={(id) => editorRef.current?.format(id)}
              onJsonAction={(id) => editorRef.current?.runJsonAction(id)}
              onJsonActionError={setError}
              onLanguageChange={handleSetLanguage}
              modKey={modKey}
              editorRef={editorRef}
              previewRef={previewRef}
            />
          )}
        </div>
      </div>
      <ConfirmDialog
        open={pendingRemove !== null}
        title={`Save changes to ${pendingRemoveName}?`}
        message="You have unsaved changes. Save them now, discard them, or cancel and keep the item in the list?"
        onSave={() => {
          void handleConfirmSave();
        }}
        onDiscard={handleConfirmDiscard}
        onCancel={handleConfirmCancel}
      />
    </div>
  );
}

export default App;
