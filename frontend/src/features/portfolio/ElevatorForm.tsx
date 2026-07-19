import { useId, useState } from "react";
import type { FormEvent } from "react";
import { createElevator } from "../../api/client";
import type { Building, Elevator, InspectionType } from "../../types/domain";
import styles from "./forms.module.css";

export interface ElevatorFormProps {
  buildings: Building[];
  onCreated: (elevator: Elevator) => void;
}

export function ElevatorForm({ buildings, onCreated }: ElevatorFormProps) {
  const buildingId = useId();
  const deviceId = useId();
  const typeId = useId();
  const dateId = useId();

  const [building, setBuilding] = useState<number | "">("");
  const [deviceIdentifier, setDeviceIdentifier] = useState("");
  const [inspectionType, setInspectionType] = useState<InspectionType>("CAT1");
  const [lastInspectionDate, setLastInspectionDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const hasBuildings = buildings.length > 0;
  // Fall back to the first building whenever the currently selected one is no
  // longer valid (e.g. the list just loaded, or arrived after this mounted).
  const selectedBuilding: number | "" =
    building !== "" && buildings.some((b) => b.id === building)
      ? building
      : (buildings[0]?.id ?? "");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  return (
    <form className={styles.form} onSubmit={handleSubmit} aria-label="Add an elevator">
      <h2>Add an elevator</h2>
      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}
      {!hasBuildings && (
        <p className={styles.hint}>Add a building first before adding an elevator.</p>
      )}
      <div className={styles.field}>
        <label htmlFor={buildingId}>Building</label>
        <select
          id={buildingId}
          value={selectedBuilding}
          disabled={!hasBuildings}
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
      <div className={styles.field}>
        <label htmlFor={deviceId}>Device identifier</label>
        <input
          id={deviceId}
          type="text"
          value={deviceIdentifier}
          disabled={!hasBuildings}
          required
          onChange={(event) => setDeviceIdentifier(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={typeId}>Inspection type</label>
        <select
          id={typeId}
          value={inspectionType}
          disabled={!hasBuildings}
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
          disabled={!hasBuildings}
          required
          onChange={(event) => setLastInspectionDate(event.target.value)}
        />
      </div>
      <button type="submit" disabled={submitting || !hasBuildings}>
        {submitting ? "Adding…" : "Add elevator"}
      </button>
    </form>
  );
}
