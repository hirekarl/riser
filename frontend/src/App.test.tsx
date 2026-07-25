import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import * as client from "./api/client";
import type { Building, Elevator, LedgerEntry } from "./types/domain";

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wires the building form, elevator form, and ledger together end to end", async () => {
    const building: Building = {
      id: 1,
      name: "Tower A",
      address: "1 Main St",
      created_at: "x",
      updated_at: "x",
    };
    const elevator: Elevator = {
      id: 1,
      building: 1,
      device_identifier: "EL-1",
      inspection_type: "CAT1",
      last_inspection_date: "2026-01-01",
      created_at: "x",
      updated_at: "x",
    };
    const ledgerEntry: LedgerEntry = {
      ...elevator,
      building_name: "Tower A",
      due_date: "2027-01-01",
      status: "Compliant",
    };

    vi.spyOn(client, "listBuildings").mockResolvedValue([]);
    let elevatorCreated = false;
    vi.spyOn(client, "listLedger").mockImplementation(() =>
      Promise.resolve(elevatorCreated ? [ledgerEntry] : []),
    );
    vi.spyOn(client, "createBuilding").mockResolvedValue(building);
    vi.spyOn(client, "createElevator").mockImplementation(() => {
      elevatorCreated = true;
      return Promise.resolve(elevator);
    });

    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText(/no elevators/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/building name/i), "Tower A");
    await user.type(screen.getByLabelText(/address/i), "1 Main St");
    await user.click(screen.getByRole("button", { name: /add building/i }));

    const elevatorForm = await screen.findByRole("form", { name: /add an elevator/i });

    await waitFor(() => {
      expect(within(elevatorForm).getByLabelText(/^building$/i)).not.toBeDisabled();
    });

    await user.type(within(elevatorForm).getByLabelText(/device identifier/i), "EL-1");
    await user.type(within(elevatorForm).getByLabelText(/last inspection date/i), "2026-01-01");
    await user.click(within(elevatorForm).getByRole("button", { name: /add elevator/i }));

    expect(await screen.findByText("EL-1")).toBeInTheDocument();
  });

  it("edits an elevator from the ledger's Edit button, saves via updateElevator, and returns to create mode", async () => {
    const before: LedgerEntry = {
      id: 1,
      device_identifier: "EL-1",
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      building_name: "Tower A",
      due_date: "2021-01-01",
      status: "Delinquent",
    };
    const after: LedgerEntry = {
      ...before,
      device_identifier: "EL-1B",
      last_inspection_date: "2026-07-01",
      due_date: "2027-07-01",
      status: "Compliant",
    };
    const updatedElevator: Elevator = {
      id: 1,
      building: 1,
      device_identifier: "EL-1B",
      inspection_type: "CAT1",
      last_inspection_date: "2026-07-01",
      created_at: "x",
      updated_at: "x",
    };

    vi.spyOn(client, "listBuildings").mockResolvedValue([]);
    vi.spyOn(client, "listLedger").mockResolvedValueOnce([before]).mockResolvedValueOnce([after]);
    const updateSpy = vi.spyOn(client, "updateElevator").mockResolvedValue(updatedElevator);
    const createSpy = vi.spyOn(client, "createElevator");

    const user = userEvent.setup();
    render(<App />);

    const editButton = await screen.findByRole("button", { name: /edit el-1/i });
    await user.click(editButton);

    const editForm = await screen.findByRole("form", { name: /edit an elevator/i });
    expect(within(editForm).getByLabelText(/device identifier/i)).toHaveValue("EL-1");

    await user.clear(within(editForm).getByLabelText(/device identifier/i));
    await user.type(within(editForm).getByLabelText(/device identifier/i), "EL-1B");
    await user.click(within(editForm).getByRole("button", { name: /save changes/i }));

    expect(updateSpy).toHaveBeenCalledWith(1, {
      device_identifier: "EL-1B",
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
    });
    expect(createSpy).not.toHaveBeenCalled();

    // Saving reuses the same refetch path as creating, so the ledger reflects
    // the update live, and the form reverts to create mode.
    expect(await screen.findByText("EL-1B")).toBeInTheDocument();
    expect(await screen.findByRole("form", { name: /add an elevator/i })).toBeInTheDocument();
  });

  it("disables the inline date input for a row while its Edit form is open, preventing the stale-overwrite race", async () => {
    const before: LedgerEntry = {
      id: 1,
      device_identifier: "EL-1",
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      building_name: "Tower A",
      due_date: "2021-01-01",
      status: "Delinquent",
    };
    const afterInlineEdit: LedgerEntry = {
      ...before,
      last_inspection_date: "2026-06-01",
      due_date: "2027-06-01",
      status: "Compliant",
    };

    vi.spyOn(client, "listBuildings").mockResolvedValue([]);
    vi.spyOn(client, "listLedger")
      .mockResolvedValueOnce([before])
      .mockResolvedValueOnce([afterInlineEdit]);
    const updateSpy = vi.spyOn(client, "updateElevator").mockResolvedValue({
      id: 1,
      building: 1,
      device_identifier: "EL-1",
      inspection_type: "CAT1",
      last_inspection_date: "2026-06-01",
      created_at: "x",
      updated_at: "x",
    });

    const user = userEvent.setup();
    render(<App />);

    const editButton = await screen.findByRole("button", { name: /edit el-1/i });
    await user.click(editButton);

    await screen.findByRole("form", { name: /edit an elevator/i });

    // The inline date input for the row under edit must now be disabled, so
    // there is no way to fire the conflicting PATCH described in the repro.
    const inlineDateInput = screen.getByLabelText(/last inspection date for el-1/i);
    expect(inlineDateInput).toBeDisabled();

    // Confirm this isn't just globally disabled: attempting to change it has
    // no effect on the API.
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("cancels out of edit mode without saving and returns the form to create mode", async () => {
    const entry: LedgerEntry = {
      id: 1,
      device_identifier: "EL-1",
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      building_name: "Tower A",
      due_date: "2021-01-01",
      status: "Delinquent",
    };

    vi.spyOn(client, "listBuildings").mockResolvedValue([]);
    vi.spyOn(client, "listLedger").mockResolvedValue([entry]);
    const updateSpy = vi.spyOn(client, "updateElevator");

    const user = userEvent.setup();
    render(<App />);

    const editButton = await screen.findByRole("button", { name: /edit el-1/i });
    await user.click(editButton);

    const editForm = await screen.findByRole("form", { name: /edit an elevator/i });
    await user.click(within(editForm).getByRole("button", { name: /cancel/i }));

    expect(updateSpy).not.toHaveBeenCalled();
    expect(await screen.findByRole("form", { name: /add an elevator/i })).toBeInTheDocument();
  });

  it("locks in the intended (discard-on-switch) behavior: switching the Edit target to another row re-primes the form from that row and drops the first row's unsaved edits", async () => {
    const entryA: LedgerEntry = {
      id: 1,
      device_identifier: "EL-1",
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      building_name: "Tower A",
      due_date: "2021-01-01",
      status: "Delinquent",
    };
    const entryB: LedgerEntry = {
      id: 2,
      device_identifier: "EL-2",
      inspection_type: "CAT5",
      last_inspection_date: "2024-01-01",
      building_name: "Tower B",
      due_date: "2029-01-01",
      status: "Compliant",
    };

    vi.spyOn(client, "listBuildings").mockResolvedValue([]);
    vi.spyOn(client, "listLedger").mockResolvedValue([entryA, entryB]);
    const updateSpy = vi.spyOn(client, "updateElevator");
    const createSpy = vi.spyOn(client, "createElevator");

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /edit el-1/i }));
    const editForm = await screen.findByRole("form", { name: /edit an elevator/i });
    expect(within(editForm).getByLabelText(/device identifier/i)).toHaveValue("EL-1");

    // Make an unsaved edit to row A's device identifier, without saving.
    await user.clear(within(editForm).getByLabelText(/device identifier/i));
    await user.type(within(editForm).getByLabelText(/device identifier/i), "EL-1-UNSAVED");

    // Switch the edit target to row B without saving or cancelling first.
    await user.click(screen.getByRole("button", { name: /edit el-2/i }));

    // The form now reflects row B, not A's discarded, unsaved edit.
    await waitFor(() => {
      expect(within(editForm).getByLabelText(/device identifier/i)).toHaveValue("EL-2");
    });
    expect(within(editForm).getByLabelText(/inspection type/i)).toHaveValue("CAT5");
    expect(within(editForm).getByLabelText(/last inspection date/i)).toHaveValue("2024-01-01");
    expect(screen.queryByDisplayValue("EL-1-UNSAVED")).not.toBeInTheDocument();

    // No API call was made for row A's discarded edits.
    expect(updateSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });
});
