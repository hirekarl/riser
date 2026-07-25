import { useId, useState } from "react";
import type { FormEvent } from "react";
import { createElevator, updateElevator } from "../../api/client";
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
      } catch {
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
      });
      onCreated(elevator);
      setDeviceIdentifier("");
      setLastInspectionDate("");
    } catch {
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
      className={styles.form}
      onSubmit={handleSubmit}
      aria-label={isEditing ? "Edit an elevator" : "Add an elevator"}
    >
      <h2>{isEditing ? "Edit an elevator" : "Add an elevator"}</h2>
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
          <label htmlFor={buildingId}>Building</label>
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
        <label htmlFor={deviceId}>Device identifier</label>
        <input
          id={deviceId}
          type="text"
          value={deviceIdentifier}
          disabled={fieldsDisabled}
          required
          onChange={(event) => setDeviceIdentifier(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={typeId}>Inspection type</label>
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
        <label htmlFor={dateId}>Last inspection date</label>
        <input
          id={dateId}
          type="date"
          value={lastInspectionDate}
          disabled={fieldsDisabled}
          required
          onChange={(event) => setLastInspectionDate(event.target.value)}
        />
      </div>
      <div className={styles.actions}>
        <button type="submit" disabled={submitting || fieldsDisabled}>
          {submitting
            ? isEditing
              ? "Saving…"
              : "Adding…"
            : isEditing
              ? "Save changes"
              : "Add elevator"}
        </button>
        {isEditing && (
          <button type="button" onClick={handleCancel} disabled={submitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
