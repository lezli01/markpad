// Single chokepoint for user preferences. The rest of the app MUST NOT touch
// localStorage directly; future contributors can grep for "localStorage" to
// verify this invariant (per contracts/components.md and Principle VIII).

export type Theme = "light" | "dark";
export type ViewMode = "editor" | "preview" | "split";

const THEME_KEY = "markpad.theme";
const VIEW_MODE_KEY = "markpad.viewMode";
const AUTO_SAVE_KEY = "markpad.autoSave";
const SIDEBAR_WIDTH_KEY = "markpad.sidebarWidth";
const SIDEBAR_COLLAPSED_KEY = "markpad.sidebarCollapsed";

// The recents sidebar can be dragged between these bounds; the default sits
// comfortably for typical filenames without crowding the editor.
export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 520;
export const SIDEBAR_DEFAULT_WIDTH = 260;

function clampSidebarWidth(px: number): number {
  if (!Number.isFinite(px)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(px)));
}

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

export function getSidebarWidth(): number {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (stored !== null) {
      const parsed = Number.parseInt(stored, 10);
      if (!Number.isNaN(parsed)) {
        return clampSidebarWidth(parsed);
      }
    }
  } catch {
    // fall through to default
  }
  return SIDEBAR_DEFAULT_WIDTH;
}

export function setSidebarWidth(px: number): void {
  try {
    window.localStorage.setItem(
      SIDEBAR_WIDTH_KEY,
      String(clampSidebarWidth(px)),
    );
  } catch (err) {
    console.warn("Failed to persist sidebar width preference:", err);
  }
}

export function getSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "on";
  } catch {
    return false;
  }
}

export function setSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_KEY,
      collapsed ? "on" : "off",
    );
  } catch (err) {
    console.warn("Failed to persist sidebar collapsed preference:", err);
  }
}
