export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "smart-smile-theme";

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredTheme(
  storage: Storage | null = browserStorage(),
): Theme | null {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredTheme(
  theme: Theme,
  storage: Storage | null = browserStorage(),
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // A blocked or full storage area should not prevent the camera journey.
  }
}

export function applyTheme(
  theme: Theme,
  root: HTMLElement | null = typeof document === "undefined"
    ? null
    : document.documentElement,
): void {
  root?.setAttribute("data-theme", theme);
}
