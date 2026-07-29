import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "../../types/domain";
import { ExecutiveSummaryBand } from "./ExecutiveSummaryBand";

const mockEntries: LedgerEntry[] = [
  {
    id: 1,
    device_identifier: "E-101",
    inspection_type: "CAT1",
    last_inspection_date: "2025-01-01",
    dob_device_number: "1D101",
    building_name: "Empire State Building",
    due_date: "2026-01-01",
    status: "Compliant",
    has_open_violation: false,
  },
  {
    id: 2,
    device_identifier: "E-102",
    inspection_type: "CAT5",
    last_inspection_date: "2024-05-01",
    dob_device_number: "1D102",
    building_name: "Empire State Building",
    due_date: "2025-05-01",
    status: "Delinquent",
    has_open_violation: true,
  },
  {
    id: 3,
    device_identifier: "C-201",
    inspection_type: "CAT1",
    last_inspection_date: "2025-06-01",
    dob_device_number: null,
    building_name: "Chrysler Building",
    due_date: "2026-06-01",
    status: "Warning",
    has_open_violation: false,
  },
];

describe("ExecutiveSummaryBand", () => {
  it("renders correct total buildings and active elevators count", () => {
    render(<ExecutiveSummaryBand entries={mockEntries} totalBuildingsCount={5} />);
    expect(screen.getByText("Portfolio Buildings")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Active Elevators")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("calculates at-risk and delinquent counts accurately", () => {
    render(<ExecutiveSummaryBand entries={mockEntries} totalBuildingsCount={2} />);
    expect(screen.getByText("At-Risk / Delinquent")).toBeInTheDocument();
    // 1 Delinquent + 1 Warning = 2 At-risk
    expect(screen.getByText("1 Delinquent, 1 Warning")).toBeInTheDocument();
  });

  it("finds the earliest upcoming due date", () => {
    render(<ExecutiveSummaryBand entries={mockEntries} totalBuildingsCount={2} />);
    expect(screen.getByText("2025-05-01")).toBeInTheDocument();
  });

  it("formats fine exposure properly", () => {
    render(
      <ExecutiveSummaryBand
        entries={mockEntries}
        totalBuildingsCount={2}
        totalFineExposure={1250}
      />,
    );
    expect(screen.getByText("$1,250")).toBeInTheDocument();
  });

  it("handles empty entries list gracefully", () => {
    render(<ExecutiveSummaryBand entries={[]} totalBuildingsCount={0} />);
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.getByText("$0")).toBeInTheDocument();
  });
});
