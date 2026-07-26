import { useState } from "react";
import { fetchNarration } from "../../api/client";
import styles from "./NarrationPanel.module.css";

type PanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; narration: string }
  | { status: "error" };

/**
 * On-demand panel that calls GET /api/ledger/narration/ and renders the
 * returned AI narration text. Strictly button-triggered — no auto-fetch or
 * polling, per docs/architecture/integration-contracts.md §5. Narration is
 * additive: a failed request shows an inline error without affecting the
 * rest of the app.
 *
 * Visual treatment matches the v3 design pass (docs/design/): a bordered
 * "AI Executive Briefing" card, deliberately labeled as on-demand rather
 * than a live/background feature, since that's what this component
 * actually does.
 */
export function NarrationPanel() {
  const [state, setState] = useState<PanelState>({ status: "idle" });

  async function handleGenerate() {
    setState({ status: "loading" });
    try {
      const response = await fetchNarration();
      setState({ status: "success", narration: response.narration });
    } catch {
      setState({ status: "error" });
    }
  }

  const isLoading = state.status === "loading";

  return (
    <section className={styles.panel} aria-label="AI portfolio briefing">
      <div className={styles.headerRow}>
        <span className={styles.icon} aria-hidden="true">
          ◈
        </span>
        <h2 className={styles.heading}>
          AI Portfolio Briefing <span className={styles.poweredBy}>— Powered by Claude</span>
        </h2>
        <span className={styles.onDemandTag}>ON DEMAND</span>
      </div>

      <p className={styles.description}>
        Generate a plain-language summary of what needs attention across your portfolio, on
        request — this never runs on its own in the background.
      </p>

      <button
        type="button"
        className={styles.generateButton}
        onClick={handleGenerate}
        disabled={isLoading}
      >
        {isLoading ? "Generating briefing…" : "Generate briefing"}
      </button>

      {isLoading && (
        <p role="status" className={styles.loading}>
          Generating briefing…
        </p>
      )}

      {state.status === "success" && <p className={styles.narration}>{state.narration}</p>}

      {state.status === "error" && (
        <p className={styles.errorMessage} role="alert">
          Could not generate the briefing. Please try again.
        </p>
      )}
    </section>
  );
}
