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
 * This is the functional shell only (trigger, loading state, success/error
 * rendering) — visual/placement polish is a follow-up pass
 * (ui-ux-specialist-agent), per docs/sprints/day-by-day-plan.md.
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
      <button type="button" onClick={handleGenerate} disabled={isLoading}>
        {isLoading ? "Generating briefing…" : "Generate briefing"}
      </button>

      {isLoading && <p role="status">Generating briefing…</p>}

      {state.status === "success" && <p className={styles.narration}>{state.narration}</p>}

      {state.status === "error" && (
        <p className={styles.errorMessage} role="alert">
          Could not generate the briefing. Please try again.
        </p>
      )}
    </section>
  );
}
