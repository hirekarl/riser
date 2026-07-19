import { useId, useState } from "react";
import type { FormEvent } from "react";
import { createBuilding } from "../../api/client";
import type { Building } from "../../types/domain";
import styles from "./forms.module.css";

export interface BuildingFormProps {
  onCreated: (building: Building) => void;
}

export function BuildingForm({ onCreated }: BuildingFormProps) {
  const nameId = useId();
  const addressId = useId();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const building = await createBuilding({ name, address });
      onCreated(building);
      setName("");
      setAddress("");
    } catch {
      setError("Could not add building. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} aria-label="Add a building">
      <h2>Add a building</h2>
      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}
      <div className={styles.field}>
        <label htmlFor={nameId}>Building name</label>
        <input
          id={nameId}
          type="text"
          value={name}
          required
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={addressId}>Address</label>
        <input
          id={addressId}
          type="text"
          value={address}
          required
          onChange={(event) => setAddress(event.target.value)}
        />
      </div>
      <button type="submit" disabled={submitting}>
        {submitting ? "Adding…" : "Add building"}
      </button>
    </form>
  );
}
