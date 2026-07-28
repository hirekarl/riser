import { useRef, useState } from "react";
import { deleteBuilding } from "../../api/client";
import { logError } from "../../lib/logger";
import type { Building } from "../../types/domain";
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

  // See the equivalent comment in LedgerPage.tsx: a deleted building's row
  // disappears (immediately when confirmingDeleteId is cleared, and again
  // once the parent's refetch drops it from `buildings`), so whichever
  // button had focus needs a stable, always-present landing spot instead of
  // silently falling back to <body>. The "Buildings" heading fills that role
  // here; `deleteAnnouncement` explicitly tells screen-reader users what was
  // deleted, since the row vanishing isn't otherwise announced.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [deleteAnnouncement, setDeleteAnnouncement] = useState<string | null>(null);

  function handleDeleteRequest(buildingId: number) {
    setConfirmingDeleteId(buildingId);
  }

  function handleDeleteCancel() {
    setConfirmingDeleteId(null);
  }

  async function handleDeleteConfirm(buildingId: number) {
    setDeletingId(buildingId);
    try {
      const deletedBuilding = buildings.find((building) => building.id === buildingId);
      await deleteBuilding(buildingId);
      setConfirmingDeleteId(null);
      headingRef.current?.focus();
      setDeleteAnnouncement(
        deletedBuilding ? `${deletedBuilding.name} deleted.` : "Building deleted.",
      );
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
      {/* tabIndex={-1}: focusable only via headingRef.current.focus() (see
          handleDeleteConfirm), never added to the tab order. */}
      <h2 ref={headingRef} tabIndex={-1}>
        Buildings
      </h2>
      {/* Always-mounted polite live region so assistive tech has already
          registered it by the time a delete updates its text. */}
      <div role="status" aria-live="polite" className="visually-hidden">
        {deleteAnnouncement}
      </div>
      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}
      {buildings.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.hint}>No buildings yet.</p>
          <p className={styles.hint}>
            Use the <strong>&ldquo;Look up an address&rdquo;</strong> form above to auto-populate a
            building from its NYC DOB elevator records, or the{" "}
            <strong>&ldquo;Add a building&rdquo;</strong> form above to enter one manually.
          </p>
        </div>
      ) : (
        <ul className={styles.list}>
          {buildings.map((building) => {
            const isConfirmingDelete = confirmingDeleteId === building.id;
            const isDeleting = deletingId === building.id;

            return (
              <li
                key={building.id}
                className={
                  isConfirmingDelete ? `${styles.item} ${styles.itemConfirming}` : styles.item
                }
              >
                <div className={styles.itemInfo}>
                  <span className={styles.itemName}>{building.name}</span>
                  <span className={styles.itemAddress}>{building.address}</span>
                </div>
                {isConfirmingDelete ? (
                  <span className={styles.confirmDeleteGroup}>
                    <p className={styles.deleteWarning}>
                      Deleting <strong>{building.name}</strong> also deletes all of its elevators.
                      This can&rsquo;t be undone.
                    </p>
                    <span className={styles.actions}>
                      <button
                        type="button"
                        className={styles.confirmDeleteButton}
                        aria-label={`Confirm delete building ${building.name} and all its elevators`}
                        disabled={isDeleting}
                        onClick={() => handleDeleteConfirm(building.id)}
                      >
                        {isDeleting ? "Deleting…" : "Confirm delete"}
                      </button>
                      <button
                        type="button"
                        className={styles.cancelDeleteButton}
                        aria-label={`Cancel deleting building ${building.name}`}
                        disabled={isDeleting}
                        onClick={handleDeleteCancel}
                      >
                        Cancel
                      </button>
                    </span>
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
