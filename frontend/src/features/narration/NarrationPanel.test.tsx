import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { NarrationPanel } from "./NarrationPanel";
import { useIsMounted } from "./useIsMounted";
import * as client from "../../api/client";
import * as logger from "../../lib/logger";
import type { NarrationResponse } from "../../types/domain";

// Mocked so the "unmounted mid-request" test below can force isMounted() to
// report false without literally unmounting — see that test for why: React
// 18+ silently no-ops a setState call on an unmounted component (no
// console warning, no crash), so asserting against a literal `unmount()`
// can't actually distinguish guarded from unguarded code in this React
// version. Defaults to "always mounted" so every other test below behaves
// like the real hook.
vi.mock("./useIsMounted", () => ({
  useIsMounted: vi.fn(() => () => true),
}));

describe("NarrationPanel", () => {
  beforeEach(() => {
    vi.mocked(useIsMounted).mockReturnValue(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the trigger button and no narration text before it's clicked", () => {
    render(<NarrationPanel />);

    expect(screen.getByRole("button", { name: /generate briefing/i })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the AI briefing heading, attributed to Claude, in every state", () => {
    render(<NarrationPanel />);

    const heading = screen.getByRole("heading", { name: /ai portfolio briefing/i });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText(/powered by claude/i)).toBeInTheDocument();
  });

  it("shows a loading state (disabled button, role=status) while the request is pending", async () => {
    let resolveNarration: (value: NarrationResponse) => void = () => {};
    const pending = new Promise<NarrationResponse>((resolve) => {
      resolveNarration = resolve;
    });
    vi.spyOn(client, "fetchNarration").mockReturnValue(pending);
    const user = userEvent.setup();

    render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();

    resolveNarration({ narration: "All good.", generated_at: "2026-07-25T00:00:00Z" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /generate briefing/i })).toBeEnabled(),
    );
  });

  it("renders the narration text on success", async () => {
    vi.spyOn(client, "fetchNarration").mockResolvedValue({
      narration: "Two elevators are delinquent and need attention this week.",
      generated_at: "2026-07-25T00:00:00Z",
    });
    const user = userEvent.setup();

    render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));

    expect(
      await screen.findByText(/two elevators are delinquent and need attention this week/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces generated_at as a readable timestamp on success", async () => {
    vi.spyOn(client, "fetchNarration").mockResolvedValue({
      narration: "All clear.",
      generated_at: "2026-07-25T14:32:00Z",
    });
    const user = userEvent.setup();

    render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));
    await screen.findByText(/all clear/i);

    const timeEl = document.querySelector("time");
    expect(timeEl).not.toBeNull();
    expect(timeEl).toHaveAttribute("dateTime", "2026-07-25T14:32:00Z");
    expect(timeEl?.textContent).not.toBe("");
  });

  it("has exactly one loading announcement, not a duplicate on the button and a status region", async () => {
    let resolveNarration: (value: NarrationResponse) => void = () => {};
    const pending = new Promise<NarrationResponse>((resolve) => {
      resolveNarration = resolve;
    });
    vi.spyOn(client, "fetchNarration").mockReturnValue(pending);
    const user = userEvent.setup();

    render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));

    // The button's own accessible name should stay constant; only the
    // role="status" region should announce the loading text, so screen
    // readers don't hear it twice.
    expect(screen.getByRole("button", { name: /generate briefing/i })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/generating briefing/i);

    resolveNarration({ narration: "All good.", generated_at: "2026-07-25T00:00:00Z" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /generate briefing/i })).toBeEnabled(),
    );
  });

  it("shows an inline error message on failure without crashing", async () => {
    vi.spyOn(client, "fetchNarration").mockRejectedValue(new Error("boom"));
    // The catch block now logs the swallowed error via logError (see the
    // "logs the underlying error" test below) — mock it here too so this
    // test's console output stays clean, matching the pattern already used
    // in LedgerPage.test.tsx for the same reason.
    vi.spyOn(logger, "logError").mockImplementation(() => {});
    const user = userEvent.setup();

    render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not generate/i);
    expect(screen.getByRole("button", { name: /generate briefing/i })).toBeEnabled();
  });

  it("allows retrying after a failure, clearing the previous error", async () => {
    vi.spyOn(client, "fetchNarration")
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ narration: "All clear.", generated_at: "2026-07-25T00:00:00Z" });
    vi.spyOn(logger, "logError").mockImplementation(() => {});
    const user = userEvent.setup();

    render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /generate briefing/i }));
    await screen.findByText(/all clear/i);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("logs the underlying error for debugging while keeping the same generic user-facing message", async () => {
    const specificError = new Error("Anthropic API request timed out");
    vi.spyOn(client, "fetchNarration").mockRejectedValue(specificError);
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    const user = userEvent.setup();

    render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));

    // User-facing copy stays the same generic message...
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not generate the briefing. Please try again.",
    );
    // ...while the actual error is logged for developers/production logs,
    // rather than silently discarded.
    expect(logErrorSpy).toHaveBeenCalledWith(
      "Failed to generate portfolio briefing",
      specificError,
    );
  });

  it("does not move past the loading state once the component has unmounted mid-request", async () => {
    // React 18+ silently no-ops a setState call made after a component has
    // unmounted (no console warning, no crash either way — see
    // https://github.com/facebook/react/pull/22114), so a literal
    // `unmount()` here can't actually distinguish guarded from unguarded
    // code. Instead, force the mocked `useIsMounted` to report "unmounted"
    // partway through the request, which is exactly the condition the real
    // guard checks for before calling setState.
    vi.spyOn(client, "fetchNarration").mockResolvedValue({
      narration: "All clear now.",
      generated_at: "2026-07-25T00:00:00Z",
    });
    vi.mocked(useIsMounted).mockReturnValue(() => false);
    const user = userEvent.setup();

    render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));

    // Give the already-resolved fetch's microtask a tick to run.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText(/all clear now/i)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("does not surface a stale error once the component has unmounted mid-request", async () => {
    vi.spyOn(client, "fetchNarration").mockRejectedValue(new Error("boom"));
    vi.spyOn(logger, "logError").mockImplementation(() => {});
    vi.mocked(useIsMounted).mockReturnValue(() => false);
    const user = userEvent.setup();

    render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has no axe accessibility violations in its initial state", async () => {
    const { container } = render(<NarrationPanel />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe accessibility violations once narration is rendered", async () => {
    vi.spyOn(client, "fetchNarration").mockResolvedValue({
      narration: "All clear this week.",
      generated_at: "2026-07-25T00:00:00Z",
    });
    const user = userEvent.setup();

    const { container } = render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));
    await screen.findByText(/all clear this week/i);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
