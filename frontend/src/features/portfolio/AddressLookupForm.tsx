import { useId, useState } from "react";
import type { FormEvent } from "react";
import { createBuilding, createElevator, lookupBuildingByAddress } from "../../api/client";
import { logError } from "../../lib/logger";
import { useIsMounted } from "../narration/useIsMounted";
import type { Building, ElevatorDraft, InspectionType } from "../../types/domain";
import styles from "./forms.module.css";

type FallbackReason = "address_not_found" | "no_devices_on_file" | "upstream_unavailable";

interface Candidate {
  bin: string;
  resolved_address: string;
  borough: string;
}

interface DraftRow {
  key: string;
  deviceIdentifier: string;
  inspectionType: InspectionType;
  lastInspectionDate: string;
  included: boolean;
}

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ambiguous"; matches: Candidate[] }
  | { status: "fallback"; reason: FallbackReason }
  | { status: "review"; match: Candidate; rows: DraftRow[] };

// Distinct, non-dead-end copy per fallback reason, per PRD Journey 1 P1 and
// docs/architecture/integration-contracts.md §3 — each points the user back
// at the manual BuildingForm/ElevatorForm already rendered on the page
// rather than collapsing into one generic "something went wrong" message.
const FALLBACK_MESSAGES: Record<FallbackReason, string> = {
  address_not_found:
    "We couldn't find that address in NYC's records. Double-check the address and try again, or add this building manually using the forms above.",
  no_devices_on_file:
    "We found this building, but NYC DOB has no elevator devices on file for it yet. Add its elevators manually using the forms above.",
  upstream_unavailable:
    "NYC's DOB data service is temporarily unavailable. Try again shortly, or add this building manually using the forms above.",
};

function draftsToRows(drafts: ElevatorDraft[]): DraftRow[] {
  return drafts.map((draft, index) => ({
    key: `${draft.dob_device_number}-${draft.inspection_type}-${index}`,
    deviceIdentifier: draft.dob_device_number,
    inspectionType: draft.inspection_type,
    lastInspectionDate: draft.last_inspection_date,
    included: true,
  }));
}

export interface AddressLookupFormProps {
  /** Called once the building and its included elevators have been saved. */
  onSaved: (building: Building) => void;
}

/**
 * On-demand form that looks up a building by street address via
 * POST /api/buildings/lookup/ (NYC DOB Open Data), then lets the user
 * review/override the resulting draft elevator rows before actually saving
 * via the existing createBuilding/createElevator calls. This endpoint is
 * read-only/preview — it never persists anything itself
 * (docs/architecture/integration-contracts.md §3).
 */
