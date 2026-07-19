import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ElevatorForm } from "./ElevatorForm";
import * as client from "../../api/client";
import type { Building, Elevator } from "../../types/domain";

const buildings: Building[] = [
  { id: 1, name: "Tower A", address: "1 Main St", created_at: "x", updated_at: "x" },
  { id: 2, name: "Tower B", address: "2 Main St", created_at: "x", updated_at: "x" },
];

describe("ElevatorForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits building/device_identifier/inspection_type/last_inspection_date to createElevator", async () => {
    const created: Elevator = {
      id: 5,
      building: 2,
      device_identifier: "EL-9",
      inspection_type: "CAT5",
      last_inspection_date: "2025-06-01",
      created_at: "x",
      updated_at: "x",
    };
    const createSpy = vi.spyOn(client, "createElevator").mockResolvedValue(created);
    const onCreated = vi.fn();
    const user = userEvent.setup();

    render(<ElevatorForm buildings={buildings} onCreated={onCreated} />);

    await user.selectOptions(screen.getByLabelText(/building/i), "2");
    await user.type(screen.getByLabelText(/device identifier/i), "EL-9");
    await user.selectOptions(screen.getByLabelText(/inspection type/i), "CAT5");
    await user.type(screen.getByLabelText(/last inspection date/i), "2025-06-01");
    await user.click(screen.getByRole("button", { name: /add elevator/i }));

    expect(createSpy).toHaveBeenCalledWith({
      building: 2,
      device_identifier: "EL-9",
      inspection_type: "CAT5",
      last_inspection_date: "2025-06-01",
    });
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
  });

  it("disables submission with a helpful message when there are no buildings yet", () => {
    render(<ElevatorForm buildings={[]} onCreated={vi.fn()} />);

    expect(screen.getByText(/add a building first/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add elevator/i })).toBeDisabled();
  });

  it("shows an error message when the API call fails", async () => {
    vi.spyOn(client, "createElevator").mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();

    render(<ElevatorForm buildings={buildings} onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText(/device identifier/i), "EL-9");
    await user.type(screen.getByLabelText(/last inspection date/i), "2025-06-01");
    await user.click(screen.getByRole("button", { name: /add elevator/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not add elevator/i);
  });
});
