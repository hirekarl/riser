import { createContext, useContext, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "riser-theme";

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    // localStorage can throw (e.g. disabled/quota exceeded in some private
    // browsing modes) — fall back to the system default rather than crash.
    return "system";
  }
}

function applyTheme(theme: Theme): void {
  if (theme === "system") {
    // Fully remove the attribute (rather than setting it to an empty
    // string) so the @media (prefers-color-scheme) block in index.css is
    // the sole source of truth again, with no dangling `data-theme=""`
    // left behind that could interact oddly with `:root[data-theme="..."]`
    // selectors.
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

function persistTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Best-effort persistence only; ignore storage failures.
  }
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Provides the current light/dark/system theme choice and lets descendants
 * change it. The initial theme is read from localStorage inside a
 * `useState` initializer (runs synchronously during the first render, before
 * anything paints) and applied to `<html data-theme>` in a `useLayoutEffect`
 * (runs synchronously after DOM mutations but before the browser paints).
 * Together these avoid a flash-of-wrong-theme: by the time the browser
 * paints the first frame, `data-theme` already reflects the stored/system
 * choice. A top-level module-scope read before React mounts would remove
 * even the tiny window between React initializing and the layout effect
 * running, but would also run the DOM mutation outside of React's lifecycle
 * entirely (e.g. before `main.tsx` has a chance to set anything else up) for
 * a marginal gain on this small, non-SSR SPA, so it wasn't worth the extra
 * indirection here.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function setTheme(next: Theme): void {
    setThemeState(next);
    persistTheme(next);
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
