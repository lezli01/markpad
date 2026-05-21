import { useEffect, useState } from "react";
import Workspace from "./components/Workspace";
import Toolbar from "./components/Toolbar";
import ErrorBanner from "./components/ErrorBanner";
import { starterContent } from "./lib/starterContent";
import { openMarkdownFile, setWindowTitle } from "./lib/fileOpen";
import {
  getTheme,
  getViewMode,
  setTheme as persistTheme,
  setViewMode as persistViewMode,
  type Theme,
  type ViewMode,
} from "./lib/preferences";

type OpenedFile = { name: string; path: string };

const appShell =
  "h-screen w-screen flex flex-col gap-4 p-4 md:p-6 bg-gradient-to-br from-[color:var(--islands-bg-from)] to-[color:var(--islands-bg-to)]";

function App() {
  const [text, setText] = useState(starterContent);
  const [openedFile, setOpenedFile] = useState<OpenedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => getViewMode());
  const [theme, setThemeState] = useState<Theme>(() => getTheme());

  useEffect(() => {
    setWindowTitle(openedFile?.name ?? null);
  }, [openedFile?.name]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  async function handleOpenFile() {
    const result = await openMarkdownFile();
    if (result.kind === "ok") {
      setText(result.content);
      setOpenedFile({ name: result.name, path: result.path });
      setError(null);
    } else if (result.kind === "error") {
      setError(result.message);
    }
    // kind === "cancelled": no-op
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

  return (
    <div className={appShell}>
      <Toolbar
        viewMode={viewMode}
        theme={theme}
        onOpenFile={handleOpenFile}
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
