import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { EditorState, StateEffect } from "@codemirror/state";
import Workspace from "./components/Workspace";
import Toolbar from "./components/Toolbar";
import ErrorBanner from "./components/ErrorBanner";
import TabStrip from "./components/TabStrip";
import ConfirmDialog from "./components/ConfirmDialog";
import type { EditorHandle } from "./components/Editor";
import type { PreviewHandle } from "./components/Preview";
import {
  openMarkdownFile,
  openMarkdownFileByPath,
  saveMarkdownFile,
  saveMarkdownFileAs,
  setWindowTitle,
} from "./lib/fileOpen";
import { getPendingFiles, subscribeToOpenFiles } from "./lib/launchFiles";
import {
  loadSession,
  saveSession,
  type SessionTabEntry,
} from "./lib/session";
import {
  getAutoSave,
  getTheme,
  getViewMode,
  setAutoSave as persistAutoSave,
  setTheme as persistTheme,
  setViewMode as persistViewMode,
  type Theme,
  type ViewMode,
} from "./lib/preferences";

export type TabId = string;
export type Tab = {
  id: TabId;
  text: string;
  savedText: string;
  openedFile: { name: string; path: string } | null;
  untitledLabel: string | null;
};

type TabSnapshot = {
  state: EditorState;
  scrollSnapshot: StateEffect<unknown>;
  previewScrollTop: number;
};

const AUTO_SAVE_DEBOUNCE_MS = 1500;

const appShell =
  "h-screen w-screen flex flex-col gap-4 p-4 md:p-6 bg-gradient-to-br from-[color:var(--islands-bg-from)] to-[color:var(--islands-bg-to)]";

const emptyStateCard =
  "h-full flex items-center justify-center rounded-2xl bg-[color:var(--islands-surface)] ring-1 ring-[color:var(--islands-ring)] shadow-sm backdrop-blur";

const kbdClass =
  "inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 text-xs font-medium rounded-md ring-1 ring-[color:var(--islands-ring)] bg-[color:var(--islands-ring)]/30 text-[color:var(--islands-text)] font-mono";

