import { useState } from "react";
import { seedDemoData } from "../api/client";
import { logError } from "../lib/logger";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  /**
   * Called after "Try sample data" successfully seeds demo buildings/
   * elevators via POST /api/demo-data/seed/, so a parent (e.g. `App`) can
   * trigger a ledger refetch the same way it does after any other
   * create/update (see `reloadSignal` in App.tsx).
   */
  onSeeded: () => void;
}

/**
 * Polished first-run empty state for the ledger. Nests inside `LedgerPage`,
 * which itself mounts under `<main><h2 class="visually-hidden">Portfolio
 * ledger</h2>`, so this heading is an `<h3>` to keep the document outline
 * correctly nested.
 *
 * PRD's "Getting started (empty state)" sub-journey (docs/prd/Riser-PRD.md)
 * points at the address-lookup fast start as the primary path, with the
 * manual "Add a building" / "Add an elevator" forms as the fallback for
 * addresses DOB doesn't resolve. Both are rendered above the ledger in
 * App.tsx (AddressLookupForm, then BuildingForm/ElevatorForm). "Try sample
 * data" is a third, even-faster path for a first look at the app without
 * needing a real building on hand.
 */
export function EmptyState({ onSeeded }: EmptyStateProps) {
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  async function handleSeedClick() {
    setSeeding(true);
    setSeedError(null);
    try {
      await seedDemoData();
      onSeeded();
    } catch (err) {
      logError("Failed to seed demo data", err);
      setSeedError("Could not load sample data. Please try again.");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className={styles.emptyState}>
      <span className={styles.icon} aria-hidden="true">
        🏢
      </span>
      <h3 className={styles.heading}>No elevators yet</h3>
      <p className={styles.lede}>
        Look up your first building by address to auto-populate its elevators from NYC DOB records,
        or add a building and its elevators manually, to start tracking compliance deadlines across
        your portfolio. Once you save an elevator, it will appear here automatically, ranked by how
        urgently it needs attention.
      </p>
      <ol className={styles.steps}>
        <li>
          Use the <strong>&ldquo;Look up an address&rdquo;</strong> form above to auto-populate a
          building from its NYC DOB elevator records.
        </li>
        <li>
          If DOB doesn&rsquo;t have your building on file, use the{" "}
          <strong>&ldquo;Add a building&rdquo;</strong> form above to enter its name and address.
        </li>
        <li>
          Use the <strong>&ldquo;Add an elevator&rdquo;</strong> form above to add a device, its
          inspection type, and its last inspection date.
        </li>
      </ol>
      {seedError && (
        <div className={styles.errorBanner} role="alert">
          {seedError}
        </div>
      )}
      <button
        type="button"
        className={styles.primaryButton}
        disabled={seeding}
        onClick={handleSeedClick}
      >
        {seeding ? "Adding sample data…" : "Try sample data"}
      </button>
    </div>
  );
}
