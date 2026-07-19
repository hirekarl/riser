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
});
