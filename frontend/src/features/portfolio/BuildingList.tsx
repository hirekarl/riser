import { useRef, useState } from "react";
import { deleteBuilding } from "../../api/client";
import { Spinner } from "../../components/Spinner";
import { logError } from "../../lib/logger";
import type { Building, BuildingFineExposure } from "../../types/domain";
import styles from "./BuildingList.module.css";

// USD, no decimals trimmed — a $3,150.50 exposure should read as exactly
// that, not rounded to $3,151.
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export interface BuildingListProps {
  buildings: Building[];
  /**
   * Always-visible, portfolio-wide fine exposure (issue #120), fetched once
   * by the parent (`App`) via a single batched `fetchPortfolioFineExposure()`
   * call alongside buildings/ledger — never per-building or on demand.
   * `null` while that fetch is still in flight (shows a loading state per
   * row); an array (possibly empty) once it resolves.
   */
  fineExposures?: BuildingFineExposure[] | null;
  /**
   * Fine-exposure fetch error surfaced by the parent, if the shared
   * `fetchPortfolioFineExposure()` call itself failed outright (distinct
   * from a per-building `reason` like `"upstream_unavailable"`, which is a
   * normal in-band outcome handled per row instead).
   */
  fineExposuresError?: string | null;
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
export function BuildingList({
  buildings,
  fineExposures = null,
  fineExposuresError = null,
  onDeleted,
}: BuildingListProps) {
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
      {fineExposuresError && (
        <div className={styles.errorBanner} role="alert">
          {fineExposuresError}
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
            const exposure = fineExposures?.find((entry) => entry.building === building.id);

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
                  <FineExposureSummary fineExposures={fineExposures} exposure={exposure} />
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

interface FineExposureSummaryProps {
  /** `null` means the parent's batched fetch is still in flight. */
  fineExposures: BuildingFineExposure[] | null;
  /** This row's own entry, once `fineExposures` has resolved. */
  exposure: BuildingFineExposure | undefined;
}

/**
 * Always-visible, per-row fine-exposure summary (issue #120): building-level
 * only, never per-elevator dollars — see the "join-key gap" discussion in
 * `docs/architecture/integration-contracts.md` §6 for why. Unlike the AI
 * narration panel, this has no on-demand trigger — it's populated from the
 * single batched portfolio-wide fetch `App` already made.
 */
function FineExposureSummary({ fineExposures, exposure }: FineExposureSummaryProps) {
  // `exposure` is also missing (rather than an error) when `fineExposures`
  // has resolved but hasn't caught up with a just-created building yet —
  // e.g. right after Add building, `buildings` updates locally before the
  // next portfolio-wide fine-exposure refetch lands. Treat that the same
  // as "still loading" rather than surfacing a spurious error.
  if (fineExposures === null || !exposure) {
    return (
      <p role="status" className={styles.fineExposureStatus}>
        <Spinner /> Checking fine exposure…
      </p>
    );
  }

  if (exposure.reason === "upstream_unavailable") {
    return (
      <p className={styles.fineExposureError} role="alert">
        Couldn&rsquo;t check fine exposure right now. Please try again.
      </p>
    );
  }

  if (exposure.reason === "no_bin_on_file") {
    return (
      <p className={styles.fineExposureHint}>
        This building hasn&rsquo;t been matched to a NYC DOB building (BIN) yet, so fine exposure
        can&rsquo;t be looked up. Try the address lookup form to match it.
      </p>
    );
  }

  return (
    <p className={styles.fineExposureResult}>
      {currencyFormatter.format(Number(exposure.total_exposure))} in outstanding fines across{" "}
      {exposure.open_violation_count} open violation
      {exposure.open_violation_count === 1 ? "" : "s"}.
    </p>
  );
}
