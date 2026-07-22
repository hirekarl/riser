import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders a level-3 heading so it nests correctly under the page's h2", () => {
    render(<EmptyState />);
    expect(
      screen.getByRole("heading", { level: 3, name: /no elevators yet/i }),
    ).toBeInTheDocument();
  });

  it("gives explicit, actionable instructions rather than a bare 'no data' message", () => {
    render(<EmptyState />);
    // Points at the actually-working fast start: the forms rendered above the ledger.
    expect(screen.getByText(/add your first building/i)).toBeInTheDocument();

    const steps = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(steps.some((text) => /add a building/i.test(text ?? ""))).toBe(true);
    expect(steps.some((text) => /add an elevator/i.test(text ?? ""))).toBe(true);
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(<EmptyState />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
