import type { LedgerEntry } from "../../types/domain";
// Deliberately reuses LedgerPage's table/wrapper/error-banner classes rather
// than inventing new styles for what is structurally the same kind of table,
// per the design brief for this stretch feature.
import styles from "../ledger/LedgerPage.module.css";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const TIMELINE_WINDOW_DAYS = 90;

export interface TimelinePageProps {
  /** Same `LedgerEntry[]` the ledger view receives, lifted to `App` so both
   * views share a single `listLedger()` fetch. `null` while the initial
   * fetch is in flight. */
  entries: LedgerEntry[] | null;
  /** Ledger-fetch error from the parent, if any (shared with `LedgerPage`). */
  error?: string | null;
}

/**
 * Portfolio-wide view of what's due in the next 90 days, across all
 * buildings. A second, distinct view from the ledger table (see the
 * sort-order comment below) rather than a filtered version of it.
 */
export function TimelinePage({ entries, error }: TimelinePageProps) {
  if (error) {
    return (
      <div className={styles.errorBanner} role="alert">
        {error}
      </div>
    );
  }

  if (entries === null) {
    return <p role="status">Loading upcoming due dates…</p>;
  }

  // entry.due_date is a date-only string, which Date parses as UTC midnight;
  // normalize "now" to a UTC-midnight Date built from the local calendar
  // date (never bare `new Date()`) so the diff isn't skewed by the viewer's
  // timezone offset/time-of-day — same convention as
  // LedgerPage.tsx's getRemediationCopy.
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  function daysUntilDue(dueDateString: string): number {
    const dueDate = new Date(dueDateString);
    return Math.round((dueDate.getTime() - today.getTime()) / MS_PER_DAY);
  }

  const upcoming = entries
    .filter((entry) => {
      const dayDiff = daysUntilDue(entry.due_date);
      // "Upcoming" is a forward-looking window: a negative dayDiff means the
      // due date has already passed, which is exactly what "Delinquent"
      // means on the main ledger — that row is already surfaced (and
      // prioritized) there, so the Timeline deliberately doesn't repeat
      // already-overdue items. The upper bound is inclusive of day 90 per
      // "within the next 90 days" (0..90 inclusive; day 91 is excluded).
      return dayDiff >= 0 && dayDiff <= TIMELINE_WINDOW_DAYS;
    })
    // Deliberate, scoped exception to "never re-sort the ledger
    // client-side" (see the doc comment on `LedgerEntry` in
    // types/domain.ts): the Timeline is a distinct view from the ledger
    // table, windowed to the next 90 days, where ascending due-date is the
    // correct ordering for "what's coming up next" — a different sort
    // criterion for a different purpose than the ledger's risk-tier-first
    // order, which is left untouched wherever it's rendered.
    .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0));

  if (upcoming.length === 0) {
    return <p>Nothing is due in the next 90 days.</p>;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <caption>Upcoming compliance due dates, next 90 days</caption>
          <thead>
            <tr>
              <th scope="col">Building</th>
              <th scope="col">Device</th>
              <th scope="col">Inspection type</th>
              <th scope="col">Due date</th>
              <th scope="col">Days until due</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.building_name}</td>
                <td>{entry.device_identifier}</td>
                <td>{entry.inspection_type}</td>
                <td>{entry.due_date}</td>
                <td>{daysUntilDue(entry.due_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
