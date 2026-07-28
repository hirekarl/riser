import { useTheme } from "../lib/theme";
import styles from "./ThemeToggle.module.css";

/**
 * A simple two-state light/dark toggle. The displayed state reflects
 * `resolvedTheme` — what's actually currently rendered — rather than the raw
 * `theme` preference, so it's accurate even before the user has made an
 * explicit choice (i.e. while still following the OS's `prefers-color-scheme`).
 * Clicking always flips to the opposite of whatever's currently resolved,
 * landing on an explicit "light" or "dark" choice from then on.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  function handleClick() {
    setTheme(isDark ? "light" : "dark");
  }

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={handleClick}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
    >
      <span className={styles.icon} aria-hidden="true">
        {isDark ? "☀" : "☾"}
      </span>
    </button>
  );
}
