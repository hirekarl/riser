import type { LedgerEntry } from "../types/domain";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * The three visual buckets the ledger's due-date column (and any other
 * surface showing due-date urgency, e.g. the executive summary band) colors
 * a row by. Deliberately derived from `entry.status` rather than
 * re-deriving urgency from `dayDiff` directly — `status` is already the
 * server-computed source of truth (see `apps.compliance.services.Status`),
 * so this never risks disagreeing with it.
 */
export type DueUrgencyLevel = "overdue" | "soon" | "ok";

export interface DueUrgency {
  level: DueUrgencyLevel;
  /**
   * Signed day count between today (UTC midnight) and `entry.due_date`:
   * negative when the due date has already passed, positive when it's in
   * the future, zero when due today.
   */
  dayDiff: number;
  /**
   * Plain-language day-count phrasing to show beneath the due date, e.g.
   * "12 days overdue" / "Due in 5 days" / "Due today". Empty for
   * comfortably-compliant ("ok") rows — there's nothing urgent to say.
   */
  subtext: string;
}

/**
 * Shared urgency classification + day-count math for a single ledger row.
 * Both `LedgerPage`'s due-date column and `getRemediationCopy`'s
 * plain-language panel (frontend/src/features/ledger/LedgerPage.tsx) source
 * their `dayDiff` from here, so the two never drift out of sync.
 *
 * `entry.due_date` is a date-only string, which `Date` parses as UTC
 * midnight; "now" is normalized to a UTC-midnight `Date` built from the
 * local calendar date (not `new Date()` directly) so the diff isn't skewed
 * by the viewer's timezone offset/time-of-day — the same UTC-date-only
 * convention `backend/apps/compliance/services.py` uses for this math
 * server-side.
 */
export function getDueUrgency(entry: LedgerEntry): DueUrgency {
  const dueDate = new Date(entry.due_date);
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayDiff = Math.round((dueDate.getTime() - today.getTime()) / MS_PER_DAY);

  const level: DueUrgencyLevel =
    entry.status === "Delinquent" ? "overdue" : entry.status === "Warning" ? "soon" : "ok";

  let subtext = "";
  if (level === "overdue") {
    const days = Math.abs(dayDiff);
    subtext = `${days} day${days === 1 ? "" : "s"} overdue`;
  } else if (level === "soon") {
    if (dayDiff === 0) {
      subtext = "Due today";
    } else if (dayDiff > 0) {
      subtext = `Due in ${dayDiff} day${dayDiff === 1 ? "" : "s"}`;
    } else {
      // Edge case that shouldn't occur given the backend's own Warning
      // threshold (a Warning row whose due date has already passed), but
      // handled gracefully rather than emitting nonsensical copy.
      const days = Math.abs(dayDiff);
      subtext = `${days} day${days === 1 ? "" : "s"} overdue`;
    }
  }

  return { level, dayDiff, subtext };
}
