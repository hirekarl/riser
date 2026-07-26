import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { NarrationPanel } from "./NarrationPanel";
import * as client from "../../api/client";
import type { NarrationResponse } from "../../types/domain";

describe("NarrationPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the trigger button and no narration text before it's clicked", () => {
    render(<NarrationPanel />);

    expect(screen.getByRole("button", { name: /generate briefing/i })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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

  it("shows an inline error message on failure without crashing", async () => {
    vi.spyOn(client, "fetchNarration").mockRejectedValue(new Error("boom"));
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
    const user = userEvent.setup();

    render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /generate briefing/i }));
    await screen.findByText(/all clear/i);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
