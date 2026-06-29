// Single chokepoint for user preferences. The rest of the app MUST NOT touch
// localStorage directly; future contributors can grep for "localStorage" to
// verify this invariant (per contracts/components.md and Principle VIII).

export type Theme = "light" | "dark";
export type ViewMode = "editor" | "preview" | "split";

const THEME_KEY = "markpad.theme";
const VIEW_MODE_KEY = "markpad.viewMode";
const AUTO_SAVE_KEY = "markpad.autoSave";

const ALLOWED_THEMES: readonly Theme[] = ["light", "dark"];
const ALLOWED_VIEW_MODES: readonly ViewMode[] = ["editor", "preview", "split"];
const ALLOWED_AUTO_SAVE = ["on", "off"] as const;

function resolveSystemTheme(): Theme {
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
  } catch {
    // fall through
  }
  return "light";
}

export function getTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored !== null && (ALLOWED_THEMES as readonly string[]).includes(stored)) {
      return stored as Theme;
    }
  } catch {
    // localStorage unavailable — fall through to system default
  }
  return resolveSystemTheme();
}

export function setTheme(theme: Theme): void {
  if (!(ALLOWED_THEMES as readonly string[]).includes(theme)) {
    throw new TypeError(`Invalid theme: ${String(theme)}`);
  }
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch (err) {
    console.warn("Failed to persist theme preference:", err);
  }
}

export function getViewMode(): ViewMode {
  try {
    const stored = window.localStorage.getItem(VIEW_MODE_KEY);
    if (
      stored !== null &&
      (ALLOWED_VIEW_MODES as readonly string[]).includes(stored)
    ) {
      return stored as ViewMode;
    }
  } catch {
    // fall through to default
  }
  return "split";
}

export function setViewMode(mode: ViewMode): void {
  if (!(ALLOWED_VIEW_MODES as readonly string[]).includes(mode)) {
    throw new TypeError(`Invalid view mode: ${String(mode)}`);
  }
  try {
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch (err) {
    console.warn("Failed to persist view mode preference:", err);
  }
}

export function getAutoSave(): boolean {
  try {
    const stored = window.localStorage.getItem(AUTO_SAVE_KEY);
    if (
      stored !== null &&
      (ALLOWED_AUTO_SAVE as readonly string[]).includes(stored)
    ) {
      return stored === "on";
    }
  } catch {
    // fall through to default
  }
  return false;
}

export function setAutoSave(on: boolean): void {
  try {
    window.localStorage.setItem(AUTO_SAVE_KEY, on ? "on" : "off");
  } catch (err) {
    console.warn("Failed to persist auto-save preference:", err);
  }
}
