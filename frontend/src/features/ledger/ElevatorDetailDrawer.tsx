import { useEffect, useRef } from "react";
import { StatusBadge } from "../../components/StatusBadge";
import type { LedgerEntry } from "../../types/domain";
import styles from "./ElevatorDetailDrawer.module.css";

export interface ElevatorDetailDrawerProps {
  /**
   * The ledger row to show full details for, or `null` when the drawer
   * should be closed. Controlled entirely by the parent (`LedgerPage`) —
   * this component holds no open/closed state of its own.
   */
  entry: LedgerEntry | null;
  onClose: () => void;
}

/**
 * A slide-over panel showing a single ledger row's full detail set (status,
 * building/location, inspection dates, an open-violation alert, and a
 * static link out to NYC DOB's BIS Web search) beyond what the ledger
 * table's own row/expanded-remediation-panel show inline.
 */
export function ElevatorDetailDrawer({ entry, onClose }: ElevatorDetailDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (entry) {
      closeButtonRef.current?.focus();
    }
  }, [entry]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && entry) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [entry, onClose]);

  if (!entry) return null;

  return (
    <div className={styles.overlay}>
      <button
        type="button"
        className={styles.backdropButton}
        onClick={onClose}
        tabIndex={-1}
        aria-hidden="true"
        data-testid="drawer-overlay"
      />
      <div className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className={styles.header}>
          <h2 id="drawer-title" className={styles.title}>
            Device Details — {entry.device_identifier}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close details drawer"
          >
            ✕
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Compliance Status</h3>
            <div>
              <StatusBadge status={entry.status} />
            </div>
          </div>

          {entry.has_open_violation && (
            <div className={styles.violationAlert} role="alert">
              <strong>⚠️ Open DOB Safety Violation Detected</strong>
              <p className={styles.violationAlertBody}>
                This device has an active open safety violation registered with the NYC Department
                of Buildings.
              </p>
            </div>
          )}

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Building &amp; Location</h3>
            <div className={styles.grid}>
              <div className={styles.metaItem}>
                <div className={styles.metaLabel}>Building Name</div>
                <div className={styles.metaValue}>{entry.building_name}</div>
              </div>
              <div className={styles.metaItem}>
                <div className={styles.metaLabel}>DOB Device #</div>
                <div className={styles.metaValue}>{entry.dob_device_number || "Unlinked"}</div>
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Inspection Details</h3>
            <div className={styles.grid}>
              <div className={styles.metaItem}>
                <div className={styles.metaLabel}>Inspection Category</div>
                <div className={styles.metaValue}>{entry.inspection_type}</div>
              </div>
              <div className={styles.metaItem}>
                <div className={styles.metaLabel}>Last Inspection Date</div>
                <div className={styles.metaValue}>{entry.last_inspection_date}</div>
              </div>
              <div className={styles.metaItem}>
                <div className={styles.metaLabel}>Compliance Due Date</div>
                <div className={styles.metaValue}>{entry.due_date}</div>
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Official DOB Resources</h3>
            <a
              href="https://a810-bisweb.nyc.gov/bisweb/bispi00.jsp"
              target="_blank"
              rel="noreferrer"
              className={styles.officialLink}
            >
              Verify on NYC DOB BIS Web Search <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
