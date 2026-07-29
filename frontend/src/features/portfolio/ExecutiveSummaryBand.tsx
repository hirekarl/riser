import type { ReactNode } from "react";
import { getDueUrgency } from "../../lib/dueUrgency";
import type { BuildingFineExposure, LedgerEntry } from "../../types/domain";
import styles from "./ExecutiveSummaryBand.module.css";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export interface ExecutiveSummaryBandProps {
  /**
   * Ledger entries as returned by GET /api/ledger/ (already sorted and
   * status-computed server-side). Used here only for straightforward
   * client-side aggregation — counting and finding the minimum due date —
   * never to re-derive status or the ledger's own sort order.
   */
  entries: LedgerEntry[];
  /** Total building count, passed straight through from `App`'s `buildings` state. */
  buildingsCount: number;
  /**
   * Portfolio-wide fine exposure (issue #120), fetched once by the parent
   * (`App`) alongside the ledger/buildings via `fetchPortfolioFineExposure`.
   * `null` while that fetch is still in flight. Entries with a non-null
   * `reason` (e.g. `"no_bin_on_file"`, `"upstream_unavailable"`) are
   * excluded from the summed total and surfaced instead as a caveat on this
   * tile — mirroring `BuildingList`'s per-row handling of the same field, so
   * this tile never presents a silently-incomplete dollar figure as if it
   * were the whole picture.
   */
  fineExposures: BuildingFineExposure[] | null;
}

/**
 * Portfolio-wide stat band shown above the narration panel: five tiles
 * (buildings, active elevators, at-risk/delinquent count, next inspection
 * due, and DOB penalty exposure), all computed client-side from data the
 * parent already fetched — no dedicated summary endpoint.
 */
export function ExecutiveSummaryBand({
  entries,
  buildingsCount,
  fineExposures,
}: ExecutiveSummaryBandProps) {
  const activeElevatorCount = entries.length;
  const delinquentCount = entries.filter((entry) => entry.status === "Delinquent").length;
  const warningCount = entries.filter((entry) => entry.status === "Warning").length;
  const atRiskCount = delinquentCount + warningCount;

  // Earliest due date among the passed-in entries — a plain min-by-due_date
  // scan over the already server-sorted ledger, not a re-derivation of its
  // status or overall sort order.
  const nextDueEntry = entries.reduce<LedgerEntry | null>((earliest, entry) => {
    if (!earliest) return entry;
    return entry.due_date < earliest.due_date ? entry : earliest;
  }, null);
  const nextDueUrgency = nextDueEntry ? getDueUrgency(nextDueEntry) : null;
  const nextDueClassName = nextDueUrgency
    ? nextDueUrgency.level === "overdue"
      ? styles.dueOverdue
      : nextDueUrgency.level === "soon"
        ? styles.dueSoon
        : styles.dueOk
    : undefined;

  const resolvedExposures = fineExposures?.filter((exposure) => exposure.reason === null) ?? [];
  const totalExposure = resolvedExposures.reduce(
    (acc, exposure) => acc + (Number(exposure.total_exposure) || 0),
    0,
  );
  const hasIncompleteExposure = (fineExposures ?? []).some((exposure) => exposure.reason !== null);
  const exposureIsLoading = fineExposures === null;

  return (
    <div className={styles.container} aria-label="Portfolio summary">
      <SummaryTile
        icon={<BuildingIcon />}
        label="Portfolio Buildings"
        value={buildingsCount}
        subtext="Monitored properties"
      />
      <SummaryTile
        icon={<ElevatorIcon />}
        label="Active Elevators"
        value={activeElevatorCount}
        subtext="Registered devices"
      />
      <SummaryTile
        icon={<WarningIcon />}
        label="At-Risk / Delinquent"
        value={atRiskCount}
        valueClassName={atRiskCount > 0 ? styles.atRiskValue : undefined}
        subtext={`${delinquentCount} Delinquent, ${warningCount} Warning`}
      />
      <SummaryTile
        icon={<CalendarIcon />}
        label="Next Inspection Due"
        value={nextDueEntry ? nextDueEntry.due_date : "No upcoming inspections"}
        valueClassName={nextDueClassName}
        subtext={
          nextDueUrgency?.subtext ||
          (nextDueEntry ? nextDueEntry.building_name : "Nothing currently on the ledger")
        }
      />
      <SummaryTile
        icon={<ScaleIcon />}
        label="DOB Penalty Exposure"
        value={exposureIsLoading ? "—" : currencyFormatter.format(totalExposure)}
        valueClassName={!exposureIsLoading && totalExposure > 0 ? styles.exposureValue : undefined}
        subtext={
          exposureIsLoading
            ? "Calculating…"
            : hasIncompleteExposure
              ? "Aggregated ECB fines · incomplete"
              : "Aggregated ECB fines"
        }
      />
    </div>
  );
}

interface SummaryTileProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  valueClassName?: string;
  subtext: string;
}

function SummaryTile({ icon, label, value, valueClassName, subtext }: SummaryTileProps) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
        <p className={styles.label}>{label}</p>
      </div>
      <div className={[styles.value, valueClassName].filter(Boolean).join(" ")}>{value}</div>
      <span className={styles.subtext}>{subtext}</span>
    </div>
  );
}

// Icon language mirrors forms.module.css's .panelIcon SVGs (see
// AddressLookupForm/BuildingForm/ElevatorForm): 20x20 viewBox,
// var(--navy-soft-text) strokes, no fill — so this tile band reads as part
// of the same restrained, executive icon system as the panels above it
// rather than introducing an unrelated emoji-based one.

function BuildingIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 17.5V5.2L10 2.5l6 2.7v12.3"
        stroke="var(--navy-soft-text)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M7 8.5h.01M10 8.5h.01M13 8.5h.01M7 11.5h.01M10 11.5h.01M13 11.5h.01"
        stroke="var(--navy-soft-text)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M8.3 17.5v-4.2h3.4v4.2"
        stroke="var(--navy-soft-text)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ElevatorIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="5.5"
        y="3"
        width="9"
        height="14"
        rx="1.3"
        stroke="var(--navy-soft-text)"
        strokeWidth="1.4"
      />
      <path
        d="M8.3 8.4 10 6.6l1.7 1.8M8.3 11.6 10 13.4l1.7-1.8"
        stroke="var(--navy-soft-text)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10 3.3 17.4 16.2H2.6L10 3.3Z"
        stroke="var(--navy-soft-text)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M10 8.3v3.4"
        stroke="var(--navy-soft-text)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M10 13.8h.01"
        stroke="var(--navy-soft-text)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="3"
        y="4.5"
        width="14"
        height="12"
        rx="1.3"
        stroke="var(--navy-soft-text)"
        strokeWidth="1.4"
      />
      <path d="M3 8h14" stroke="var(--navy-soft-text)" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M6.5 3v3M13.5 3v3"
        stroke="var(--navy-soft-text)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ScaleIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10 3v13.5M6.3 16.5h7.4"
        stroke="var(--navy-soft-text)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M10 5.3 5.3 9.3h9.4L10 5.3Z"
        stroke="var(--navy-soft-text)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M3 9.3c0 1.35 1.03 2.4 2.3 2.4s2.3-1.05 2.3-2.4M12.4 9.3c0 1.35 1.03 2.4 2.3 2.4s2.3-1.05 2.3-2.4"
        stroke="var(--navy-soft-text)"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </svg>
  );
}
