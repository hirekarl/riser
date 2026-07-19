import { useEffect, useState } from "react";
import { listLedger, updateElevator } from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";
import type { LedgerEntry } from "../../types/domain";
import styles from "./LedgerPage.module.css";

export interface LedgerPageProps {
  /**
   * Bump this value (e.g. from a parent that just created a building/elevator)
   * to force the ledger to refetch. Purely a dependency-array trigger; the
   * component always trusts the server's sort order and never re-sorts locally.
   */
  reloadSignal?: number;
}

export function LedgerPage({ reloadSignal }: LedgerPageProps) {
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [updateVersion, setUpdateVersion] = useState(0);

  useEffect(() => {
    let ignore = false;

    listLedger()
      .then((data) => {
        if (ignore) return;
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
  }, [reloadSignal, updateVersion]);

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

      {entries && entries.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>No elevators yet</h2>
          <p>
            Add your first building, then add an elevator to it, to start tracking compliance
            deadlines across your portfolio.
          </p>
        </div>
      ) : entries && entries.length > 0 ? (
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
              <tr key={entry.id}>
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
      ) : null}
    </div>
  );
}
