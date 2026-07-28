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
    render(<EmptyState onSeeded={vi.fn()} />);
    expect(
      screen.getByRole("heading", { level: 3, name: /no elevators yet/i }),
    ).toBeInTheDocument();
  });

  it("gives explicit, actionable instructions rather than a bare 'no data' message", () => {
    render(<EmptyState onSeeded={vi.fn()} />);
    // Points at the address-lookup fast start first, with the manual forms
    // rendered above the ledger as the fallback path.
    expect(screen.getByText(/look up your first building by address/i)).toBeInTheDocument();

    const steps = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(steps.some((text) => /look up an address/i.test(text ?? ""))).toBe(true);
    expect(steps.some((text) => /add a building/i.test(text ?? ""))).toBe(true);
    expect(steps.some((text) => /add an elevator/i.test(text ?? ""))).toBe(true);
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(<EmptyState onSeeded={vi.fn()} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("seeds demo data and notifies the parent on success", async () => {
    const response: SeedDemoDataResponse = { buildings_created: 7, elevators_created: 27 };
    const seedSpy = vi.spyOn(client, "seedDemoData").mockResolvedValue(response);
    const onSeeded = vi.fn();
    const user = userEvent.setup();

    render(<EmptyState onSeeded={onSeeded} />);

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

    render(<EmptyState onSeeded={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /try sample data/i }));

    expect(screen.getByRole("button", { name: /adding sample data/i })).toBeDisabled();

    resolveSeed({ buildings_created: 7, elevators_created: 27 });
  });

  it("shows an error message when the seed request fails", async () => {
    const error = new Error("boom");
    vi.spyOn(client, "seedDemoData").mockRejectedValue(error);
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    const user = userEvent.setup();

    render(<EmptyState onSeeded={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /try sample data/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load sample data/i);
    expect(logErrorSpy).toHaveBeenCalledWith("Failed to seed demo data", error);
  });
});
