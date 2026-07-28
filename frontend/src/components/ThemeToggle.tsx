import { useTheme } from "../lib/theme";
import styles from "./ThemeToggle.module.css";

/**
 * A simple two-state light/dark toggle. `"system"` (the implicit starting
 * state, before the user has made an explicit choice) is treated as "not
 * dark" for display purposes — clicking always flips to the opposite of
 * dark, landing on an explicit "light" or "dark" choice from then on.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
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
