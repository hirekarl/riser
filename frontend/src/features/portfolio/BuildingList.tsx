import { useState } from "react";
import { deleteBuilding } from "../../api/client";
import { logError } from "../../lib/logger";
import type { Building } from "../../types/domain";
import formStyles from "./forms.module.css";
import styles from "./BuildingList.module.css";

export interface BuildingListProps {
  buildings: Building[];
  /**
   * Called after a building is successfully deleted, so the parent (`App`)
   * can refetch both the buildings list and the ledger — elevators belonging
   * to the deleted building cascade-delete server-side.
   */
  onDeleted?: () => void;
}

/**
 * Minimal standalone building-management surface: a flat list of every
 * building (name + address), each with a per-row Delete action using the
 * same inline reveal-confirm pattern as LedgerPage's per-row elevator Delete
 * and inline date Save/Cancel — clicking Delete reveals Confirm delete/Cancel
 * rather than a native confirm() dialog.
 */
export function BuildingList({ buildings, onDeleted }: BuildingListProps) {
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleDeleteRequest(buildingId: number) {
    setConfirmingDeleteId(buildingId);
  }

  function handleDeleteCancel() {
    setConfirmingDeleteId(null);
  }

  async function handleDeleteConfirm(buildingId: number) {
    setDeletingId(buildingId);
    try {
      await deleteBuilding(buildingId);
      setConfirmingDeleteId(null);
      onDeleted?.();
    } catch (err) {
      logError("Failed to delete building", err, { buildingId });
      setError("Could not delete the building. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className={styles.wrapper} aria-label="Buildings">
      <h2>Buildings</h2>
      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}
      {buildings.length === 0 ? (
        <p className={formStyles.hint}>No buildings yet.</p>
      ) : (
        <ul className={styles.list}>
          {buildings.map((building) => {
            const isConfirmingDelete = confirmingDeleteId === building.id;
            const isDeleting = deletingId === building.id;

            return (
              <li key={building.id} className={styles.item}>
                <div className={styles.itemInfo}>
                  <span className={styles.itemName}>{building.name}</span>
                  <span className={styles.itemAddress}>{building.address}</span>
                </div>
                {isConfirmingDelete ? (
                  <span className={styles.actions}>
                    <button
                      type="button"
                      className={formStyles.primaryButton}
                      aria-label={`Confirm delete building ${building.name}`}
                      disabled={isDeleting}
                      onClick={() => handleDeleteConfirm(building.id)}
                    >
                      {isDeleting ? "Deleting…" : "Confirm delete"}
                    </button>
                    <button
                      type="button"
                      className={formStyles.secondaryButton}
                      aria-label={`Cancel deleting building ${building.name}`}
                      disabled={isDeleting}
                      onClick={handleDeleteCancel}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className={styles.actions}>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      aria-label={`Delete building ${building.name}`}
                      onClick={() => handleDeleteRequest(building.id)}
                    >
                      Delete
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