export function AddressLookupForm({ onSaved }: AddressLookupFormProps) {
  const addressId = useId();
  const nameId = useId();
  const rowIdBase = useId();

  const [address, setAddress] = useState("");
  const [state, setState] = useState<LookupState>({ status: "idle" });
  const [buildingName, setBuildingName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isMounted = useIsMounted();

  const isLoading = state.status === "loading";

  async function runLookup(query: { address: string } | { bin: string }) {
    setState({ status: "loading" });
    try {
      const response = await lookupBuildingByAddress(query);
      if (!isMounted()) return;

      if (response.reason === "ambiguous_match") {
        setState({ status: "ambiguous", matches: response.matches ?? [] });
        return;
      }
      if (
        response.reason === "address_not_found" ||
        response.reason === "no_devices_on_file" ||
        response.reason === "upstream_unavailable"
      ) {
        setState({ status: "fallback", reason: response.reason });
        return;
      }
      if (response.match) {
        setState({
          status: "review",
          match: response.match,
          rows: draftsToRows(response.drafts),
        });
        return;
      }
      // Contract violation guard: reason "null" (success) implies a match is
      // always present. Treat an unexpected empty success as a generic error
      // rather than silently rendering a broken review screen.
      logError("Address lookup returned no reason and no match", response);
      setState({ status: "error" });
    } catch (error) {
      logError("Failed to look up address", error);
      if (!isMounted()) return;
      setState({ status: "error" });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runLookup({ address });
  }

  async function handleChooseMatch(candidate: Candidate) {
    await runLookup({ bin: candidate.bin });
  }

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setState((current) => {
      if (current.status !== "review") return current;
      return {
        ...current,
        rows: current.rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
      };
    });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== "review") return;
    const { match, rows } = state;
    setSaving(true);
    setSaveError(null);
    try {
      const building = await createBuilding({
        name: buildingName,
        address: match.resolved_address,
      });
      for (const row of rows) {
        if (!row.included) continue;
        await createElevator({
          building: building.id,
          device_identifier: row.deviceIdentifier,
          inspection_type: row.inspectionType,
          last_inspection_date: row.lastInspectionDate,
        });
      }
      if (!isMounted()) return;
      onSaved(building);
      setState({ status: "idle" });
      setAddress("");
      setBuildingName("");
    } catch (error) {
      logError("Failed to save building from address lookup", error);
      if (!isMounted()) return;
      setSaveError("Could not save this building. Please try again.");
    } finally {
      if (isMounted()) setSaving(false);
    }
  }

  return (
    <div className={styles.form}>
      <h2>Look up an address</h2>
      <form aria-label="Look up building by address" onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor={addressId}>Street address</label>
          <input
            id={addressId}
            type="text"
            value={address}
            required
            onChange={(event) => setAddress(event.target.value)}
          />
        </div>
        <button type="submit" className={styles.primaryButton} disabled={isLoading}>
          Look up address
        </button>
      </form>

      {isLoading && (
        <p role="status" className={styles.hint}>
          Looking up address…
        </p>
      )}

      {state.status === "error" && (
        <p className={styles.errorBanner} role="alert">
          Could not look up that address. Please try again.
        </p>
      )}

      {state.status === "fallback" && (
        <p className={styles.hint} role="status">
          {FALLBACK_MESSAGES[state.reason]}
        </p>
      )}

      {state.status === "ambiguous" && (
        <div>
          <p className={styles.hint}>
            This address matches more than one building. Choose the correct one:
          </p>
          <ul className={styles.field}>
            {state.matches.map((candidate) => (
              <li key={candidate.bin}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => handleChooseMatch(candidate)}
                  disabled={isLoading}
                >
                  {candidate.resolved_address}, {candidate.borough}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.status === "review" && (
        <form aria-label="Review and save building" onSubmit={handleSave}>
          {saveError && (
            <div className={styles.errorBanner} role="alert">
              {saveError}
            </div>
          )}
          <p className={styles.hint}>
            Matched {state.match.resolved_address}, {state.match.borough}.
          </p>
          <div className={styles.field}>
            <label htmlFor={nameId}>Building name</label>
            <input
              id={nameId}
              type="text"
              value={buildingName}
              required
              onChange={(event) => setBuildingName(event.target.value)}
            />
          </div>

          {state.rows.length === 0 && (
            <p className={styles.hint}>
              No elevator devices were found on file for this building. You can still save the
              building and add elevators manually.
            </p>
          )}

          {state.rows.map((row, index) => {
            const includeId = `${rowIdBase}-include-${index}`;
            const deviceIdFieldId = `${rowIdBase}-device-${index}`;
            const typeFieldId = `${rowIdBase}-type-${index}`;
            const dateFieldId = `${rowIdBase}-date-${index}`;
            return (
              <fieldset className={styles.field} key={row.key}>
                <legend>Elevator {index + 1}</legend>
                <div className={styles.field}>
                  <label htmlFor={includeId}>Include this elevator</label>
                  <input
                    id={includeId}
                    type="checkbox"
                    checked={row.included}
                    onChange={(event) => updateRow(row.key, { included: event.target.checked })}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor={deviceIdFieldId}>Device identifier</label>
                  <input
                    id={deviceIdFieldId}
                    type="text"
                    value={row.deviceIdentifier}
                    disabled={!row.included}
                    required={row.included}
                    onChange={(event) =>
                      updateRow(row.key, { deviceIdentifier: event.target.value })
                    }
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor={typeFieldId}>Inspection type</label>
                  <select
                    id={typeFieldId}
                    value={row.inspectionType}
                    disabled={!row.included}
                    onChange={(event) =>
                      updateRow(row.key, { inspectionType: event.target.value as InspectionType })
                    }
                  >
                    <option value="CAT1">CAT1 (annual)</option>
                    <option value="CAT5">CAT5 (five-year)</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor={dateFieldId}>Last inspection date</label>
                  <input
                    id={dateFieldId}
                    type="date"
                    value={row.lastInspectionDate}
                    disabled={!row.included}
                    required={row.included}
                    onChange={(event) =>
                      updateRow(row.key, { lastInspectionDate: event.target.value })
                    }
                  />
                </div>
              </fieldset>
            );
          })}

          <button type="submit" className={styles.primaryButton} disabled={saving || !buildingName}>
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      )}
    </div>
  );
}
