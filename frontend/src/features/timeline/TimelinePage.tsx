import { StatusBadge } from "../../components/StatusBadge";
import type { LedgerEntry } from "../../types/domain";
import styles from "./TimelinePage.module.css";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const TIMELINE_WINDOW_DAYS = 90;
// Finer-grained urgency tier applied on top of the "Warning" status (backend
// threshold: due within 30 days) — a row due in 2 days and one due in 28 days
// are both "Warning", but the former deserves more visual weight. Purely a
// display-layer threshold; doesn't affect which entries are shown or how
// entry.status itself is computed (still always server-computed).
const DUE_SOON_THRESHOLD_DAYS = 7;

/**
 * Plain-language phrasing for the "days until due" cell — a bare number
 * ("0", "1") reads ambiguously at a glance; "Due today" / "1 day" / "N days"
 * doesn't.
 */
function formatDaysUntilDue(days: number): string {
  if (days === 0) return "Due today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

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
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon} aria-hidden="true">
          🗓️
        </span>
        <h3 className={styles.emptyHeading}>Nothing due in the next 90 days</h3>
        <p className={styles.emptyLede}>
          Nothing is due in the next 90 days across your portfolio right now — that&rsquo;s good
          news. Check back as due dates approach, or switch to the Ledger tab to see every tracked
          elevator, including anything already overdue.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <caption>Upcoming compliance due dates, next 90 days</caption>
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Building</th>
              <th scope="col">Device</th>
              <th scope="col">Inspection type</th>
              <th scope="col">Due date</th>
              <th scope="col">Days until due</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map((entry) => {
              const days = daysUntilDue(entry.due_date);
              const isDueSoon = days <= DUE_SOON_THRESHOLD_DAYS;
              return (
                <tr key={entry.id} className={isDueSoon ? styles.urgentRow : undefined}>
                  <td>
                    <StatusBadge status={entry.status} />
                  </td>
                  <td>{entry.building_name}</td>
                  <td>
                    {entry.device_identifier}
                    {entry.dob_device_number && (
                      <span className={styles.dobDeviceNumber}>
                        (DOB #{entry.dob_device_number})
                      </span>
                    )}
                  </td>
                  <td>{entry.inspection_type}</td>
                  <td>{entry.due_date}</td>
                  <td className={isDueSoon ? styles.dueSoon : undefined}>
                    {formatDaysUntilDue(days)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
