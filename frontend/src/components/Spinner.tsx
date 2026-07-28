import styles from "./Spinner.module.css";

/**
 * A small inline loading spinner. Purely decorative — `aria-hidden`, since
 * every loading state that uses this already carries its own text inside a
 * `role="status"` region (e.g. "Loading portfolio ledger…"), which is what
 * assistive tech actually announces. This just gives sighted users a
 * lightweight visual cue alongside that text. Respects
 * `prefers-reduced-motion` by freezing on a static ring instead of
 * animating, matching the reduced-motion handling already established for
 * `LedgerPage`'s status-change highlight.
 */
export function Spinner() {
  return <span className={styles.spinner} aria-hidden="true" />;
}
