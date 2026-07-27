import { useId, useState } from "react";
import type { FormEvent } from "react";
import { lookupBuildingByAddress } from "../../api/client";
import { logError } from "../../lib/logger";
import { useIsMounted } from "../narration/useIsMounted";
import type { AddressLookupResponse } from "../../types/domain";
import styles from "./AddressLookupForm.module.css";

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; response: AddressLookupResponse }
  | { status: "error" };

/**
 * Form shell for POST /api/buildings/lookup/ (docs/architecture/integration-contracts.md
 * §3). Scope is deliberately narrow for now (Mon 2026-07-27): take an
 * address, call the lookup, and render a read-only preview of what DOB has
 * on file. It does not save anything — wiring this into
 * `createBuilding`/`createElevator` plus a review/override-before-saving
 * flow is tomorrow's work, on top of this shell.
 *
 * IMPORTANT: the DOB Building Identification Number (`match.bin`) must never
 * be rendered here. Property managers work by address, not BIN — BIN
 * resolution happens invisibly on the backend (see
 * docs/sprints/day-by-day-plan.md). The response includes `bin` only so the
 * save flow (tomorrow) can persist it; this component intentionally never
 * reads that field.
 */
export function AddressLookupForm() {
  const addressId = useId();
  const [address, setAddress] = useState("");
  const [state, setState] = useState<LookupState>({ status: "idle" });
  const isMounted = useIsMounted();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "loading" });
    try {
      const response = await lookupBuildingByAddress(address);
      if (!isMounted()) return;
      setState({ status: "success", response });
    } catch (error) {
      logError("Address lookup failed", error);
      if (!isMounted()) return;
      setState({ status: "error" });
    }
  }

  const isLoading = state.status === "loading";

  return (
    <form className={styles.form} onSubmit={handleSubmit} aria-label="Look up a building">
      <h2>Look up a building by address</h2>
      <p className={styles.hint}>
        Enter an address to check DOB records for elevator devices at that building.
      </p>

      <div className={styles.field}>
        <label htmlFor={addressId}>Address</label>
        <input
          id={addressId}
          type="text"
          value={address}
          required
          disabled={isLoading}
          onChange={(event) => setAddress(event.target.value)}
        />
      </div>

      <button type="submit" className={styles.primaryButton} disabled={isLoading}>
        {isLoading ? "Looking up…" : "Look up address"}
      </button>

      {isLoading && (
        <p role="status" className={styles.loading}>
          Looking up address…
        </p>
      )}

      {state.status === "success" && <LookupResult response={state.response} />}

      {state.status === "error" && (
        <p className={styles.errorBanner} role="alert">
          Could not look up that address. Please try again.
        </p>
      )}
    </form>
  );
}

function LookupResult({ response }: { response: AddressLookupResponse }) {
  const { match, devices, reason } = response;

  if (match && devices.length > 0 && reason === null) {
    return (
      <div className={styles.result}>
        <p>
          Found a match: {match.resolved_address} ({match.borough}).
        </p>
        <p className={styles.previewNote}>
          Preview only — nothing has been saved yet. You&apos;ll be able to review and adjust these
          devices before saving.
        </p>
        <ul className={styles.deviceList}>
          {devices.map((device) => (
            <li key={device.device_number} className={styles.deviceItem}>
              <span>
                Device {device.device_number} — {device.device_status}
              </span>
              {device.cat1_latest_report_filed && (
                <span>CAT1 last filed: {device.cat1_latest_report_filed}</span>
              )}
              {device.cat5_latest_report_filed && (
                <span>CAT5 last filed: {device.cat5_latest_report_filed}</span>
              )}
              {device.periodic_latest_inspection && (
                <span>Periodic inspection last filed: {device.periodic_latest_inspection}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (match && reason === "no_devices_on_file") {
    return (
      <div className={styles.result}>
        <p>
          Found a match: {match.resolved_address} ({match.borough}) — but DOB has no elevator
          devices on file for this address.
        </p>
        <p className={styles.hint}>
          Add a building or add an elevator manually using the forms on this page.
        </p>
      </div>
    );
  }

  if (reason === "address_not_found") {
    return (
      <div className={styles.result}>
        <p>That address was not found in DOB&apos;s records.</p>
        <p className={styles.hint}>
          Add a building or add an elevator manually using the forms on this page.
        </p>
      </div>
    );
  }

  // reason === "upstream_unavailable" (the only remaining documented shape).
  return (
    <div className={styles.result}>
      <p>
        The address lookup service is temporarily unavailable right now — please try again shortly.
      </p>
      <p className={styles.hint}>
        In the meantime, add a building or add an elevator manually using the forms on this page.
      </p>
    </div>
  );
}
