import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { StatusBadge } from "./StatusBadge";
import * as logger from "../lib/logger";
import type { ComplianceStatus } from "../types/domain";

describe("StatusBadge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("falls back to an 'unknown' badge instead of throwing when given an unrecognized status", () => {
    const logWarnSpy = vi.spyOn(logger, "logWarn").mockImplementation(() => {});
    const badStatus = "Bogus" as ComplianceStatus;

    expect(() => render(<StatusBadge status={badStatus} />)).not.toThrow();

    const badge = screen.getByText("Bogus");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/unknown/);
    expect(logWarnSpy).toHaveBeenCalledWith("Unrecognized compliance status", {
      status: badStatus,
    });
  });

  it("gives the 'unknown' fallback a distinct icon (not reused from any real status) and a class distinct from the three real statuses", () => {
    vi.spyOn(logger, "logWarn").mockImplementation(() => {});
    const badStatus = "Bogus" as ComplianceStatus;

    const { container } = render(<StatusBadge status={badStatus} />);

    const icon = container.querySelector('[aria-hidden="true"]');
    expect(icon).toHaveTextContent("?");
    expect(["✓", "⚠", "✕"]).not.toContain(icon?.textContent);

    const badge = screen.getByText("Bogus");
    expect(badge.className).toMatch(/unknown/);
    expect(badge.className).not.toMatch(/compliant|warning|delinquent/);
  });

  it("has no axe accessibility violations when rendering the 'unknown' fallback badge", async () => {
    vi.spyOn(logger, "logWarn").mockImplementation(() => {});
    const badStatus = "Bogus" as ComplianceStatus;

    const { container } = render(<StatusBadge status={badStatus} />);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
