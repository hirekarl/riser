import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { ElevatorForm } from "./ElevatorForm";
import * as client from "../../api/client";
import * as logger from "../../lib/logger";
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
      dob_device_number: null,
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
      dob_device_number: null,
    });
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
  });

  it("disables submission with a helpful message when there are no buildings yet", () => {
    render(<ElevatorForm buildings={[]} onCreated={vi.fn()} />);

    expect(screen.getByText(/add a building first/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add elevator/i })).toBeDisabled();
  });

  it("shows an error message when the API call fails", async () => {
    const error = new Error("boom");
    vi.spyOn(client, "createElevator").mockRejectedValue(error);
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    const user = userEvent.setup();

    render(<ElevatorForm buildings={buildings} onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText(/device identifier/i), "EL-9");
    await user.type(screen.getByLabelText(/last inspection date/i), "2025-06-01");
    await user.click(screen.getByRole("button", { name: /add elevator/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not add elevator/i);
    expect(logErrorSpy).toHaveBeenCalledWith("Failed to create elevator", error);
  });

  describe("edit mode", () => {
    const editingElevator = {
      id: 7,
      device_identifier: "EL-7",
      inspection_type: "CAT1" as const,
      last_inspection_date: "2024-01-01",
    };

    it("pre-fills fields from editingElevator and shows a 'Save changes' submit button", () => {
      render(
        <ElevatorForm
          buildings={buildings}
          onCreated={vi.fn()}
          editingElevator={editingElevator}
        />,
      );

      expect(screen.getByLabelText(/device identifier/i)).toHaveValue("EL-7");
      expect(screen.getByLabelText(/inspection type/i)).toHaveValue("CAT1");
      expect(screen.getByLabelText(/last inspection date/i)).toHaveValue("2024-01-01");
      expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^add elevator$/i })).not.toBeInTheDocument();
      expect(screen.getByRole("form", { name: /edit an elevator/i })).toBeInTheDocument();
    });

    it("submits changes via updateElevator (not createElevator) with the elevator's id", async () => {
      const updated: Elevator = {
        id: 7,
        building: 1,
        device_identifier: "EL-7B",
        inspection_type: "CAT5",
        last_inspection_date: "2025-01-01",
        dob_device_number: null,
        created_at: "x",
        updated_at: "x",
      };
      const updateSpy = vi.spyOn(client, "updateElevator").mockResolvedValue(updated);
      const createSpy = vi.spyOn(client, "createElevator");
      const onUpdated = vi.fn();
      const user = userEvent.setup();

      render(
        <ElevatorForm
          buildings={buildings}
          onCreated={vi.fn()}
          editingElevator={editingElevator}
          onUpdated={onUpdated}
        />,
      );

      await user.clear(screen.getByLabelText(/device identifier/i));
      await user.type(screen.getByLabelText(/device identifier/i), "EL-7B");
      await user.selectOptions(screen.getByLabelText(/inspection type/i), "CAT5");
      await user.clear(screen.getByLabelText(/last inspection date/i));
      await user.type(screen.getByLabelText(/last inspection date/i), "2025-01-01");
      await user.click(screen.getByRole("button", { name: /save changes/i }));

      expect(updateSpy).toHaveBeenCalledWith(7, {
        device_identifier: "EL-7B",
        inspection_type: "CAT5",
        last_inspection_date: "2025-01-01",
      });
      expect(createSpy).not.toHaveBeenCalled();
      await vi.waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updated));
    });

    it("cancels out of edit mode without calling createElevator or updateElevator", async () => {
      const createSpy = vi.spyOn(client, "createElevator");
      const updateSpy = vi.spyOn(client, "updateElevator");
      const onEditCancel = vi.fn();
      const user = userEvent.setup();

      render(
        <ElevatorForm
          buildings={buildings}
          onCreated={vi.fn()}
          editingElevator={editingElevator}
          onEditCancel={onEditCancel}
        />,
      );

      await user.click(screen.getByRole("button", { name: /cancel/i }));

      expect(onEditCancel).toHaveBeenCalledTimes(1);
      expect(createSpy).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it("shows an error message when the update API call fails", async () => {
      const error = new Error("boom");
      vi.spyOn(client, "updateElevator").mockRejectedValue(error);
      const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
      const user = userEvent.setup();

      render(
        <ElevatorForm
          buildings={buildings}
          onCreated={vi.fn()}
          editingElevator={editingElevator}
        />,
      );

      await user.click(screen.getByRole("button", { name: /save changes/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/could not save changes/i);
      expect(logErrorSpy).toHaveBeenCalledWith("Failed to update elevator", error);
    });

    it("does not require buildings to be present while editing", () => {
      render(<ElevatorForm buildings={[]} onCreated={vi.fn()} editingElevator={editingElevator} />);

      expect(screen.queryByText(/add a building first/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled();
    });

    it("gives Cancel a visually distinct (non-primary) style from the Save changes button", () => {
      render(
        <ElevatorForm
          buildings={buildings}
          onCreated={vi.fn()}
          editingElevator={editingElevator}
        />,
      );

      const saveButton = screen.getByRole("button", { name: /save changes/i });
      const cancelButton = screen.getByRole("button", { name: /cancel/i });

      // The primary (committing) action and the secondary (discard) action
      // must resolve to different CSS-module classes, not share the same
      // unscoped `.form button` styling.
      expect(saveButton.className).toMatch(/primaryButton/);
      expect(cancelButton.className).toMatch(/secondaryButton/);
      expect(cancelButton.className).not.toMatch(/primaryButton/);
      expect(cancelButton.className).not.toBe(saveButton.className);
    });

    it("has no axe accessibility violations in edit mode, with both Save changes and Cancel visible", async () => {
      const { container } = render(
        <ElevatorForm
          buildings={buildings}
          onCreated={vi.fn()}
          editingElevator={editingElevator}
        />,
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
