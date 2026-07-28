import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { PortfolioReset } from "./PortfolioReset";
import * as client from "../api/client";
import * as logger from "../lib/logger";
import type { ResetPortfolioResponse } from "../types/domain";

const CONFIRM_STRING = "RESET";

describe("PortfolioReset", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows only the low-emphasis reset button initially, with no confirmation UI", () => {
    render(<PortfolioReset onReset={vi.fn()} />);
    expect(screen.getByRole("button", { name: /reset portfolio/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/type.*reset/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirm reset/i })).not.toBeInTheDocument();
  });

  it("reveals an inline typed-confirmation step when the reset button is clicked", async () => {
    const user = userEvent.setup();
    render(<PortfolioReset onReset={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /reset portfolio/i }));

    expect(screen.getByLabelText(new RegExp(CONFIRM_STRING, "i"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm reset/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("keeps the confirm button disabled until the exact confirmation string is typed", async () => {
    const user = userEvent.setup();
    render(<PortfolioReset onReset={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /reset portfolio/i }));
    const confirmButton = screen.getByRole("button", { name: /confirm reset/i });
    const input = screen.getByLabelText(new RegExp(CONFIRM_STRING, "i"));

    expect(confirmButton).toBeDisabled();

    await user.type(input, "reset");
    expect(confirmButton).toBeDisabled();

    await user.clear(input);
    await user.type(input, CONFIRM_STRING);
    expect(confirmButton).not.toBeDisabled();
  });

  it("cancels out of the confirmation step without calling the API", async () => {
    const resetSpy = vi.spyOn(client, "resetPortfolio").mockResolvedValue({
      buildings_deleted: 3,
      elevators_deleted: 9,
    });
    const onReset = vi.fn();
    const user = userEvent.setup();
    render(<PortfolioReset onReset={onReset} />);

    await user.click(screen.getByRole("button", { name: /reset portfolio/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByRole("button", { name: /reset portfolio/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirm reset/i })).not.toBeInTheDocument();
    expect(resetSpy).not.toHaveBeenCalled();
    expect(onReset).not.toHaveBeenCalled();
  });

  it("resets the portfolio and notifies the parent on success, showing the counts", async () => {
    const response: ResetPortfolioResponse = { buildings_deleted: 6, elevators_deleted: 40 };
    const resetSpy = vi.spyOn(client, "resetPortfolio").mockResolvedValue(response);
    const onReset = vi.fn();
    const user = userEvent.setup();
    render(<PortfolioReset onReset={onReset} />);

    await user.click(screen.getByRole("button", { name: /reset portfolio/i }));
    await user.type(screen.getByLabelText(new RegExp(CONFIRM_STRING, "i")), CONFIRM_STRING);
    await user.click(screen.getByRole("button", { name: /confirm reset/i }));

    expect(resetSpy).toHaveBeenCalled();
    await vi.waitFor(() => expect(onReset).toHaveBeenCalled());

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/6 buildings/i);
    expect(status).toHaveTextContent(/40 elevators/i);
  });

  it("shows loading state while the reset request is in flight", async () => {
    let resolveReset: (value: ResetPortfolioResponse) => void = () => {};
    vi.spyOn(client, "resetPortfolio").mockReturnValue(
      new Promise((resolve) => {
        resolveReset = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<PortfolioReset onReset={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /reset portfolio/i }));
    await user.type(screen.getByLabelText(new RegExp(CONFIRM_STRING, "i")), CONFIRM_STRING);
    await user.click(screen.getByRole("button", { name: /confirm reset/i }));

    const busyButton = screen.getByRole("button", { name: /resetting/i });
    expect(busyButton).toBeInTheDocument();

    resolveReset({ buildings_deleted: 1, elevators_deleted: 1 });
  });

  it("shows an error message when the reset request fails", async () => {
    const error = new Error("boom");
    vi.spyOn(client, "resetPortfolio").mockRejectedValue(error);
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<PortfolioReset onReset={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /reset portfolio/i }));
    await user.type(screen.getByLabelText(new RegExp(CONFIRM_STRING, "i")), CONFIRM_STRING);
    await user.click(screen.getByRole("button", { name: /confirm reset/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reset/i);
    expect(logErrorSpy).toHaveBeenCalledWith("Failed to reset portfolio", error);
  });

  it("has no axe accessibility violations in the idle state", async () => {
    const { container } = render(<PortfolioReset onReset={vi.fn()} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe accessibility violations in the confirmation state", async () => {
    const user = userEvent.setup();
    const { container } = render(<PortfolioReset onReset={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /reset portfolio/i }));

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
