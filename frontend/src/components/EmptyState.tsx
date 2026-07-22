import styles from "./EmptyState.module.css";

/**
 * Polished first-run empty state for the ledger. Nests inside `LedgerPage`,
 * which itself mounts under `<main><h2 class="visually-hidden">Portfolio
 * ledger</h2>`, so this heading is an `<h3>` to keep the document outline
 * correctly nested.
 *
 * PRD's "Getting started (empty state)" sub-journey (docs/prd/Riser-PRD.md)
 * says this should point at the address-lookup fast start, but that feature
 * doesn't exist yet (best-effort stretch item, see docs/sprints/day-by-day-plan.md).
 * Until it ships, this points at the actual working fast start instead: the
 * "Add a building" / "Add an elevator" forms already rendered above the
 * ledger in App.tsx. Revisit once address-lookup lands.
 */
export function EmptyState() {
  return (
    <div className={styles.emptyState}>
      <span className={styles.icon} aria-hidden="true">
        🏢
      </span>
      <h3 className={styles.heading}>No elevators yet</h3>
      <p className={styles.lede}>
        Add your first building, then add an elevator to it, to start tracking compliance deadlines
        across your portfolio. Once you save an elevator, it will appear here automatically, ranked
        by how urgently it needs attention.
      </p>
      <ol className={styles.steps}>
        <li>
          Use the <strong>&ldquo;Add a building&rdquo;</strong> form above to enter its name and
          address.
        </li>
        <li>
          Use the <strong>&ldquo;Add an elevator&rdquo;</strong> form above to add a device, its
          inspection type, and its last inspection date.
        </li>
      </ol>
    </div>
  );
}
