import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BuildingFineExposure, LedgerEntry } from "../../types/domain";
import { ExecutiveSummaryBand } from "./ExecutiveSummaryBand";

function makeEntry(overrides: Partial<LedgerEntry>): LedgerEntry {
  return {
    id: 1,
    device_identifier: "EL-1",
    inspection_type: "CAT1",
    last_inspection_date: "2025-01-01",
    dob_device_number: null,
    building_name: "Tower A",
    due_date: "2026-08-01",
    status: "Compliant",
    has_open_violation: false,
    ...overrides,
  };
}

describe("ExecutiveSummaryBand", () => {
  it("renders the portfolio buildings and active elevators counts", () => {
    const entries = [makeEntry({ id: 1 }), makeEntry({ id: 2 }), makeEntry({ id: 3 })];
    render(<ExecutiveSummaryBand entries={entries} buildingsCount={5} fineExposures={[]} />);

    expect(screen.getByText("Portfolio Buildings")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Active Elevators")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("counts delinquent and warning entries as at-risk", () => {
    const entries = [
      makeEntry({ id: 1, status: "Delinquent", due_date: "2026-01-01" }),
      makeEntry({ id: 2, status: "Warning", due_date: "2026-02-01" }),
      makeEntry({ id: 3, status: "Compliant", due_date: "2026-03-01" }),
    ];
    render(<ExecutiveSummaryBand entries={entries} buildingsCount={9} fineExposures={[]} />);

    expect(screen.getByText("At-Risk / Delinquent")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1 Delinquent, 1 Warning")).toBeInTheDocument();
  });

  it("colors the Next Inspection Due tile as overdue for the earliest Delinquent entry", () => {
    const entries = [
      makeEntry({ id: 1, status: "Delinquent", due_date: "2020-01-01" }),
      makeEntry({ id: 2, status: "Compliant", due_date: "2030-01-01" }),
    ];
    render(<ExecutiveSummaryBand entries={entries} buildingsCount={1} fineExposures={[]} />);

    const value = screen.getByText("2020-01-01");
    expect(value.className).toMatch(/dueOverdue/);
    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
  });

  it("colors the Next Inspection Due tile as soon for the earliest Warning entry", () => {
    const entries = [
      makeEntry({ id: 1, status: "Warning", due_date: "2026-08-10" }),
      makeEntry({ id: 2, status: "Compliant", due_date: "2030-01-01" }),
    ];
    render(<ExecutiveSummaryBand entries={entries} buildingsCount={1} fineExposures={[]} />);

    const value = screen.getByText("2026-08-10");
    expect(value.className).toMatch(/dueSoon/);
  });

  it("colors the Next Inspection Due tile as ok for the earliest Compliant entry", () => {
    const entries = [makeEntry({ id: 1, status: "Compliant", due_date: "2030-01-01" })];
    render(<ExecutiveSummaryBand entries={entries} buildingsCount={1} fineExposures={[]} />);

    const value = screen.getByText("2030-01-01");
    expect(value.className).toMatch(/dueOk/);
  });

  it("sums resolved fine exposure across buildings", () => {
    const fineExposures: BuildingFineExposure[] = [
      {
        building: 1,
        bin: "1000001",
        total_exposure: "1250.50",
        open_violation_count: 2,
        reason: null,
      },
      {
        building: 2,
        bin: "1000002",
        total_exposure: "500.00",
        open_violation_count: 1,
        reason: null,
      },
    ];
    render(<ExecutiveSummaryBand entries={[]} buildingsCount={2} fineExposures={fineExposures} />);

    expect(screen.getByText("DOB Penalty Exposure")).toBeInTheDocument();
    expect(screen.getByText("$1,751")).toBeInTheDocument();
  });

  it("surfaces an incomplete caveat rather than a silently-wrong total when a building's exposure has a non-null reason", () => {
    const fineExposures: BuildingFineExposure[] = [
      {
        building: 1,
        bin: "1000001",
        total_exposure: "1250.50",
        open_violation_count: 2,
        reason: null,
      },
      {
        building: 2,
        bin: null,
        total_exposure: null,
        open_violation_count: null,
        reason: "no_bin_on_file",
      },
    ];
    render(<ExecutiveSummaryBand entries={[]} buildingsCount={2} fineExposures={fineExposures} />);

    // Only the resolved building's exposure is included in the total.
    expect(screen.getByText("$1,251")).toBeInTheDocument();
    expect(screen.getByText(/incomplete/i)).toBeInTheDocument();
  });

  it("handles an empty entries list and null fine exposures gracefully", () => {
    render(<ExecutiveSummaryBand entries={[]} buildingsCount={0} fineExposures={null} />);

    expect(screen.getByText("Portfolio Buildings")).toBeInTheDocument();
    expect(screen.getByText("Active Elevators")).toBeInTheDocument();
    expect(screen.getByText("At-Risk / Delinquent")).toBeInTheDocument();
    expect(screen.getByText("Next Inspection Due")).toBeInTheDocument();
    expect(screen.getByText("DOB Penalty Exposure")).toBeInTheDocument();
    // No entries at all -> nothing due.
    expect(screen.getByText(/no upcoming/i)).toBeInTheDocument();
  });
});
