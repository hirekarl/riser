import { useEffect, useId, useRef, useState } from "react";
import { listLedger, updateElevator } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";
import { StatusBadge } from "../../components/StatusBadge";
import type { Building, LedgerEntry } from "../../types/domain";
import styles from "./LedgerPage.module.css";

// Matches the sweep-fade animation duration in LedgerPage.module.css, plus a
// small margin, so the highlight class clears after the animation (or, under
// prefers-reduced-motion, the static background) has had time to be seen.
const HIGHLIGHT_DURATION_MS = 1800;

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
}

export function LedgerPage({ reloadSignal, buildings = [] }: LedgerPageProps) {
  const filterId = useId();
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [updateVersion, setUpdateVersion] = useState(0);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | undefined>(undefined);
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
      .catch(() => {
        if (ignore) return;
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

  async function handleDateChange(elevatorId: number, newDate: string) {
    if (!newDate) return;
    setPendingId(elevatorId);
    try {
      await updateElevator(elevatorId, { last_inspection_date: newDate });
      setUpdateVersion((n) => n + 1);
    } catch {
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
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className={justChangedIds.has(entry.id) ? styles.highlighting : undefined}
                >
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
                        defaultValue={entry.last_inspection_date}
                        disabled={pendingId === entry.id}
                        onChange={(event) => handleDateChange(entry.id, event.target.value)}
                      />
                    </label>
                  </td>
                  <td>{entry.due_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
