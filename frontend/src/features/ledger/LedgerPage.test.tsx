import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { axe } from "vitest-axe";
import { LedgerPage } from "./LedgerPage";
import * as client from "../../api/client";
import type { LedgerEntry } from "../../types/domain";

const mixedStatusEntries: LedgerEntry[] = [
  {
    id: 3,
    building_name: "Tower A",
    device_identifier: "EL-3",
    inspection_type: "CAT1",
    last_inspection_date: "2020-01-01",
    due_date: "2021-01-01",
    status: "Delinquent",
  },
  {
    id: 1,
    building_name: "Tower A",
    device_identifier: "EL-1",
    inspection_type: "CAT1",
    last_inspection_date: "2025-07-01",
    due_date: "2026-07-25",
    status: "Warning",
  },
  {
    id: 2,
    building_name: "Tower B",
    device_identifier: "EL-2",
    inspection_type: "CAT5",
    last_inspection_date: "2024-01-01",
    due_date: "2029-01-01",
    status: "Compliant",
  },
];

describe("LedgerPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders ledger rows in the exact order the API returns, without re-sorting client-side", async () => {
    vi.spyOn(client, "listLedger").mockResolvedValue(mixedStatusEntries);

    render(<LedgerPage />);

    await waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(mixedStatusEntries.length + 1); // +1 header row
    });

    const rows = screen.getAllByRole("row").slice(1); // drop header
    const deviceIdsInOrder = rows.map((row) => within(row).getAllByText(/^EL-\d$/)[0].textContent);

    expect(deviceIdsInOrder).toEqual(["EL-3", "EL-1", "EL-2"]);
  });

  it("shows the building name inline for each elevator", async () => {
    vi.spyOn(client, "listLedger").mockResolvedValue(mixedStatusEntries);

    render(<LedgerPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Tower A").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Tower B")).toBeInTheDocument();
  });

  it("shows a polished empty state with clear instructions when there are zero elevators", async () => {
    vi.spyOn(client, "listLedger").mockResolvedValue([]);

    render(<LedgerPage />);

    await waitFor(() => {
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
    expect(screen.getByText(/no elevators/i)).toBeInTheDocument();
    expect(screen.getByText(/add your first building/i)).toBeInTheDocument();
  });

  it("has no axe accessibility violations in a populated state", async () => {
    vi.spyOn(client, "listLedger").mockResolvedValue(mixedStatusEntries);

    const { container } = render(<LedgerPage />);

    await waitFor(() => {
      expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("shows a loading indicator before the ledger resolves", () => {
    vi.spyOn(client, "listLedger").mockReturnValue(new Promise(() => {}));

    render(<LedgerPage />);

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("shows an error banner when the ledger fails to load", async () => {
    vi.spyOn(client, "listLedger").mockRejectedValue(new Error("network down"));

    render(<LedgerPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load the ledger/i);
  });

  it("recalculates status/due-date/rank immediately when a last-inspection date is edited", async () => {
    const before: LedgerEntry = {
      id: 1,
      building_name: "Tower A",
      device_identifier: "EL-1",
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      due_date: "2021-01-01",
      status: "Delinquent",
    };
    const after: LedgerEntry = {
      ...before,
      last_inspection_date: "2026-07-01",
      due_date: "2027-07-01",
      status: "Compliant",
    };

    vi.spyOn(client, "listLedger").mockResolvedValueOnce([before]).mockResolvedValueOnce([after]);
    const updateSpy = vi.spyOn(client, "updateElevator").mockResolvedValue({
      id: before.id,
      building: 1,
      device_identifier: before.device_identifier,
      inspection_type: before.inspection_type,
      last_inspection_date: "2026-07-01",
      created_at: "x",
      updated_at: "x",
    });

    render(<LedgerPage />);

    expect(await screen.findByText(/delinquent/i)).toBeInTheDocument();

    const dateInput = screen.getByLabelText(/last inspection date for el-1/i);
    fireEvent.change(dateInput, { target: { value: "2026-07-01" } });

    expect(updateSpy).toHaveBeenCalledWith(1, { last_inspection_date: "2026-07-01" });
    expect(await screen.findByText(/compliant/i)).toBeInTheDocument();
    expect(screen.queryByText(/delinquent/i)).not.toBeInTheDocument();
    expect(screen.getByText("2027-07-01")).toBeInTheDocument();
  });

  it("shows an error banner when updating an elevator's date fails", async () => {
    const entry: LedgerEntry = {
      id: 1,
      building_name: "Tower A",
      device_identifier: "EL-1",
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      due_date: "2021-01-01",
      status: "Delinquent",
    };
    vi.spyOn(client, "listLedger").mockResolvedValue([entry]);
    vi.spyOn(client, "updateElevator").mockRejectedValue(new Error("boom"));

    render(<LedgerPage />);
    const dateInput = await screen.findByLabelText(/last inspection date for el-1/i);

    fireEvent.change(dateInput, { target: { value: "2026-07-01" } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not update/i);
  });

  it("ignores an empty date-input change", async () => {
    const entry: LedgerEntry = {
      id: 1,
      building_name: "Tower A",
      device_identifier: "EL-1",
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      due_date: "2021-01-01",
      status: "Delinquent",
    };
    vi.spyOn(client, "listLedger").mockResolvedValue([entry]);
    const updateSpy = vi.spyOn(client, "updateElevator");

    render(<LedgerPage />);
    const dateInput = await screen.findByLabelText(/last inspection date for el-1/i);

    fireEvent.change(dateInput, { target: { value: "" } });

    expect(updateSpy).not.toHaveBeenCalled();
  });
});
