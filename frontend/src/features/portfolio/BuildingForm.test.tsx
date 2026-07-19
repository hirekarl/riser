import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuildingForm } from "./BuildingForm";
import * as client from "../../api/client";
import type { Building } from "../../types/domain";

describe("BuildingForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits the name/address payload to createBuilding and notifies on success", async () => {
    const created: Building = {
      id: 10,
      name: "Tower A",
      address: "1 Main St",
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
    vi.spyOn(client, "createBuilding").mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();

    render(<BuildingForm onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText(/building name/i), "Tower A");
    await user.type(screen.getByLabelText(/address/i), "1 Main St");
    await user.click(screen.getByRole("button", { name: /add building/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not add building/i);
  });
});
