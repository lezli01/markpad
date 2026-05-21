import { useEffect, useRef, useState } from "react";
import Workspace from "./components/Workspace";
import Toolbar from "./components/Toolbar";
import ErrorBanner from "./components/ErrorBanner";
import FileHeader from "./components/FileHeader";
import { starterContent } from "./lib/starterContent";
import {
  openMarkdownFile,
  saveMarkdownFile,
  saveMarkdownFileAs,
  setWindowTitle,
} from "./lib/fileOpen";
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

type OpenedFile = { name: string; path: string };

const AUTO_SAVE_DEBOUNCE_MS = 1500;

const appShell =
  "h-screen w-screen flex flex-col gap-4 p-4 md:p-6 bg-gradient-to-br from-[color:var(--islands-bg-from)] to-[color:var(--islands-bg-to)]";

function App() {
  const [text, setText] = useState(starterContent);
  const [savedText, setSavedText] = useState(starterContent);
  const [openedFile, setOpenedFile] = useState<OpenedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => getViewMode());
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  const [saving, setSaving] = useState(false);
  const [autoSave, setAutoSaveState] = useState<boolean>(() => getAutoSave());
  const pendingSaveRef = useRef(false);

  useEffect(() => {
    setWindowTitle(openedFile?.name ?? null);
  }, [openedFile?.name]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!autoSave) return;
    if (openedFile === null) return;
    if (text === savedText) return;
    if (saving) return;
    const id = setTimeout(() => {
      void performSave();
    }, AUTO_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // performSave is intentionally not in the dep list — it is recreated each
    // render and depends only on the same state variables already listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, savedText, autoSave, openedFile, saving]);

  function handleNewFile() {
    setText("");
    setSavedText("");
    setOpenedFile(null);
    setError(null);
  }

  async function handleOpenFile() {
    const result = await openMarkdownFile();
    if (result.kind === "ok") {
      setText(result.content);
      setSavedText(result.content);
      setOpenedFile({ name: result.name, path: result.path });
      setError(null);
    } else if (result.kind === "error") {
      setError(result.message);
    }
    // kind === "cancelled": no-op
  }

  async function performSave() {
    if (saving) {
      pendingSaveRef.current = true;
      return;
    }
    setSaving(true);
    const outbound = text;
    if (openedFile === null) {
      const result = await saveMarkdownFileAs(outbound, "Untitled.md");
      if (result.kind === "ok") {
        setOpenedFile({ name: result.name, path: result.path });
        setSavedText(outbound);
        setError(null);
      } else if (result.kind === "error") {
        setError(result.message);
      }
      setSaving(false);
      pendingSaveRef.current = false;
      return;
    }
    const result = await saveMarkdownFile(openedFile.path, outbound);
    if (result.kind === "ok") {
      setSavedText(outbound);
      setError(null);
      setSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        queueMicrotask(() => {
          void performSave();
        });
      }
    } else {
      setError(result.message);
      setSaving(false);
      pendingSaveRef.current = false;
    }
  }

  function handleSave() {
    void performSave();
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

  const isModified = text !== savedText;
  const saveEnabled = !saving;

  return (
    <div className={appShell}>
      <FileHeader
        fileName={openedFile?.name ?? null}
        fullPath={openedFile?.path ?? null}
        isModified={isModified}
      />
      <Toolbar
        viewMode={viewMode}
        theme={theme}
        saveEnabled={saveEnabled}
        saving={saving}
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
        <Workspace
          text={text}
          viewMode={viewMode}
          onTextChange={setText}
        />
      </div>
    </div>
  );
}

export default App;
