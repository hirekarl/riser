import { useId, useState } from "react";
import type { FormEvent } from "react";
import { createBuilding } from "../../api/client";
import { logError } from "../../lib/logger";
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
    } catch (err) {
      logError("Failed to create building", err);
      setError("Could not add building. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className={`${styles.form} ${styles.formSecondary}`}
      onSubmit={handleSubmit}
      aria-label="Add a building"
    >
      <div className={styles.panelHead}>
        <span className={styles.panelIcon} aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M4 17.5V5.2L10 2.5l6 2.7v12.3"
              stroke="var(--navy-soft-text)"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <path
              d="M10 6.5v11"
              stroke="var(--navy-soft-text)"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="M6 10.5h1.6M12.4 10.5H14"
              stroke="var(--navy-soft-text)"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <h2 className={styles.panelTitle}>
          Add Building
          <small>Manual entry</small>
        </h2>
      </div>
      <p className={styles.fallbackHint}>
        Already have the details on hand? Skip the DOB lookup above and enter this building directly
        — useful when you already know the address and name, or the lookup above couldn't find it.
      </p>
      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}
      <div className={styles.field}>
        <label htmlFor={nameId} className={styles.fieldLabelEyebrow}>
          Building name
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          required
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={addressId} className={styles.fieldLabelEyebrow}>
          Address
        </label>
        <input
          id={addressId}
          type="text"
          value={address}
          required
          onChange={(event) => setAddress(event.target.value)}
        />
      </div>
      <button
        type="submit"
        className={`${styles.primaryButton} ${styles.blockButton}`}
        disabled={submitting}
      >
        {submitting ? "Adding…" : "Add building"}
      </button>
    </form>
  );
}
