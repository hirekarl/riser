import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders compliant status with the compliant text and styling class", () => {
    render(<StatusBadge status="Compliant" />);
    const badge = screen.getByText(/compliant/i);
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/compliant/);
  });

  it("renders warning status with the warning text and styling class", () => {
    render(<StatusBadge status="Warning" />);
    const badge = screen.getByText(/warning/i);
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/warning/);
  });

  it("renders delinquent status with the delinquent text and styling class", () => {
    render(<StatusBadge status="Delinquent" />);
    const badge = screen.getByText(/delinquent/i);
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/delinquent/);
  });

  it("pairs color with text/icon rather than color alone (WCAG 1.4.1)", () => {
    const { container } = render(<StatusBadge status="Delinquent" />);
    // The status must be conveyed via visible text, not only via a CSS class/color.
    expect(container.textContent).toMatch(/delinquent/i);
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(<StatusBadge status="Warning" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
