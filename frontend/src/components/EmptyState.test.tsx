import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { EmptyState } from "./EmptyState";
import * as client from "../api/client";
import * as logger from "../lib/logger";
import type { SeedDemoDataResponse } from "../types/domain";

describe("EmptyState", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a level-3 heading so it nests correctly under the page's h2", () => {
    render(<EmptyState onSeeded={vi.fn()} onNavigateToPortfolio={vi.fn()} />);
    expect(
      screen.getByRole("heading", { level: 3, name: /no elevators yet/i }),
    ).toBeInTheDocument();
  });

  it("gives explicit, actionable instructions rather than a bare 'no data' message", () => {
    render(<EmptyState onSeeded={vi.fn()} onNavigateToPortfolio={vi.fn()} />);
    // Points at the address-lookup fast start first, with the manual forms
    // rendered above the ledger as the fallback path.
    expect(screen.getByText(/look up your first building by address/i)).toBeInTheDocument();

    const steps = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(steps.some((text) => /look up an address/i.test(text ?? ""))).toBe(true);
    expect(steps.some((text) => /add a building/i.test(text ?? ""))).toBe(true);
    expect(steps.some((text) => /add an elevator/i.test(text ?? ""))).toBe(true);
  });

  it("has no axe accessibility violations in the idle state", async () => {
    const { container } = render(<EmptyState onSeeded={vi.fn()} onNavigateToPortfolio={vi.fn()} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe accessibility violations while seeding is in flight", async () => {
    vi.spyOn(client, "seedDemoData").mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    const { container } = render(<EmptyState onSeeded={vi.fn()} onNavigateToPortfolio={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /try sample data/i }));

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe accessibility violations after a failed seed request", async () => {
    vi.spyOn(client, "seedDemoData").mockRejectedValue(new Error("boom"));
    vi.spyOn(logger, "logError").mockImplementation(() => {});
    const user = userEvent.setup();
    const { container } = render(<EmptyState onSeeded={vi.fn()} onNavigateToPortfolio={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /try sample data/i }));
    await screen.findByRole("alert");

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("signals the sample-data button as an alternative, faster path rather than a fourth numbered step", () => {
    render(<EmptyState onSeeded={vi.fn()} onNavigateToPortfolio={vi.fn()} />);
    // The three numbered steps are the primary path; the sample-data button
    // is called out as a shortcut, not appended as an equal-weight 4th step.
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(/skip ahead/i)).toBeInTheDocument();
  });

  it("seeds demo data and notifies the parent on success", async () => {
    const response: SeedDemoDataResponse = { buildings_created: 7, elevators_created: 27 };
    const seedSpy = vi.spyOn(client, "seedDemoData").mockResolvedValue(response);
    const onSeeded = vi.fn();
    const user = userEvent.setup();

    render(<EmptyState onSeeded={onSeeded} onNavigateToPortfolio={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /try sample data/i }));

    expect(seedSpy).toHaveBeenCalled();
    await vi.waitFor(() => expect(onSeeded).toHaveBeenCalled());
  });

  it("shows loading text while the seed request is in flight", async () => {
    let resolveSeed: (value: SeedDemoDataResponse) => void = () => {};
    vi.spyOn(client, "seedDemoData").mockReturnValue(
      new Promise((resolve) => {
        resolveSeed = resolve;
      }),
    );
    const user = userEvent.setup();

    render(<EmptyState onSeeded={vi.fn()} onNavigateToPortfolio={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /try sample data/i }));

    const button = screen.getByRole("button", { name: /adding sample data/i });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("aria-busy", "true");

    resolveSeed({ buildings_created: 7, elevators_created: 27 });
  });

  it("marks the button busy/disabled via ARIA rather than the native disabled attribute, so a keyboard/screen-reader user's focus isn't silently stranded on body mid-request", async () => {
    vi.spyOn(client, "seedDemoData").mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();

    render(<EmptyState onSeeded={vi.fn()} onNavigateToPortfolio={vi.fn()} />);

    const button = screen.getByRole("button", { name: /try sample data/i });
    await user.click(button);

    const busyButton = screen.getByRole("button", { name: /adding sample data/i });
    // Native `disabled` removes a focused element from the focusable set,
    // which browsers respond to by moving focus to <body> — invisible to a
    // sighted user but a jarring, silent context loss for anyone tabbing or
    // using a screen reader. aria-disabled + a click-time guard keeps the
    // control focusable while still preventing a duplicate submit.
    expect(busyButton).not.toBeDisabled();
    expect(document.activeElement).toBe(busyButton);
  });

  it("announces the seeded counts in a status region, so a screen-reader user gets an equivalent signal to the ledger visibly repopulating", async () => {
    const response: SeedDemoDataResponse = { buildings_created: 7, elevators_created: 27 };
    vi.spyOn(client, "seedDemoData").mockResolvedValue(response);
    const user = userEvent.setup();

    render(<EmptyState onSeeded={vi.fn()} onNavigateToPortfolio={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /try sample data/i }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/7 buildings/i);
    expect(status).toHaveTextContent(/27 elevators/i);
  });

  it("uses singular grammar in the status announcement when exactly one building/elevator was created", async () => {
    const response: SeedDemoDataResponse = { buildings_created: 1, elevators_created: 1 };
    vi.spyOn(client, "seedDemoData").mockResolvedValue(response);
    const user = userEvent.setup();

    render(<EmptyState onSeeded={vi.fn()} onNavigateToPortfolio={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /try sample data/i }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/1 building and 1 elevator\b/i);
  });

  it("shows an error message when the seed request fails", async () => {
    const error = new Error("boom");
    vi.spyOn(client, "seedDemoData").mockRejectedValue(error);
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    const user = userEvent.setup();

    render(<EmptyState onSeeded={vi.fn()} onNavigateToPortfolio={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /try sample data/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load sample data/i);
    expect(logErrorSpy).toHaveBeenCalledWith("Failed to seed demo data", error);
  });

  it("calls onNavigateToPortfolio when the 'Go to Manage Portfolio' button is clicked", async () => {
    const onNavigateToPortfolio = vi.fn();
    const user = userEvent.setup();

    render(<EmptyState onSeeded={vi.fn()} onNavigateToPortfolio={onNavigateToPortfolio} />);

    await user.click(screen.getByRole("button", { name: /go to manage portfolio/i }));

    expect(onNavigateToPortfolio).toHaveBeenCalledTimes(1);
  });
});
