import { useState } from "react";
import { fetchNarration } from "../../api/client";
import { Spinner } from "../../components/Spinner";
import { logError } from "../../lib/logger";
import { useIsMounted } from "./useIsMounted";
import styles from "./NarrationPanel.module.css";

type PanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; narration: string; generatedAt: string }
  | { status: "error" };

interface NarrationSegment {
  label: string | null;
  body: string;
}

// A leading "Word Word:" prefix (1-4 capitalized words, e.g. "Attention
// Required:", "Action Recommended:") — matches the two-line structure the v3
// design mockup shows for the AI narration, without hardcoding those exact
// two labels: the real model output's wording isn't guaranteed to match the
// mockup's placeholder text verbatim.
const LABEL_LINE = /^([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+){0,3}:)\s*([\s\S]*)$/;
const INLINE_LABEL = /(?:^|\s)([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+){0,3}:)/g;

/**
 * Splits a narration string into one segment per detected "Label: body"
 * line, so each can be rendered as its own paragraph with only the label
 * bolded — rather than the whole response as one undifferentiated block.
 * Falls back to a single unlabeled segment (rendered as plain body text,
 * not bold) when no label structure is present at all, which is still
 * strictly more readable than forcing every response into bold.
 */
function splitNarration(text: string): NarrationSegment[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const lines = trimmed.split(/\n+/).filter((line) => line.trim().length > 0);
  const rawSegments = lines.length > 1 ? lines : splitByInlineLabels(trimmed);

  return rawSegments.map((segment) => {
    const match = segment.match(LABEL_LINE);
    return match ? { label: match[1], body: match[2] } : { label: null, body: segment };
  });
}

/** Splits a single unbroken string on 2+ inline "Label:" occurrences (e.g. a
 * model response that ran both lines together without a newline between
 * them). Returns the original text as a single segment when fewer than two
 * labels are found — one match alone isn't enough to safely infer where a
 * second segment would start. */
function splitByInlineLabels(text: string): string[] {
  const matches = [...text.matchAll(INLINE_LABEL)];
  if (matches.length < 2) return [text];

  return matches.map((match, index) => {
    const start = match.index! + (match[0].startsWith(" ") ? 1 : 0);
    const end = index + 1 < matches.length ? matches[index + 1].index! : text.length;
    return text.slice(start, end).trim();
  });
}

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
  const isMounted = useIsMounted();

  async function handleGenerate() {
    setState({ status: "loading" });
    try {
      const response = await fetchNarration();
      if (!isMounted()) return;
      setState({
        status: "success",
        narration: response.narration,
        generatedAt: response.generated_at,
      });
    } catch (error) {
      logError("Failed to generate portfolio briefing", error);
      if (!isMounted()) return;
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
          AI Executive Briefing <span className={styles.poweredBy}>— Powered by Claude</span>
        </h2>
        <span className={styles.onDemandTag}>ON DEMAND</span>
      </div>

      <p className={styles.description}>
        Generate a plain-language summary of what needs attention across your portfolio, on request
        — this never runs on its own in the background.
      </p>

      <button
        type="button"
        className={styles.generateButton}
        onClick={handleGenerate}
        disabled={isLoading}
      >
        Generate briefing
      </button>

      {/* The single loading announcement lives here, not on the button label,
          so screen readers don't hear "generating" twice (issue #80). */}
      {isLoading && (
        <p role="status" className={styles.loading}>
          <Spinner /> Generating briefing…
        </p>
      )}

      {state.status === "success" && (
        <>
          <div className={styles.narration}>
            {splitNarration(state.narration).map((segment, index) => (
              <p key={index}>
                {segment.label && <strong>{segment.label} </strong>}
                {segment.body}
              </p>
            ))}
          </div>
          <p className={styles.timestamp}>
            Generated{" "}
            <time dateTime={state.generatedAt}>
              {new Date(state.generatedAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </time>
          </p>
        </>
      )}

      {state.status === "error" && (
        <p className={styles.errorMessage} role="alert">
          Could not generate the briefing. Please try again.
        </p>
      )}
    </section>
  );
}
