import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import App from "./App";
import * as client from "./api/client";
import * as logger from "./lib/logger";
import type { AddressLookupResponse, Building, Elevator, LedgerEntry } from "./types/domain";

describe("App", () => {
  beforeEach(() => {
    // Fetched unconditionally on every App mount (issue #120) — stubbed to
    // an empty resolved array by default so tests unrelated to fine
    // exposure don't have to think about it; tests that do care override
    // this per-test.
    vi.spyOn(client, "fetchPortfolioFineExposure").mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a retryable error banner when the initial buildings fetch fails, and clears it on a successful retry", async () => {
    vi.spyOn(client, "listLedger").mockResolvedValue([]);
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    const building: Building = {
      id: 1,
      name: "Tower A",
      address: "1 Main St",
      created_at: "x",
      updated_at: "x",
    };
    const listBuildingsSpy = vi
      .spyOn(client, "listBuildings")
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce([building]);

    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load buildings/i);
    expect(logErrorSpy).toHaveBeenCalledWith("Failed to load buildings", expect.any(Error));

    await user.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
    expect(listBuildingsSpy).toHaveBeenCalledTimes(2);

    // The elevator form's building dropdown should now be populated from the
    // successful retry, rather than staying permanently empty.
    const elevatorForm = await screen.findByRole("form", { name: /add an elevator/i });
    expect(within(elevatorForm).getByRole("option", { name: "Tower A" })).toBeInTheDocument();
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
      dob_device_number: null,
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
      has_open_violation: false,
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

    const buildingForm = screen.getByRole("form", { name: /add a building/i });
    await user.type(within(buildingForm).getByLabelText(/building name/i), "Tower A");
    await user.type(within(buildingForm).getByLabelText(/address/i), "1 Main St");
    await user.click(within(buildingForm).getByRole("button", { name: /add building/i }));

    const elevatorForm = await screen.findByRole("form", { name: /add an elevator/i });

    await waitFor(() => {
      expect(within(elevatorForm).getByLabelText(/^building$/i)).not.toBeDisabled();
    });

    await user.type(within(elevatorForm).getByLabelText(/device identifier/i), "EL-1");
    await user.type(within(elevatorForm).getByLabelText(/last inspection date/i), "2026-01-01");
    await user.click(within(elevatorForm).getByRole("button", { name: /add elevator/i }));

    expect(await screen.findByText("EL-1")).toBeInTheDocument();
  });

  it("wires the address lookup form's onSaved into the same building/reload state as handleBuildingCreated", async () => {
    const lookupResponse: AddressLookupResponse = {
      match: { bin: "1001686", resolved_address: "350 5 AVENUE", borough: "MANHATTAN" },
      matches: null,
      drafts: [
        {
          dob_device_number: "1P766",
          device_status: "Active",
          inspection_type: "CAT1",
          last_inspection_date: "2026-03-01",
        },
      ],
      reason: null,
    };
    const building: Building = {
      id: 9,
      name: "Tower A",
      address: "350 5 AVENUE",
      created_at: "x",
      updated_at: "x",
    };
    const elevator: Elevator = {
      id: 1,
      building: 9,
      device_identifier: "1P766",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2026-03-01",
      created_at: "x",
      updated_at: "x",
    };

    vi.spyOn(client, "listBuildings").mockResolvedValue([]);
    const listLedgerSpy = vi.spyOn(client, "listLedger").mockResolvedValue([]);
    vi.spyOn(client, "lookupBuildingByAddress").mockResolvedValue(lookupResponse);
    vi.spyOn(client, "createBuilding").mockResolvedValue(building);
    vi.spyOn(client, "createElevator").mockResolvedValue(elevator);

    const user = userEvent.setup();
    render(<App />);

    const lookupForm = await screen.findByRole("form", { name: /look up building by address/i });
    await user.type(within(lookupForm).getByLabelText(/street address/i), "350 5th Ave");
    await user.click(within(lookupForm).getByRole("button", { name: /look up address/i }));

    const reviewForm = await screen.findByRole("form", { name: /review and save building/i });
    await user.type(within(reviewForm).getByLabelText(/building name/i), "Tower A");
    expect(listLedgerSpy).toHaveBeenCalledTimes(1);

    await user.click(within(reviewForm).getByRole("button", { name: /^save$/i }));

    // handleAddressLookupSaved appends the returned building to `buildings`
    // (same as handleBuildingCreated) — reflected in the elevator form's
    // building dropdown, which is otherwise empty.
    const elevatorForm = await screen.findByRole("form", { name: /add an elevator/i });
    expect(within(elevatorForm).getByRole("option", { name: "Tower A" })).toBeInTheDocument();

    // ...and it also bumps reloadSignal, triggering the same ledger refetch
    // path as handleBuildingCreated/handleElevatorCreated.
    await waitFor(() => expect(listLedgerSpy).toHaveBeenCalledTimes(2));
  });

  it("edits an elevator from the ledger's Edit button, saves via updateElevator, and returns to create mode", async () => {
    const before: LedgerEntry = {
      id: 1,
      device_identifier: "EL-1",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      building_name: "Tower A",
      due_date: "2021-01-01",
      status: "Delinquent",
      has_open_violation: false,
    };
    const after: LedgerEntry = {
      ...before,
      device_identifier: "EL-1B",
      dob_device_number: null,
      last_inspection_date: "2026-07-01",
      due_date: "2027-07-01",
      status: "Compliant",
      has_open_violation: false,
    };
    const updatedElevator: Elevator = {
      id: 1,
      building: 1,
      device_identifier: "EL-1B",
      dob_device_number: null,
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
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      building_name: "Tower A",
      due_date: "2021-01-01",
      status: "Delinquent",
      has_open_violation: false,
    };
    const afterInlineEdit: LedgerEntry = {
      ...before,
      last_inspection_date: "2026-06-01",
      due_date: "2027-06-01",
      status: "Compliant",
      has_open_violation: false,
    };

    vi.spyOn(client, "listBuildings").mockResolvedValue([]);
    vi.spyOn(client, "listLedger")
      .mockResolvedValueOnce([before])
      .mockResolvedValueOnce([afterInlineEdit]);
    const updateSpy = vi.spyOn(client, "updateElevator").mockResolvedValue({
      id: 1,
      building: 1,
      device_identifier: "EL-1",
      dob_device_number: null,
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
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      building_name: "Tower A",
      due_date: "2021-01-01",
      status: "Delinquent",
      has_open_violation: false,
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
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      building_name: "Tower A",
      due_date: "2021-01-01",
      status: "Delinquent",
      has_open_violation: false,
    };
    const entryB: LedgerEntry = {
      id: 2,
      device_identifier: "EL-2",
      dob_device_number: null,
      inspection_type: "CAT5",
      last_inspection_date: "2024-01-01",
      building_name: "Tower B",
      due_date: "2029-01-01",
      status: "Compliant",
      has_open_violation: false,
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

  it("shows the Ledger tab's content by default, with the Timeline tab's content hidden", async () => {
    vi.spyOn(client, "listBuildings").mockResolvedValue([]);
    vi.spyOn(client, "listLedger").mockResolvedValue([]);

    const { container } = render(<App />);

    const ledgerTab = await screen.findByRole("tab", { name: /^ledger$/i });
    const timelineTab = screen.getByRole("tab", { name: /^timeline$/i });

    expect(ledgerTab).toHaveAttribute("aria-selected", "true");
    expect(timelineTab).toHaveAttribute("aria-selected", "false");

    const ledgerPanel = container.querySelector("#ledger-panel") as HTMLElement;
    const timelinePanel = container.querySelector("#timeline-panel") as HTMLElement;
    expect(ledgerPanel).not.toHaveAttribute("hidden");
    expect(timelinePanel).toHaveAttribute("hidden");
  });

  it("switches to the Timeline tab's content and back when its tab button is clicked", async () => {
    vi.spyOn(client, "listBuildings").mockResolvedValue([]);
    vi.spyOn(client, "listLedger").mockResolvedValue([]);

    const user = userEvent.setup();
    const { container } = render(<App />);

    const ledgerTab = await screen.findByRole("tab", { name: /^ledger$/i });
    const timelineTab = screen.getByRole("tab", { name: /^timeline$/i });
    const ledgerPanel = container.querySelector("#ledger-panel") as HTMLElement;
    const timelinePanel = container.querySelector("#timeline-panel") as HTMLElement;

    await user.click(timelineTab);

    expect(timelineTab).toHaveAttribute("aria-selected", "true");
    expect(ledgerTab).toHaveAttribute("aria-selected", "false");
    expect(timelinePanel).not.toHaveAttribute("hidden");
    expect(ledgerPanel).toHaveAttribute("hidden");

    await user.click(ledgerTab);

    expect(ledgerTab).toHaveAttribute("aria-selected", "true");
    expect(timelineTab).toHaveAttribute("aria-selected", "false");
    expect(ledgerPanel).not.toHaveAttribute("hidden");
    expect(timelinePanel).toHaveAttribute("hidden");
  });

  it("is keyboard-operable: a tab button can be focused via Tab and activated via Enter/Space, being a real <button>", async () => {
    vi.spyOn(client, "listBuildings").mockResolvedValue([]);
    vi.spyOn(client, "listLedger").mockResolvedValue([]);

    const user = userEvent.setup();
    render(<App />);

    const timelineTab = await screen.findByRole("tab", { name: /^timeline$/i });
    timelineTab.focus();
    expect(timelineTab).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(timelineTab).toHaveAttribute("aria-selected", "true");

    const ledgerTab = screen.getByRole("tab", { name: /^ledger$/i });
    ledgerTab.focus();
    await user.keyboard(" ");
    expect(ledgerTab).toHaveAttribute("aria-selected", "true");
  });

  it("shows the Timeline tab's upcoming-due-dates view driven by the same ledger entries as the Ledger tab", async () => {
    const entry: LedgerEntry = {
      id: 1,
      device_identifier: "EL-1",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2026-01-01",
      building_name: "Tower A",
      due_date: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10),
      status: "Warning",
      has_open_violation: false,
    };
    vi.spyOn(client, "listBuildings").mockResolvedValue([]);
    const listLedgerSpy = vi.spyOn(client, "listLedger").mockResolvedValue([entry]);

    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("EL-1"); // ledger tab, active by default

    await user.click(screen.getByRole("tab", { name: /^timeline$/i }));

    expect(await screen.findByText("EL-1")).toBeInTheDocument();
    // A single shared fetch backs both views — the Timeline tab must not
    // trigger its own independent listLedger() call.
    expect(listLedgerSpy).toHaveBeenCalledTimes(1);
  });

  it("shows an error banner on both tabs when the shared ledger fetch fails", async () => {
    vi.spyOn(client, "listBuildings").mockResolvedValue([]);
    const ledgerError = new Error("network down");
    vi.spyOn(client, "listLedger").mockRejectedValue(ledgerError);
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});

    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load the ledger/i);
    expect(logErrorSpy).toHaveBeenCalledWith("Failed to load ledger", ledgerError);

    await user.click(screen.getByRole("tab", { name: /^timeline$/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/could not load the ledger/i);
  });

  it("shows an error banner when the portfolio-wide fine-exposure fetch fails", async () => {
    vi.spyOn(client, "listBuildings").mockResolvedValue([
      { id: 1, name: "Tower A", address: "1 Main St", created_at: "x", updated_at: "x" },
    ]);
    vi.spyOn(client, "listLedger").mockResolvedValue([]);
    const fineExposureError = new Error("network down");
    vi.spyOn(client, "fetchPortfolioFineExposure").mockRejectedValue(fineExposureError);
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load fine exposure/i);
    expect(logErrorSpy).toHaveBeenCalledWith(
      "Failed to load building fine exposure",
      fineExposureError,
    );
  });

  it("refetches the shared ledger after an inline Save in the Ledger tab, without disturbing an unrelated open Edit form", async () => {
    const before: LedgerEntry = {
      id: 1,
      device_identifier: "EL-1",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      building_name: "Tower A",
      due_date: "2021-01-01",
      status: "Delinquent",
      has_open_violation: false,
    };
    const after: LedgerEntry = {
      ...before,
      last_inspection_date: "2026-07-01",
      due_date: "2027-07-01",
      status: "Compliant",
      has_open_violation: false,
    };

    vi.spyOn(client, "listBuildings").mockResolvedValue([]);
    const listLedgerSpy = vi
      .spyOn(client, "listLedger")
      .mockResolvedValueOnce([before])
      .mockResolvedValueOnce([after]);
    vi.spyOn(client, "updateElevator").mockResolvedValue({
      id: 1,
      building: 1,
      device_identifier: "EL-1",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2026-07-01",
      created_at: "x",
      updated_at: "x",
    });

    render(<App />);
    const dateInput = await screen.findByLabelText(/last inspection date for el-1/i);
    const row = dateInput.closest("tr") as HTMLElement;

    fireEvent.change(dateInput, { target: { value: "2026-07-01" } });
    const saveButton = within(row).getByRole("button", {
      name: /^save inspection date for el-1$/i,
    });
    fireEvent.click(saveButton);

    expect(await screen.findByText("2027-07-01")).toBeInTheDocument();
    expect(listLedgerSpy).toHaveBeenCalledTimes(2);
    // No Edit form was open, so nothing about handleElevatorUpdated's
    // editingElevator reset should have been touched/needed here.
    expect(screen.queryByRole("form", { name: /edit an elevator/i })).not.toBeInTheDocument();
  });

  it("has no axe violations on the Ledger tab panel or the Timeline tab panel", async () => {
    vi.spyOn(client, "listBuildings").mockResolvedValue([]);
    vi.spyOn(client, "listLedger").mockResolvedValue([]);

    const user = userEvent.setup();
    const { container } = render(<App />);

    await screen.findByRole("tab", { name: /^ledger$/i });
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("tab", { name: /^timeline$/i }));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("lists buildings in a standalone building-management surface, and refetches both buildings and the ledger after a successful delete", async () => {
    const towerA: Building = {
      id: 1,
      name: "Tower A",
      address: "1 Main St",
      created_at: "x",
      updated_at: "x",
    };
    const towerB: Building = {
      id: 2,
      name: "Tower B",
      address: "2 Main St",
      created_at: "x",
      updated_at: "x",
    };

    const listBuildingsSpy = vi
      .spyOn(client, "listBuildings")
      .mockResolvedValueOnce([towerA, towerB])
      .mockResolvedValueOnce([towerB]);
    vi.spyOn(client, "listLedger").mockResolvedValue([]);
    vi.spyOn(client, "deleteBuilding").mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<App />);

    const buildingList = await screen.findByRole("region", { name: /buildings/i });
    expect(within(buildingList).getByText("Tower A")).toBeInTheDocument();
    expect(within(buildingList).getByText("Tower B")).toBeInTheDocument();

    const item = within(buildingList).getByText("Tower A").closest("li") as HTMLElement;
    await user.click(within(item).getByRole("button", { name: /^delete building tower a$/i }));
    await user.click(
      within(item).getByRole("button", {
        name: /^confirm delete building tower a and all its elevators$/i,
      }),
    );

    await waitFor(() => {
      expect(within(buildingList).queryByText("Tower A")).not.toBeInTheDocument();
    });
    expect(listBuildingsSpy).toHaveBeenCalledTimes(2);
  });

  it("reloads the shared ledger after seeding demo data from the empty state", async () => {
    const seededEntry: LedgerEntry = {
      id: 1,
      device_identifier: "EL-1",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2026-01-01",
      building_name: "Tower A",
      due_date: "2027-01-01",
      status: "Compliant",
      has_open_violation: false,
    };

    vi.spyOn(client, "listBuildings").mockResolvedValue([]);
    const listLedgerSpy = vi
      .spyOn(client, "listLedger")
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([seededEntry]);
    vi.spyOn(client, "seedDemoData").mockResolvedValue({
      buildings_created: 7,
      elevators_created: 27,
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /try sample data/i }));

    expect(await screen.findByText("EL-1")).toBeInTheDocument();
    expect(listLedgerSpy).toHaveBeenCalledTimes(2);
  });

  it("has no axe violations on the Timeline tab once it's populated with upcoming entries, including a due-very-soon row", async () => {
    const dueSoon: LedgerEntry = {
      id: 1,
      device_identifier: "EL-SOON",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2026-01-01",
      building_name: "Tower A",
      due_date: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
      status: "Warning",
      has_open_violation: false,
    };
    const dueLater: LedgerEntry = {
      id: 2,
      device_identifier: "EL-LATER",
      dob_device_number: null,
      inspection_type: "CAT5",
      last_inspection_date: "2026-01-01",
      building_name: "Tower A",
      due_date: new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10),
      status: "Compliant",
      has_open_violation: false,
    };
    vi.spyOn(client, "listBuildings").mockResolvedValue([]);
    vi.spyOn(client, "listLedger").mockResolvedValue([dueSoon, dueLater]);

    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(await screen.findByRole("tab", { name: /^timeline$/i }));
    expect(await screen.findByText("EL-SOON")).toBeInTheDocument();
    expect(screen.getByText("EL-LATER")).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it("does not render the portfolio reset control when the portfolio is empty", async () => {
    vi.spyOn(client, "listBuildings").mockResolvedValue([]);
    vi.spyOn(client, "listLedger").mockResolvedValue([]);

    render(<App />);

    await screen.findByRole("form", { name: /add a building/i });
    expect(screen.queryByRole("button", { name: /reset portfolio/i })).not.toBeInTheDocument();
  });

  it("renders the portfolio reset control when buildings exist, and wires its onReset into the shared refetch", async () => {
    const building: Building = {
      id: 1,
      name: "Tower A",
      address: "1 Main St",
      created_at: "x",
      updated_at: "x",
    };
    vi.spyOn(client, "listBuildings").mockResolvedValue([building]);
    const listLedgerSpy = vi.spyOn(client, "listLedger").mockResolvedValue([]);
    vi.spyOn(client, "resetPortfolio").mockResolvedValue({
      buildings_deleted: 1,
      elevators_deleted: 0,
    });

    const user = userEvent.setup();
    render(<App />);

    const resetButton = await screen.findByRole("button", { name: /reset portfolio/i });
    await waitFor(() => expect(listLedgerSpy).toHaveBeenCalledTimes(1));

    await user.click(resetButton);
    await user.type(screen.getByLabelText(/type reset to confirm/i), "RESET");
    await user.click(screen.getByRole("button", { name: /confirm reset/i }));

    await waitFor(() => expect(listLedgerSpy).toHaveBeenCalledTimes(2));
  });
});
