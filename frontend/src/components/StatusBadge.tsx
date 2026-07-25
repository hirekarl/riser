import { logWarn } from "../lib/logger";
import type { ComplianceStatus } from "../types/domain";
import styles from "./StatusBadge.module.css";

// CSS module class names stay lowercase regardless of the API's capitalized
// status vocabulary — this map is the one place that bridges the two.
const STATUS_META: Record<ComplianceStatus, { className: string; icon: string }> = {
  Compliant: { className: "compliant", icon: "✓" }, // check mark
  Warning: { className: "warning", icon: "⚠" }, // warning triangle
  Delinquent: { className: "delinquent", icon: "✕" }, // cross mark
};

// Fallback used when `status` isn't one of the recognized keys above (e.g.
// API drift, or a null/unexpected value slipping through the type system at
// runtime). Keeps rendering resilient instead of throwing mid-render.
const UNKNOWN_STATUS_META = { className: "unknown", icon: "?" };

export interface StatusBadgeProps {
  status: ComplianceStatus;
}

/**
 * A color-coded status pill. Color is never the only signal: each status also
 * carries a distinct icon and text label, satisfying WCAG 1.4.1 (Use of Color).
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  const isRecognized = status in STATUS_META;
  if (!isRecognized) {
    logWarn("Unrecognized compliance status", { status });
  }
  const meta = isRecognized ? STATUS_META[status] : UNKNOWN_STATUS_META;
  return (
    <span className={`${styles.badge} ${styles[meta.className]}`}>
      <span className={styles.icon} aria-hidden="true">
        {meta.icon}
      </span>
      {status}
    </span>
  );
}