function EmptyState({ modKey }: { modKey: string }) {
  return (
    <div className={emptyStateCard}>
      <div className="text-center max-w-sm px-6">
        <h2 className="text-lg font-semibold text-[color:var(--islands-text)] mb-2">
          No file open
        </h2>
        <p className="text-sm text-[color:var(--islands-muted)] mb-6">
          Open an existing markdown file or create a new one to start editing.
        </p>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center text-sm text-[color:var(--islands-text)] text-left">
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

const nextTabId = (() => {
  let n = 0;
  return (): TabId => `tab-${++n}`;
})();

function makeUntitledLabel(existing: Tab[]): string {
  let max = 0;
  for (const t of existing) {
    if (t.openedFile !== null) continue;
    if (t.untitledLabel === null) continue;
    const m = /^Untitled-(\d+)$/.exec(t.untitledLabel);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `Untitled-${max + 1}`;
}

function App() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<TabId | null>(null);
  const [savingByTab, setSavingByTab] = useState<Record<TabId, boolean>>({});
  const [pendingClose, setPendingClose] = useState<TabId | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => getViewMode());
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  const [autoSave, setAutoSaveState] = useState<boolean>(() => getAutoSave());

  const editorStatesRef = useRef<Map<TabId, TabSnapshot>>(new Map());
  const editorRef = useRef<EditorHandle>(null);
  const previewRef = useRef<PreviewHandle>(null);
  const pendingSaveRef = useRef<Map<TabId, boolean>>(new Map());
  const tabsRef = useRef<Tab[]>([]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const activeText = activeTab?.text ?? "";
  const activeSaving =
    activeTab !== null && (savingByTab[activeTab.id] ?? false);
  const saveEnabled = activeTab !== null && !activeSaving;

  function updateTab(id: TabId, patch: (t: Tab) => Tab) {
    setTabs((prev) => prev.map((t) => (t.id === id ? patch(t) : t)));
  }

  function updateActiveTabText(next: string) {
    if (activeTabId === null) return;
    updateTab(activeTabId, (t) => ({ ...t, text: next }));
  }

  function activateTab(nextId: TabId | null) {
    if (
      activeTabId !== null &&
      editorRef.current &&
      activeTabId !== nextId
    ) {
      const previous = editorStatesRef.current.get(activeTabId);
      editorStatesRef.current.set(activeTabId, {
        state: editorRef.current.getState(),
        scrollSnapshot: editorRef.current.getScrollSnapshot(),
        previewScrollTop:
          previewRef.current?.getScrollTop() ??
          previous?.previewScrollTop ??
          0,
      });
    }
    setActiveTabId(nextId);
  }

  useLayoutEffect(() => {
    if (activeTabId === null) return;
    const snapshot = editorStatesRef.current.get(activeTabId);
    if (snapshot) {
      if (editorRef.current) {
        editorRef.current.setState(snapshot.state);
        editorRef.current.applyScrollSnapshot(snapshot.scrollSnapshot);
      }
      previewRef.current?.setScrollTop(snapshot.previewScrollTop);
    } else {
      previewRef.current?.setScrollTop(0);
    }
  }, [activeTabId]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    (async () => {
      unlisten = await subscribeToOpenFiles((paths) => {
        void openPathsAsTabs(paths, { source: "live" });
      });
      if (cancelled) {
        unlisten();
        return;
      }

      const session = await loadSession();
      if (cancelled) return;
      const restored: Array<Tab | null> = [];
      for (const entry of session.tabs) {
        const result = await openMarkdownFileByPath(entry.path);
        if (cancelled) return;
        if (result.kind === "ok") {
          restored.push({
            id: nextTabId(),
            text: result.content,
            savedText: result.content,
            openedFile: { name: result.name, path: result.path },
            untitledLabel: null,
          });
        } else {
          restored.push(null);
        }
      }
      const survivingTabs = restored.filter(
        (t): t is Tab => t !== null,
      );
      setTabs(survivingTabs);

      let initialActiveId: TabId | null = null;
      const savedIdx = session.active_index;
      if (savedIdx !== null && savedIdx >= 0 && savedIdx < restored.length) {
        const at = restored[savedIdx];
        if (at !== null) {
          initialActiveId = at.id;
        }
      }
      if (initialActiveId === null && savedIdx !== null) {
        for (let i = savedIdx + 1; i < restored.length; i++) {
          const t = restored[i];
          if (t !== null) {
            initialActiveId = t.id;
            break;
          }
        }
        if (initialActiveId === null) {
          for (let i = Math.min(savedIdx - 1, restored.length - 1); i >= 0; i--) {
            const t = restored[i];
            if (t !== null) {
              initialActiveId = t.id;
              break;
            }
          }
        }
      }
      if (initialActiveId === null && survivingTabs.length > 0) {
        initialActiveId = survivingTabs[0].id;
      }
      setActiveTabId(initialActiveId);
      tabsRef.current = survivingTabs;

      const pending = await getPendingFiles();
      if (cancelled) return;
      if (pending.length > 0) {
        await openPathsAsTabs(pending, { source: "pending" });
      }
    })();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setWindowTitle(activeTab?.openedFile?.name ?? null);
  }, [activeTabId, activeTab?.openedFile?.name]);

  const tabPathsKey = useMemo(
    () => tabs.map((t) => t.openedFile?.path ?? "").join("|"),
    [tabs],
  );

  useEffect(() => {
    const id = setTimeout(() => {
      const savedTabs: SessionTabEntry[] = tabs
        .filter((t) => t.openedFile !== null)
        .map((t) => ({ path: t.openedFile!.path }));
      let activeIdx: number | null = null;
      if (activeTab?.openedFile) {
        const idx = savedTabs.findIndex(
          (s) => s.path === activeTab.openedFile!.path,
        );
        activeIdx = idx >= 0 ? idx : null;
      }
      void saveSession({
        version: 1,
        tabs: savedTabs,
        active_index: activeIdx,
      });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabPathsKey, activeTabId]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!autoSave) return;
    if (activeTab === null) return;
    if (activeTab.openedFile === null) return;
    if (activeTab.text === activeTab.savedText) return;
    if (savingByTab[activeTab.id]) return;
    const tabId = activeTab.id;
    const id = setTimeout(() => {
      void performSave(tabId);
    }, AUTO_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // performSave reads latest state via closure; intentionally not in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, tabs, autoSave, savingByTab]);

  function handleNewFile() {
    const label = makeUntitledLabel(tabs);
    const newTab: Tab = {
      id: nextTabId(),
      text: "",
      savedText: "",
      openedFile: null,
      untitledLabel: label,
    };
    setTabs((prev) => [...prev, newTab]);
    activateTab(newTab.id);
    setError(null);
  }

  async function handleOpenFile() {
    const result = await openMarkdownFile();
    if (result.kind === "ok") {
      const existing = tabs.find((t) => t.openedFile?.path === result.path);
      if (existing) {
        activateTab(existing.id);
        setError(null);
        return;
      }
      const newTab: Tab = {
        id: nextTabId(),
        text: result.content,
        savedText: result.content,
        openedFile: { name: result.name, path: result.path },
        untitledLabel: null,
      };
      setTabs((prev) => [...prev, newTab]);
      activateTab(newTab.id);
      setError(null);
    } else if (result.kind === "error") {
      setError(result.message);
    }
    // kind === "cancelled": no-op
  }

  async function openPathsAsTabs(
    paths: string[],
    options: { source: "session" | "pending" | "live" },
  ): Promise<void> {
    let lastOpenedId: TabId | null = null;
    for (const path of paths) {
      const existing = tabsRef.current.find(
        (t) => t.openedFile?.path === path,
      );
      if (existing) {
        lastOpenedId = existing.id;
        continue;
      }
      const result = await openMarkdownFileByPath(path);
      if (result.kind === "ok") {
        const newTab: Tab = {
          id: nextTabId(),
          text: result.content,
          savedText: result.content,
          openedFile: { name: result.name, path: result.path },
          untitledLabel: null,
        };
        setTabs((prev) => [...prev, newTab]);
        lastOpenedId = newTab.id;
      } else if (result.kind === "error" && options.source === "live") {
        setError(result.message);
      }
    }
    if (lastOpenedId !== null) {
      activateTab(lastOpenedId);
    }
  }

  async function performSave(
    tabId: TabId | null = activeTabId,
  ): Promise<boolean> {
    if (tabId === null) return false;
    if (savingByTab[tabId]) {
      pendingSaveRef.current.set(tabId, true);
      return false;
    }
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return false;
    setSavingByTab((prev) => ({ ...prev, [tabId]: true }));
    const outbound = tab.text;
    const displayName =
      tab.openedFile?.name ?? tab.untitledLabel ?? "Untitled";
    let success = false;
    if (tab.openedFile === null) {
      const result = await saveMarkdownFileAs(outbound, "Untitled.md");
      if (result.kind === "ok") {
        updateTab(tabId, (t) => ({
          ...t,
          savedText: outbound,
          openedFile: { name: result.name, path: result.path },
          untitledLabel: null,
        }));
        setError(null);
        success = true;
      } else if (result.kind === "error") {
        setError(`Could not save ${displayName}: ${result.message}`);
      }
      // cancelled: no-op
    } else {
      const result = await saveMarkdownFile(tab.openedFile.path, outbound);
      if (result.kind === "ok") {
        updateTab(tabId, (t) => ({ ...t, savedText: outbound }));
        setError(null);
        success = true;
      } else {
        setError(`Could not save ${displayName}: ${result.message}`);
      }
    }
    setSavingByTab((prev) => ({ ...prev, [tabId]: false }));
    if (pendingSaveRef.current.get(tabId)) {
      pendingSaveRef.current.set(tabId, false);
      queueMicrotask(() => {
        void performSave(tabId);
      });
    }
    return success;
  }

  function handleSave() {
    void performSave();
  }

  function removeTab(id: TabId) {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const wasActive = activeTabId === id;
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    editorStatesRef.current.delete(id);
    pendingSaveRef.current.delete(id);
    setSavingByTab((prev) => {
      const out = { ...prev };
      delete out[id];
      return out;
    });
    if (wasActive) {
      const neighbor = next[idx] ?? next[idx - 1] ?? null;
      setActiveTabId(neighbor?.id ?? null);
    }
    setPendingClose((prev) => (prev === id ? null : prev));
  }

  function handleCloseTab(id: TabId) {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    const isModifiedTab = tab.text !== tab.savedText;
    if (!isModifiedTab) {
      removeTab(id);
      return;
    }
    setPendingClose(id);
  }

  async function handleConfirmSave() {
    if (pendingClose === null) return;
    const id = pendingClose;
    const ok = await performSave(id);
    if (!ok) {
      setPendingClose(null);
      return;
    }
    removeTab(id);
    setPendingClose(null);
  }

  function handleConfirmDiscard() {
    if (pendingClose === null) return;
    removeTab(pendingClose);
    setPendingClose(null);
  }

  function handleConfirmCancel() {
    setPendingClose(null);
  }

  function handleSetViewMode(mode: ViewMode) {
    setViewMode(mode);
    persistViewMode(mode);
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

  const handleSaveRef = useRef(handleSave);
  const handleNewFileRef = useRef(handleNewFile);
  const handleOpenFileRef = useRef(handleOpenFile);

  useEffect(() => {
    handleSaveRef.current = handleSave;
    handleNewFileRef.current = handleNewFile;
    handleOpenFileRef.current = handleOpenFile;
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
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const pendingCloseTab = tabs.find((t) => t.id === pendingClose) ?? null;
  const pendingCloseName =
    pendingCloseTab?.openedFile?.name ??
    pendingCloseTab?.untitledLabel ??
    "Untitled";

  const isMac =
    typeof navigator !== "undefined" &&
    /mac/i.test(navigator.platform || navigator.userAgent || "");
  const modKey = isMac ? "⌘" : "Ctrl";

  return (
    <div className={appShell}>
      <TabStrip
        tabs={tabs}
        activeTabId={activeTabId}
        onActivate={activateTab}
        onClose={handleCloseTab}
      />
      <Toolbar
        viewMode={viewMode}
        theme={theme}
        saveEnabled={saveEnabled}
        saving={activeSaving}
        autoSave={autoSave}
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
        {tabs.length === 0 ? (
          <EmptyState modKey={modKey} />
        ) : (
          <Workspace
            text={activeText}
            viewMode={viewMode}
            onTextChange={updateActiveTabText}
            onFormat={(id) => editorRef.current?.format(id)}
            modKey={modKey}
            editorRef={editorRef}
            previewRef={previewRef}
          />
        )}
      </div>
      <ConfirmDialog
        open={pendingClose !== null}
        title={`Save changes to ${pendingCloseName}?`}
        message="You have unsaved changes. Save them now, discard them, or cancel and keep the tab open?"
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
