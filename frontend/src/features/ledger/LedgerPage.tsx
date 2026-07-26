import { Fragment, useEffect, useId, useRef, useState } from "react";
import { listLedger, updateElevator } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";
import { StatusBadge } from "../../components/StatusBadge";
import { logError } from "../../lib/logger";
import type { Building, LedgerEntry } from "../../types/domain";
import styles from "./LedgerPage.module.css";

// Matches the sweep-fade animation duration in LedgerPage.module.css, plus a
// small margin, so the highlight class clears after the animation (or, under
// prefers-reduced-motion, the static background) has had time to be seen.
const HIGHLIGHT_DURATION_MS = 1800;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Plain-language remediation copy for a Warning/Delinquent row, derived
// entirely from data the ledger already returns (status, due_date,
// inspection_type) — no new endpoint. Compliant rows don't get this panel;
// there's nothing to remediate. Where-to-go is intentionally generic (DOB's
// elevator unit / a licensed inspection agency), not a live lookup.
function getRemediationCopy(entry: LedgerEntry): {
  whatsWrong: string;
  nextStep: string;
  whereToGo: string;
} {
  // entry.due_date is a date-only string, which Date parses as UTC midnight;
  // normalize "now" to a UTC-midnight Date built from the local calendar date
  // (not new Date() directly) so the diff isn't skewed by the viewer's
  // timezone offset/time-of-day — the same UTC-date-only convention
  // backend/apps/compliance/services.py uses for this math server-side.
  const dueDate = new Date(entry.due_date);
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayDiff = Math.round((dueDate.getTime() - today.getTime()) / MS_PER_DAY);

  const whatsWrong =
    entry.status === "Delinquent"
      ? `${entry.inspection_type} filing is ${Math.abs(dayDiff)} day${Math.abs(dayDiff) === 1 ? "" : "s"} overdue — was due ${entry.due_date}.`
      : `${entry.inspection_type} filing is due soon — due ${entry.due_date}${dayDiff >= 0 ? ` (${dayDiff} day${dayDiff === 1 ? "" : "s"} from now)` : ""}.`;

  const nextStep =
    entry.status === "Delinquent"
      ? "File the required inspection report as soon as possible — late fees accrue monthly until it's filed."
      : "Schedule the inspection now so the filing lands before the due date.";

  const whereToGo =
    "Contact your building's licensed elevator inspection agency to schedule or confirm filing, or NYC DOB's elevator unit (311) for questions about a specific violation.";

  return { whatsWrong, nextStep, whereToGo };
}

export interface LedgerPageProps {
  /**
   * Bump this value (e.g. from a parent that just created a building/elevator)
   * to force the ledger to refetch. Purely a dependency-array trigger; the
   * component always trusts the server's sort order and never re-sorts locally.
   */
  reloadSignal?: number;
  /**
   * Buildings available to filter the ledger by. The filter control only
   * renders when this is non-empty.
   */
  buildings?: Building[];
  /**
   * Called with the full ledger entry for a row when its Edit button is
   * clicked, so a parent (e.g. `App`) can switch `ElevatorForm` into edit
   * mode for that elevator.
   */
  onEditRequest?: (entry: LedgerEntry) => void;
  /**
   * The id of the elevator currently open in the (parent-owned) Edit form, if
   * any. The row matching this id has its inline date input disabled and is
   * marked with `styles.editingRow`, so the same field can't be edited via
   * two surfaces at once (see the stale-overwrite race this prevents).
   */
  editingElevatorId?: number;
}

