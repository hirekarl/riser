import type { ComplianceStatus } from "../types/domain";
import styles from "./StatusBadge.module.css";

// CSS module class names stay lowercase regardless of the API's capitalized
// status vocabulary — this map is the one place that bridges the two.
const STATUS_META: Record<ComplianceStatus, { className: string; icon: string }> = {
  Compliant: { className: "compliant", icon: "✓" }, // check mark
  Warning: { className: "warning", icon: "⚠" }, // warning triangle
  Delinquent: { className: "delinquent", icon: "✕" }, // cross mark
};

export interface StatusBadgeProps {
  status: ComplianceStatus;
}

/**
 * A color-coded status pill. Color is never the only signal: each status also
 * carries a distinct icon and text label, satisfying WCAG 1.4.1 (Use of Color).
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  const meta = STATUS_META[status];
  return (
    <span className={`${styles.badge} ${styles[meta.className]}`}>
      <span className={styles.icon} aria-hidden="true">
        {meta.icon}
      </span>
      {status}
    </span>
  );
}
