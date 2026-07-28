import { createContext, useContext, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "riser-theme";
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

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

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

/**
 * Resolves a raw theme preference to a concrete, renderable value, given the
 * current OS preference. `"system"` defers to `prefersDark`; `"light"` and
 * `"dark"` are already concrete and pass through unchanged.
 */
function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  if (theme === "system") {
    return prefersDark ? "dark" : "light";
  }
  return theme;
}

function applyResolvedTheme(resolved: ResolvedTheme): void {
  // Always write a concrete value — never remove the attribute — so
  // `:root[data-theme="..."]` selectors in component stylesheets are the
  // sole source of truth from first paint onward, with no window where the
  // attribute is absent.
  document.documentElement.dataset.theme = resolved;
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
  resolvedTheme: ResolvedTheme;
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
 * anything paints) and the resolved concrete value is applied to
 * `<html data-theme>` in a `useLayoutEffect` (runs synchronously after DOM
 * mutations but before the browser paints). Together these avoid a
 * flash-of-wrong-theme: by the time the browser paints the first frame,
 * `data-theme` already reflects the resolved stored/system choice. A
 * top-level module-scope read before React mounts would remove even the tiny
 * window between React initializing and the layout effect running, but would
 * also run the DOM mutation outside of React's lifecycle entirely (e.g.
 * before `main.tsx` has a chance to set anything else up) for a marginal
 * gain on this small, non-SSR SPA, so it wasn't worth the extra indirection
 * here.
 *
 * The raw preference (`theme`) can be `"system"`, meaning "no explicit
 * choice yet — follow the OS". `resolvedTheme` is always a concrete
 * `"light"` or `"dark"` and is what's actually applied to the DOM; while the
 * raw preference is `"system"`, it tracks live OS preference changes via a
 * `matchMedia` change listener.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  // Tracks the live OS preference so `resolvedTheme` can follow it while the
  // raw preference is `"system"`. Only ever updated from the `matchMedia`
  // change listener below (an external-system callback), never set
  // synchronously within an effect body.
  const [prefersDark, setPrefersDark] = useState<boolean>(() => systemPrefersDark());
  const resolvedTheme = resolveTheme(theme, prefersDark);

  useLayoutEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  useLayoutEffect(() => {
    if (theme !== "system") {
      return;
    }

    const mediaQueryList = window.matchMedia(DARK_MEDIA_QUERY);
    function handleChange(event: MediaQueryListEvent): void {
      setPrefersDark(event.matches);
    }

    mediaQueryList.addEventListener("change", handleChange);
    return () => {
      mediaQueryList.removeEventListener("change", handleChange);
    };
  }, [theme]);

  function setTheme(next: Theme): void {
    setThemeState(next);
    persistTheme(next);
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
