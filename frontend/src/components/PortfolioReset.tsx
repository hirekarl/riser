import { useId, useState } from "react";
import { resetPortfolio } from "../api/client";
import { logError } from "../lib/logger";
import styles from "./PortfolioReset.module.css";

const CONFIRMATION_STRING = "RESET";

export interface PortfolioResetProps {
  /**
   * Called after a successful portfolio-wide reset via
   * POST /api/demo-data/reset/, so a parent (e.g. `App`) can trigger the
   * same buildings/ledger refetch it uses after any other mutation (mirrors
   * `EmptyState`'s `onSeeded` prop).
   */
  onReset: () => void;
}

/**
 * Low-emphasis "Reset portfolio" control gated by a typed confirmation,
 * since this wipes the entire portfolio (all buildings and elevators)
 * unconditionally — a stronger safeguard than the single-item inline
 * Confirm delete/Cancel pattern used elsewhere (LedgerPage, BuildingList),
 * since a stray click here can't be undone and affects everything, not one
 * row. Still avoids a native `window.confirm()` dialog, matching this
 * codebase's existing convention of rendering confirmation UI inline in JSX.
 */
export function PortfolioReset({ onReset }: PortfolioResetProps) {
  const [confirming, setConfirming] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const confirmationInputId = useId();

  function handleResetRequest() {
    setConfirming(true);
    setResetError(null);
    setResetSuccessMessage(null);
    setConfirmationText("");
  }

  function handleCancel() {
    setConfirming(false);
    setConfirmationText("");
    setResetError(null);
  }

  async function handleConfirm() {
    // Guards against a second activation landing while a request is already
    // in flight, same rationale as EmptyState's handleSeedClick guard.
    if (resetting || confirmationText !== CONFIRMATION_STRING) return;
    setResetting(true);
    setResetError(null);
    try {
      const result = await resetPortfolio();
      const buildingWord = result.buildings_deleted === 1 ? "building" : "buildings";
      const elevatorWord = result.elevators_deleted === 1 ? "elevator" : "elevators";
      setResetSuccessMessage(
        `Removed ${result.buildings_deleted} ${buildingWord} and ${result.elevators_deleted} ${elevatorWord}.`,
      );
      setConfirming(false);
      setConfirmationText("");
      onReset();
    } catch (err) {
      logError("Failed to reset portfolio", err);
      setResetError("Could not reset the portfolio. Please try again.");
    } finally {
      setResetting(false);
    }
  }

  const isConfirmEnabled = confirmationText === CONFIRMATION_STRING && !resetting;

  return (
    <div className={styles.wrapper}>
      {!confirming ? (
        <button type="button" className={styles.resetButton} onClick={handleResetRequest}>
          Reset portfolio
        </button>
      ) : (
        <div className={styles.confirmGroup}>
          <p className={styles.warning}>
            This permanently deletes every building and elevator in your portfolio. Type{" "}
            <strong>{CONFIRMATION_STRING}</strong> to confirm.
          </p>
          <label className={styles.label} htmlFor={confirmationInputId}>
            Type {CONFIRMATION_STRING} to confirm
          </label>
          <input
            id={confirmationInputId}
            type="text"
            className={styles.input}
            value={confirmationText}
            aria-disabled={resetting}
            onChange={(event) => setConfirmationText(event.target.value)}
          />
          <span className={styles.actions}>
            <button
              type="button"
              className={styles.confirmButton}
              disabled={!isConfirmEnabled}
              aria-busy={resetting}
              onClick={() => {
                void handleConfirm();
              }}
            >
              {resetting ? "Resetting…" : "Confirm reset"}
            </button>
            <button
              type="button"
              className={styles.cancelButton}
              disabled={resetting}
              onClick={handleCancel}
            >
              Cancel
            </button>
          </span>
        </div>
      )}
      {resetError && (
        <div className={styles.errorBanner} role="alert">
          {resetError}
        </div>
      )}
      <p className={styles.successMessage} role="status">
        {resetSuccessMessage}
      </p>
    </div>
  );
}
