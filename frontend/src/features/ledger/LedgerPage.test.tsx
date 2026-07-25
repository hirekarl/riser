import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { axe } from "vitest-axe";
import { LedgerPage } from "./LedgerPage";
import * as client from "../../api/client";
import * as logger from "../../lib/logger";
import type { Building, LedgerEntry } from "../../types/domain";

const buildings: Building[] = [
  {
    id: 1,
    name: "Tower A",
    address: "1 Main St",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
  {
    id: 2,
    name: "Tower B",
    address: "2 Main St",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
];

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

  it("includes a collapsed status-meaning legend that explains all three statuses once expanded", async () => {
    vi.spyOn(client, "listLedger").mockResolvedValue(mixedStatusEntries);

    const { container } = render(<LedgerPage />);

    await waitFor(() => {
      expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
    });

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");

    const summary = within(details as HTMLElement).getByText(/what do these statuses mean/i);
    fireEvent.click(summary);

    expect(details).toHaveAttribute("open");
    const legendText = (details as HTMLElement).textContent ?? "";
    expect(legendText).toMatch(/compliant/i);
    expect(legendText).toMatch(/more than 30 days/i);
    expect(legendText).toMatch(/warning/i);
    expect(legendText).toMatch(/within.*30 days/i);
    expect(legendText).toMatch(/delinquent/i);
    expect(legendText).toMatch(/already passed/i);
  });

  it("shows a loading indicator before the ledger resolves", () => {
    vi.spyOn(client, "listLedger").mockReturnValue(new Promise(() => {}));

    render(<LedgerPage />);

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("shows an error banner when the ledger fails to load", async () => {
    const error = new Error("network down");
    vi.spyOn(client, "listLedger").mockRejectedValue(error);
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});

    render(<LedgerPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load the ledger/i);
    expect(logErrorSpy).toHaveBeenCalledWith("Failed to load ledger", error);
  });

  it("does not call updateElevator until Save is clicked", async () => {
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

    fireEvent.change(dateInput, { target: { value: "2026-07-01" } });

    // Typing/selecting a new date must not itself trigger a save.
    expect(updateSpy).not.toHaveBeenCalled();

    const row = dateInput.closest("tr") as HTMLElement;
    const saveButton = within(row).getByRole("button", {
      name: /^save inspection date for el-1$/i,
    });
    fireEvent.click(saveButton);

    expect(updateSpy).toHaveBeenCalledWith(1, { last_inspection_date: "2026-07-01" });
  });

  it("recalculates status/due-date/rank immediately after Save is clicked", async () => {
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

    // Scoped to the table (rather than screen-wide): the status-meaning
    // legend above the table also renders "Delinquent"/"Compliant" as
    // example labels, so an unscoped query would be ambiguous.
    const table = await screen.findByRole("table");
    expect(within(table).getByText(/delinquent/i)).toBeInTheDocument();

    const dateInput = screen.getByLabelText(/last inspection date for el-1/i);
    fireEvent.change(dateInput, { target: { value: "2026-07-01" } });
    const row = dateInput.closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /^save inspection date for el-1$/i }));

    expect(updateSpy).toHaveBeenCalledWith(1, { last_inspection_date: "2026-07-01" });
    expect(await within(table).findByText(/compliant/i)).toBeInTheDocument();
    expect(within(table).queryByText(/delinquent/i)).not.toBeInTheDocument();
    expect(within(table).getByText("2027-07-01")).toBeInTheDocument();
  });

  it("reverts to the original value and makes no network call when Cancel is clicked", async () => {
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

    fireEvent.change(dateInput, { target: { value: "2026-07-01" } });
    expect(dateInput).toHaveValue("2026-07-01");

    const row = dateInput.closest("tr") as HTMLElement;
    fireEvent.click(
      within(row).getByRole("button", { name: /^cancel editing inspection date for el-1$/i }),
    );

    expect(dateInput).toHaveValue("2020-01-01");
    expect(updateSpy).not.toHaveBeenCalled();
    // Save/Cancel disappear once the pending edit is discarded.
    expect(
      within(row).queryByRole("button", { name: /^save inspection date for el-1$/i }),
    ).not.toBeInTheDocument();
    expect(
      within(row).queryByRole("button", {
        name: /^cancel editing inspection date for el-1$/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("shows a pending/disabled state while saving, then an error banner when updating an elevator's date fails", async () => {
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
    const error = new Error("boom");
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    let rejectUpdate!: (err: Error) => void;
    vi.spyOn(client, "updateElevator").mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectUpdate = reject;
      }),
    );

    render(<LedgerPage />);
    const dateInput = await screen.findByLabelText(/last inspection date for el-1/i);

    fireEvent.change(dateInput, { target: { value: "2026-07-01" } });
    const row = dateInput.closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /^save inspection date for el-1$/i }));

    // While the save is in flight, the row shows a pending/disabled state.
    expect(dateInput).toBeDisabled();

    rejectUpdate(error);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not update/i);
    expect(logErrorSpy).toHaveBeenCalledWith("Failed to update elevator inspection date", error, {
      elevatorId: 1,
    });
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

    const row = dateInput.closest("tr") as HTMLElement;
    expect(
      within(row).queryByRole("button", { name: /^save inspection date for el-1$/i }),
    ).not.toBeInTheDocument();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("gives the inline Save/Cancel controls distinguishable aria-labels and no axe violations", async () => {
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

    render(<LedgerPage />);
    const dateInput = await screen.findByLabelText(/last inspection date for el-1/i);

    fireEvent.change(dateInput, { target: { value: "2026-07-01" } });
    const row = dateInput.closest("tr") as HTMLElement;

    const saveButton = within(row).getByRole("button", {
      name: "Save inspection date for EL-1",
    });
    const cancelButton = within(row).getByRole("button", {
      name: "Cancel editing inspection date for EL-1",
    });
    // The two buttons must be distinguishable to assistive tech via their
    // accessible names, not merely by visual position/color.
    expect(saveButton.getAttribute("aria-label")).not.toEqual(
      cancelButton.getAttribute("aria-label"),
    );

    const results = await axe(row);
    expect(results).toHaveNoViolations();
  });

  it("renders an accessible Edit button per row and calls onEditRequest with that row's entry", async () => {
    vi.spyOn(client, "listLedger").mockResolvedValue(mixedStatusEntries);
    const onEditRequest = vi.fn();

    render(<LedgerPage onEditRequest={onEditRequest} />);

    const el1Cell = await screen.findByText("EL-1");
    const row = el1Cell.closest("tr");
    expect(row).not.toBeNull();

    const editButton = within(row as HTMLElement).getByRole("button", { name: /edit el-1/i });
    fireEvent.click(editButton);

    expect(onEditRequest).toHaveBeenCalledTimes(1);
    expect(onEditRequest).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, device_identifier: "EL-1" }),
    );
  });

  it("does not show a building filter when no buildings are given", async () => {
    vi.spyOn(client, "listLedger").mockResolvedValue(mixedStatusEntries);

    render(<LedgerPage />);

    await waitFor(() => {
      expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
    });
    expect(screen.queryByLabelText(/filter by building/i)).not.toBeInTheDocument();
  });

  it("shows a building filter with an 'All buildings' option plus one per building", async () => {
    vi.spyOn(client, "listLedger").mockResolvedValue(mixedStatusEntries);

    render(<LedgerPage buildings={buildings} />);

    const select = await screen.findByLabelText(/filter by building/i);
    const options = within(select).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["All buildings", "Tower A", "Tower B"]);
  });

  it("refetches the ledger scoped to the selected building", async () => {
    const listLedgerSpy = vi.spyOn(client, "listLedger").mockResolvedValue(mixedStatusEntries);

    render(<LedgerPage buildings={buildings} />);
    const select = await screen.findByLabelText(/filter by building/i);

    expect(listLedgerSpy).toHaveBeenLastCalledWith(undefined);

    fireEvent.change(select, { target: { value: "2" } });

    await waitFor(() => {
      expect(listLedgerSpy).toHaveBeenLastCalledWith(2);
    });
  });

  it("refetches the unfiltered ledger when switching back to 'All buildings'", async () => {
    const listLedgerSpy = vi.spyOn(client, "listLedger").mockResolvedValue(mixedStatusEntries);

    render(<LedgerPage buildings={buildings} />);
    const select = await screen.findByLabelText(/filter by building/i);

    fireEvent.change(select, { target: { value: "2" } });
    await waitFor(() => {
      expect(listLedgerSpy).toHaveBeenLastCalledWith(2);
    });

    fireEvent.change(select, { target: { value: "" } });
    await waitFor(() => {
      expect(listLedgerSpy).toHaveBeenLastCalledWith(undefined);
    });
  });

  it("does not highlight any row on the initial load", async () => {
    vi.spyOn(client, "listLedger").mockResolvedValue(mixedStatusEntries);

    render(<LedgerPage />);

    await waitFor(() => {
      expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
    });
    const dataRows = screen.getAllByRole("row").slice(1);
    for (const row of dataRows) {
      expect(row.className).not.toMatch(/highlighting/);
    }
  });

  it("highlights only the row whose status changed after an edit", async () => {
    const changing: LedgerEntry = {
      id: 1,
      building_name: "Tower A",
      device_identifier: "EL-1",
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      due_date: "2021-01-01",
      status: "Delinquent",
    };
    const unchanged: LedgerEntry = {
      id: 2,
      building_name: "Tower B",
      device_identifier: "EL-2",
      inspection_type: "CAT5",
      last_inspection_date: "2024-01-01",
      due_date: "2029-01-01",
      status: "Compliant",
    };
    const changingAfter: LedgerEntry = {
      ...changing,
      last_inspection_date: "2026-07-01",
      due_date: "2027-07-01",
      status: "Compliant",
    };

    vi.spyOn(client, "listLedger")
      .mockResolvedValueOnce([changing, unchanged])
      .mockResolvedValueOnce([changingAfter, unchanged]);
    vi.spyOn(client, "updateElevator").mockResolvedValue({
      id: changing.id,
      building: 1,
      device_identifier: changing.device_identifier,
      inspection_type: changing.inspection_type,
      last_inspection_date: "2026-07-01",
      created_at: "x",
      updated_at: "x",
    });

    render(<LedgerPage />);
    const dateInput = await screen.findByLabelText(/last inspection date for el-1/i);

    fireEvent.change(dateInput, { target: { value: "2026-07-01" } });
    const editedRow = dateInput.closest("tr") as HTMLElement;
    fireEvent.click(
      within(editedRow).getByRole("button", { name: /^save inspection date for el-1$/i }),
    );

    await screen.findByText("2027-07-01"); // due date unique to the post-edit fetch
    const changedRow = screen.getByText("EL-1").closest("tr");
    const unchangedRow = screen.getByText("EL-2").closest("tr");

    expect(changedRow?.className).toMatch(/highlighting/);
    expect(unchangedRow?.className).not.toMatch(/highlighting/);
  });

  it("disables the inline date input and marks the row for whichever entry is the current edit target", async () => {
    vi.spyOn(client, "listLedger").mockResolvedValue(mixedStatusEntries);

    const { rerender } = render(<LedgerPage editingElevatorId={1} />);

    const editedRowInput = await screen.findByLabelText(/last inspection date for el-1/i);
    expect(editedRowInput).toBeDisabled();
    expect(editedRowInput.closest("tr")?.className).toMatch(/editingRow/);

    const otherRowInput = screen.getByLabelText(/last inspection date for el-2/i);
    expect(otherRowInput).not.toBeDisabled();
    expect(otherRowInput.closest("tr")?.className).not.toMatch(/editingRow/);

    rerender(<LedgerPage editingElevatorId={undefined} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/last inspection date for el-1/i)).not.toBeDisabled();
    });
    expect(
      screen.getByLabelText(/last inspection date for el-1/i).closest("tr")?.className,
    ).not.toMatch(/editingRow/);
  });

  it("clears the highlight after the animation duration elapses", async () => {
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
    vi.spyOn(client, "updateElevator").mockResolvedValue({
      id: before.id,
      building: 1,
      device_identifier: before.device_identifier,
      inspection_type: before.inspection_type,
      last_inspection_date: "2026-07-01",
      created_at: "x",
      updated_at: "x",
    });

    render(<LedgerPage />);
    const dateInput = await screen.findByLabelText(/last inspection date for el-1/i);

    fireEvent.change(dateInput, { target: { value: "2026-07-01" } });
    const editedRow = dateInput.closest("tr") as HTMLElement;
    fireEvent.click(
      within(editedRow).getByRole("button", { name: /^save inspection date for el-1$/i }),
    );

    await screen.findByText("2027-07-01");
    expect(screen.getByText("EL-1").closest("tr")?.className).toMatch(/highlighting/);

    await waitFor(
      () => {
        expect(screen.getByText("EL-1").closest("tr")?.className).not.toMatch(/highlighting/);
      },
      { timeout: 3000 },
    );
  }, 5000);
});
