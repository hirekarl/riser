import styles from "./EmptyState.module.css";

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
 * App.tsx (AddressLookupForm, then BuildingForm/ElevatorForm).
 */
export function EmptyState() {
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
    </div>
  );
}