export function LedgerPage({
  reloadSignal,
  buildings = [],
  onEditRequest,
  editingElevatorId,
}: LedgerPageProps) {
  const filterId = useId();
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [updateVersion, setUpdateVersion] = useState(0);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [justChangedIds, setJustChangedIds] = useState<Set<number>>(new Set());
  const previousStatusesRef = useRef<Map<number, string> | null>(null);
  const highlightTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let ignore = false;

    listLedger(selectedBuildingId)
      .then((data) => {
        if (ignore) return;

        const previousStatuses = previousStatusesRef.current;
        if (previousStatuses) {
          const changed = new Set<number>();
          for (const entry of data) {
            const previousStatus = previousStatuses.get(entry.id);
            if (previousStatus !== undefined && previousStatus !== entry.status) {
              changed.add(entry.id);
            }
          }
          if (changed.size > 0) {
            window.clearTimeout(highlightTimeoutRef.current);
            setJustChangedIds(changed);
            highlightTimeoutRef.current = window.setTimeout(() => {
              setJustChangedIds(new Set());
            }, HIGHLIGHT_DURATION_MS);
          }
        }
        previousStatusesRef.current = new Map(data.map((entry) => [entry.id, entry.status]));

        setEntries(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (ignore) return;
        logError("Failed to load ledger", err);
        setError("Could not load the ledger. Please try again.");
      });

    return () => {
      ignore = true;
    };
    // reloadSignal/updateVersion are intentional refetch triggers, not consumed directly.
  }, [reloadSignal, updateVersion, selectedBuildingId]);

  useEffect(() => {
    return () => window.clearTimeout(highlightTimeoutRef.current);
  }, []);

  // Per-row pending edits for the inline date input: typing/selecting a new
  // date only updates this local state (keyed by elevator id) until the user
  // explicitly clicks Save. This avoids the previous auto-save-on-`onChange`
  // behavior, which risked an accidental unconfirmed edit.
  const [pendingDates, setPendingDates] = useState<Record<number, string>>({});

  function handleDateInputChange(elevatorId: number, newDate: string) {
    if (!newDate) return;
    setPendingDates((current) => ({ ...current, [elevatorId]: newDate }));
  }

  function handleToggleDetails(elevatorId: number) {
    setExpandedId((current) => (current === elevatorId ? null : elevatorId));
  }

  function handleDateCancel(elevatorId: number) {
    setPendingDates((current) => {
      const next = { ...current };
      delete next[elevatorId];
      return next;
    });
  }

  async function handleDateSave(elevatorId: number) {
    const newDate = pendingDates[elevatorId];
    if (!newDate) return;
    setPendingId(elevatorId);
    try {
      await updateElevator(elevatorId, { last_inspection_date: newDate });
      setPendingDates((current) => {
        const next = { ...current };
        delete next[elevatorId];
        return next;
      });
      setUpdateVersion((n) => n + 1);
    } catch (err) {
      logError("Failed to update elevator inspection date", err, { elevatorId });
      setError("Could not update the inspection date. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  if (entries === null && !error) {
    return <p role="status">Loading portfolio ledger…</p>;
  }

  return (
    <div className={styles.wrapper}>
      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      {/*
        Display copy only — the actual thresholds live in
        backend/apps/compliance/services.py (WARNING_WINDOW_DAYS, and the
        Delinquent/Warning/Compliant rules in calculate_status). There is no
        API-exposed value for this threshold, so if that constant ever
        changes, this text must be updated by hand to match.
      */}
      <details className={styles.legend}>
        <summary className={styles.legendSummary}>What do these statuses mean?</summary>
        <dl className={styles.legendList}>
          <div className={styles.legendItem}>
            <dt>
              <StatusBadge status="Compliant" />
            </dt>
            <dd>The next inspection is due more than 30 days from today.</dd>
          </div>
          <div className={styles.legendItem}>
            <dt>
              <StatusBadge status="Warning" />
            </dt>
            <dd>The next inspection is due today or within the next 30 days.</dd>
          </div>
          <div className={styles.legendItem}>
            <dt>
              <StatusBadge status="Delinquent" />
            </dt>
            <dd>The next inspection&apos;s due date has already passed.</dd>
          </div>
        </dl>
      </details>

      {buildings.length > 0 && (
        <div className={styles.filterRow}>
          <label htmlFor={filterId}>Filter by building</label>
          <select
            id={filterId}
            value={selectedBuildingId ?? ""}
            onChange={(event) => {
              const { value } = event.target;
              setSelectedBuildingId(value === "" ? undefined : Number(value));
            }}
          >
            <option value="">All buildings</option>
            {buildings.map((building) => (
              <option key={building.id} value={building.id}>
                {building.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {entries && entries.length === 0 ? (
        <EmptyState />
      ) : entries && entries.length > 0 ? (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption>Portfolio compliance ledger, sorted by urgency</caption>
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Building</th>
                <th scope="col">Device</th>
                <th scope="col">Inspection type</th>
                <th scope="col">Last inspection date</th>
                <th scope="col">Due date</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isEditingRow = editingElevatorId === entry.id;
                const rowClassName =
                  [
                    justChangedIds.has(entry.id) ? styles.highlighting : null,
                    isEditingRow ? styles.editingRow : null,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined;
                const pendingDate = pendingDates[entry.id];
                const hasPendingEdit =
                  pendingDate !== undefined && pendingDate !== entry.last_inspection_date;
                const isSaving = pendingId === entry.id;
                const needsRemediation =
                  entry.status === "Warning" || entry.status === "Delinquent";
                const isExpanded = expandedId === entry.id;

                return (
                  <Fragment key={entry.id}>
                    <tr className={rowClassName}>
                      <td>
                        <StatusBadge status={entry.status} />
                      </td>
                      <td>{entry.building_name}</td>
                      <td>{entry.device_identifier}</td>
                      <td>{entry.inspection_type}</td>
                      <td>
                        <label>
                          <span className="visually-hidden">
                            Last inspection date for {entry.device_identifier}
                          </span>
                          <input
                            type="date"
                            className={styles.dateInput}
                            value={pendingDate ?? entry.last_inspection_date}
                            disabled={isSaving || isEditingRow}
                            onChange={(event) =>
                              handleDateInputChange(entry.id, event.target.value)
                            }
                          />
                        </label>
                        {hasPendingEdit && (
                          <span className={styles.dateActions}>
                            <button
                              type="button"
                              className={styles.saveDateButton}
                              aria-label={`Save inspection date for ${entry.device_identifier}`}
                              disabled={isSaving}
                              onClick={() => handleDateSave(entry.id)}
                            >
                              {isSaving ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              className={styles.cancelDateButton}
                              aria-label={`Cancel editing inspection date for ${entry.device_identifier}`}
                              disabled={isSaving}
                              onClick={() => handleDateCancel(entry.id)}
                            >
                              Cancel
                            </button>
                          </span>
                        )}
                      </td>
                      <td>{entry.due_date}</td>
                      <td>
                        <button
                          type="button"
                          className={styles.editButton}
                          aria-label={`Edit ${entry.device_identifier}`}
                          onClick={() => onEditRequest?.(entry)}
                        >
                          Edit
                        </button>
                        {needsRemediation && (
                          <button
                            type="button"
                            className={styles.detailsButton}
                            aria-label={`${isExpanded ? "Hide" : "View"} details for ${entry.device_identifier}`}
                            aria-expanded={isExpanded}
                            onClick={() => handleToggleDetails(entry.id)}
                          >
                            {isExpanded ? "Hide details" : "View details"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className={styles.detailCell}>
                          {(() => {
                            const { whatsWrong, nextStep, whereToGo } = getRemediationCopy(entry);
                            return (
                              <dl className={styles.detailPanel}>
                                <div>
                                  <dt>What&apos;s wrong</dt>
                                  <dd>{whatsWrong}</dd>
                                </div>
                                <div>
                                  <dt>Next step</dt>
                                  <dd>{nextStep}</dd>
                                </div>
                                <div>
                                  <dt>Where to go</dt>
                                  <dd>{whereToGo}</dd>
                                </div>
                              </dl>
                            );
                          })()}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
