import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createElevator, updateElevator } from "../../api/client";
import { logError } from "../../lib/logger";
import type { Building, Elevator, InspectionType } from "../../types/domain";
import styles from "./forms.module.css";

/**
 * Minimal shape needed to drive edit mode. Deliberately narrower than the
 * full `Elevator` type: it omits `building`, `created_at`, and `updated_at`,
 * none of which are part of `UpdateElevatorPayload` or needed to pre-fill
 * the editable fields. A `LedgerEntry` satisfies this shape structurally, so
 * callers can pass a ledger row straight through without fetching a full
 * `Elevator` first.
 */
export type EditableElevator = Pick<
  Elevator,
  "id" | "device_identifier" | "inspection_type" | "last_inspection_date"
>;

export interface ElevatorFormProps {
  buildings: Building[];
  onCreated: (elevator: Elevator) => void;
  /** When set (non-null), the form switches into edit mode for this elevator. */
  editingElevator?: EditableElevator | null;
  /** Called with the updated elevator after a successful save in edit mode. */
  onUpdated?: (elevator: Elevator) => void;
  /** Called when the user cancels out of edit mode without saving. */
  onEditCancel?: () => void;
}

export function ElevatorForm({
  buildings,
  onCreated,
  editingElevator = null,
  onUpdated,
  onEditCancel,
}: ElevatorFormProps) {
  const buildingId = useId();
  const deviceId = useId();
  const typeId = useId();
  const dateId = useId();

  const isEditing = editingElevator !== null;

  const formRef = useRef<HTMLFormElement>(null);
  const deviceInputRef = useRef<HTMLInputElement>(null);

  const [building, setBuilding] = useState<number | "">("");
  const [deviceIdentifier, setDeviceIdentifier] = useState("");
  const [inspectionType, setInspectionType] = useState<InspectionType>("CAT1");
  const [lastInspectionDate, setLastInspectionDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Re-prime the fields whenever the elevator being edited changes (including
  // the transition into/out of edit mode), so the form always reflects the
  // record it's currently pointed at rather than stale local state. Adjusting
  // state during render (rather than in an effect) is the pattern React
  // recommends for "resetting state when a prop changes" — it avoids an
  // extra, visible render with stale field values.
  const [primedElevator, setPrimedElevator] = useState<EditableElevator | null>(null);
  if (editingElevator !== primedElevator) {
    setPrimedElevator(editingElevator);
    if (editingElevator) {
      setDeviceIdentifier(editingElevator.device_identifier);
      setInspectionType(editingElevator.inspection_type);
      setLastInspectionDate(editingElevator.last_inspection_date);
    } else {
      // Returning to create mode (e.g. cancel, or after a save) should start
      // from a clean slate rather than leaving the just-edited values behind.
      setDeviceIdentifier("");
      setInspectionType("CAT1");
      setLastInspectionDate("");
    }
    setError(null);
  }

  // The form lives near the top of the page while the ledger table (where
  // Edit is clicked) is further down and often scrolled out of view. Without
  // this, clicking Edit appears to silently do nothing. Scroll the form into
  // view and move focus to the first editable field whenever edit mode is
  // entered, or the user switches which elevator is being edited (keyed off
  // the elevator's id so this doesn't re-fire on unrelated re-renders, e.g.
  // typing into a field). Deliberately does not run on initial mount when
  // there's no `editingElevator`.
  useEffect(() => {
    if (editingElevator) {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      deviceInputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingElevator?.id]);

  const hasBuildings = buildings.length > 0;
  // Fall back to the first building whenever the currently selected one is no
  // longer valid (e.g. the list just loaded, or arrived after this mounted).
  const selectedBuilding: number | "" =
    building !== "" && buildings.some((b) => b.id === building)
      ? building
      : (buildings[0]?.id ?? "");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isEditing) {
      if (!editingElevator) return;
      setSubmitting(true);
      setError(null);
      try {
        const elevator = await updateElevator(editingElevator.id, {
          device_identifier: deviceIdentifier,
          inspection_type: inspectionType,
          last_inspection_date: lastInspectionDate,
        });
        onUpdated?.(elevator);
      } catch (err) {
        logError("Failed to update elevator", err);
        setError("Could not save changes. Please try again.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (selectedBuilding === "") return;
    setSubmitting(true);
    setError(null);
    try {
      const elevator = await createElevator({
        building: selectedBuilding,
        device_identifier: deviceIdentifier,
        inspection_type: inspectionType,
        last_inspection_date: lastInspectionDate,
        dob_device_number: null,
      });
      onCreated(elevator);
      setDeviceIdentifier("");
      setLastInspectionDate("");
    } catch (err) {
      logError("Failed to create elevator", err);
      setError("Could not add elevator. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    onEditCancel?.();
  }

  // While editing, the building isn't part of `UpdateElevatorPayload` and
  // doesn't need a building list to be present, so the "no buildings yet"
  // gate and the building field itself only apply to the create flow.
  const fieldsDisabled = !isEditing && !hasBuildings;

  return (
    <form
      ref={formRef}
      className={styles.form}
      onSubmit={handleSubmit}
      aria-label={isEditing ? "Edit an elevator" : "Add an elevator"}
    >
      {isEditing ? (
        <h2>{`Edit "${editingElevator.device_identifier}"`}</h2>
      ) : (
        <div className={styles.panelHead}>
          <span className={styles.panelIcon} aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="10" cy="10" r="7" stroke="#1c3a63" strokeWidth="1.4" />
              <circle cx="10" cy="10" r="2.4" stroke="#1c3a63" strokeWidth="1.4" />
              <path
                d="M10 3v1.6M10 15.4V17M17 10h-1.6M4.6 10H3M15 5l-1.1 1.1M6.1 13.9 5 15M15 15l-1.1-1.1M6.1 6.1 5 5"
                stroke="#1c3a63"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <h2 className={styles.panelTitle}>
            Add Device
            <small>Manual entry</small>
          </h2>
        </div>
      )}
      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}
      {!isEditing && !hasBuildings && (
        <p className={styles.hint}>Add a building first before adding an elevator.</p>
      )}
      {!isEditing && (
        <div className={styles.field}>
          <label htmlFor={buildingId} className={styles.fieldLabelEyebrow}>
            Building
          </label>
          <select
            id={buildingId}
            value={selectedBuilding}
            disabled={fieldsDisabled}
            required
            onChange={(event) => setBuilding(Number(event.target.value))}
          >
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className={styles.field}>
        <label htmlFor={deviceId} className={styles.fieldLabelEyebrow}>
          Device identifier
        </label>
        <input
          ref={deviceInputRef}
          id={deviceId}
          type="text"
          value={deviceIdentifier}
          disabled={fieldsDisabled}
          required
          onChange={(event) => setDeviceIdentifier(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={typeId} className={styles.fieldLabelEyebrow}>
          Inspection type
        </label>
        <select
          id={typeId}
          value={inspectionType}
          disabled={fieldsDisabled}
          onChange={(event) => setInspectionType(event.target.value as InspectionType)}
        >
          <option value="CAT1">CAT1 (annual)</option>
          <option value="CAT5">CAT5 (five-year)</option>
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor={dateId} className={styles.fieldLabelEyebrow}>
          Last inspection date
        </label>
        <input
          id={dateId}
          type="date"
          className={styles.dateNavy}
          value={lastInspectionDate}
          disabled={fieldsDisabled}
          required
          onChange={(event) => setLastInspectionDate(event.target.value)}
        />
      </div>
      <div className={styles.actions}>
        <button
          type="submit"
          className={
            isEditing ? styles.primaryButton : `${styles.secondaryButton} ${styles.blockButton}`
          }
          disabled={submitting || fieldsDisabled}
        >
          {submitting
            ? isEditing
              ? "Saving…"
              : "Adding…"
            : isEditing
              ? "Save changes"
              : "Add elevator"}
        </button>
        {isEditing && (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleCancel}
            disabled={submitting}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
