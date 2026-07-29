import type { LedgerEntry } from "../../types/domain";
import styles from "./ExecutiveSummaryBand.module.css";

export interface ExecutiveSummaryBandProps {
  entries: LedgerEntry[];
  totalBuildingsCount: number;
  totalFineExposure?: number;
}

export function ExecutiveSummaryBand({
  entries,
  totalBuildingsCount,
  totalFineExposure = 0,
}: ExecutiveSummaryBandProps) {
  const totalElevators = entries.length;
  const delinquentCount = entries.filter((e) => e.status === "Delinquent").length;
  const warningCount = entries.filter((e) => e.status === "Warning").length;
  const atRiskCount = delinquentCount + warningCount;

  // Compute next inspection due date
  const upcomingDueDates = entries
    .map((e) => e.due_date)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const nextDueDate = upcomingDueDates.length > 0 ? upcomingDueDates[0] : "None";

  const formattedExposure = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(totalFineExposure);

  return (
    <div className={styles.container} aria-label="Portfolio Summary Statistics">
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.label}>Portfolio Buildings</span>
          <span className={styles.icon} aria-hidden="true">
            🏢
          </span>
        </div>
        <div className={styles.value}>{totalBuildingsCount}</div>
        <div className={styles.subtext}>Monitored Properties</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.label}>Active Elevators</span>
          <span className={styles.icon} aria-hidden="true">
            🛗
          </span>
        </div>
        <div className={styles.value}>{totalElevators}</div>
        <div className={styles.subtext}>Registered Devices</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.label}>At-Risk / Delinquent</span>
          <span className={styles.icon} aria-hidden="true">
            ⚠️
          </span>
        </div>
        <div className={`${styles.value} ${atRiskCount > 0 ? styles.atRiskValue : ""}`}>
          {atRiskCount}
        </div>
        <div className={styles.subtext}>
          {delinquentCount} Delinquent, {warningCount} Warning
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.label}>Next Inspection Due</span>
          <span className={styles.icon} aria-hidden="true">
            📅
          </span>
        </div>
        <div className={styles.value}>{nextDueDate}</div>
        <div className={styles.subtext}>Earliest Compliance Window</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.label}>DOB Penalty Exposure</span>
          <span className={styles.icon} aria-hidden="true">
            ⚖️
          </span>
        </div>
        <div className={`${styles.value} ${totalFineExposure > 0 ? styles.exposureValue : ""}`}>
          {formattedExposure}
        </div>
        <div className={styles.subtext}>Aggregated ECB Fines</div>
      </div>
    </div>
  );
}
