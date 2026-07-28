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
  const [seedSuccessMessage, setSeedSuccessMessage] = useState<string | null>(null);

  async function handleSeedClick() {
    // Guards against a second activation landing while a request is already
    // in flight. This replaces the native `disabled` attribute as the
    // in-flight guard (see the button below), so it has to be re-checked
    // here explicitly.
    if (seeding) return;
    setSeeding(true);
    setSeedError(null);
    setSeedSuccessMessage(null);
    try {
      const result = await seedDemoData();
      const buildingWord = result.buildings_created === 1 ? "building" : "buildings";
      const elevatorWord = result.elevators_created === 1 ? "elevator" : "elevators";
      setSeedSuccessMessage(
        `Added ${result.buildings_created} ${buildingWord} and ${result.elevators_created} ${elevatorWord}. Loading your portfolio…`,
      );
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
      {/*
        A visually separated "shortcut" section, not a 4th numbered step —
        the three steps above are the real, primary path (a real building's
        data); this is an alternative for a first look at the app without one
        on hand yet, so it's called out as a detour rather than competing
        with the steps as an equal-weight instruction.
      */}
      <div className={styles.altPath}>
        <p className={styles.altPathLede}>
          Or, skip ahead — populate this view with a realistic sample portfolio to see Riser in
          action right away.
        </p>
        {seedError && (
          <div className={styles.errorBanner} role="alert">
            {seedError}
          </div>
        )}
        <button
          type="button"
          className={styles.primaryButton}
          aria-disabled={seeding}
          aria-busy={seeding}
          onClick={() => {
            void handleSeedClick();
          }}
        >
          {seeding ? "Adding sample data…" : "Try sample data"}
        </button>
        {/*
          role="status" is an implicit polite/atomic live region, announced
          to screen readers as soon as its text changes — without this, a
          screen-reader user gets no equivalent of the sighted experience of
          watching the table appear (the empty state can unmount before they
          navigate back to look for a result).
        */}
        <p className={styles.successMessage} role="status">
          {seedSuccessMessage && (
            <>
              <span aria-hidden="true">✓</span> {seedSuccessMessage}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
