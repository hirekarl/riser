import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { BuildingForm } from "./BuildingForm";
import * as client from "../../api/client";
import * as logger from "../../lib/logger";
import type { Building } from "../../types/domain";

describe("BuildingForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the panel head (icon badge + eyebrow title/subtitle) above the fields", () => {
    render(<BuildingForm onCreated={vi.fn()} />);

    expect(screen.getByText("Add Building")).toBeInTheDocument();
    expect(screen.getByText("Manual entry")).toBeInTheDocument();
  });

  it("keeps the single commit action (Add building) on the primary (filled) button style", () => {
    render(<BuildingForm onCreated={vi.fn()} />);

    const submitButton = screen.getByRole("button", { name: /add building/i });
    expect(submitButton.className).toMatch(/primaryButton/);
    expect(submitButton.className).not.toMatch(/secondaryButton/);
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(<BuildingForm onCreated={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("submits the name/address payload to createBuilding and notifies on success", async () => {
    const created: Building = {
      id: 10,
      name: "Tower A",
      address: "1 Main St",
      bin: null,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };
    const createSpy = vi.spyOn(client, "createBuilding").mockResolvedValue(created);
    const onCreated = vi.fn();
    const user = userEvent.setup();

    render(<BuildingForm onCreated={onCreated} />);

    await user.type(screen.getByLabelText(/building name/i), "Tower A");
    await user.type(screen.getByLabelText(/address/i), "1 Main St");
    await user.click(screen.getByRole("button", { name: /add building/i }));

    expect(createSpy).toHaveBeenCalledWith({ name: "Tower A", address: "1 Main St" });
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
  });

  it("shows an error message when the API call fails", async () => {
    const error = new Error("boom");
    vi.spyOn(client, "createBuilding").mockRejectedValue(error);
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    const user = userEvent.setup();

    render(<BuildingForm onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText(/building name/i), "Tower A");
    await user.type(screen.getByLabelText(/address/i), "1 Main St");
    await user.click(screen.getByRole("button", { name: /add building/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not add building/i);
    expect(logErrorSpy).toHaveBeenCalledWith("Failed to create building", error);
  });
});
