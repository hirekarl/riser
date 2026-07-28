import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { axe } from "vitest-axe";
import { BuildingList } from "./BuildingList";
import * as client from "../../api/client";
import * as logger from "../../lib/logger";
import type { Building } from "../../types/domain";

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

describe("BuildingList", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders each building's name and address", () => {
    render(<BuildingList buildings={buildings} />);

    expect(screen.getByText("Tower A")).toBeInTheDocument();
    expect(screen.getByText("1 Main St")).toBeInTheDocument();
    expect(screen.getByText("Tower B")).toBeInTheDocument();
    expect(screen.getByText("2 Main St")).toBeInTheDocument();
  });

  it("shows explicit, actionable instructions (not just 'no data') when there are zero buildings", () => {
    render(<BuildingList buildings={[]} />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText(/no buildings yet/i)).toBeInTheDocument();
    // Actionable, not just a bare "no data" message: tells the user exactly
    // which forms (rendered above this component in App.tsx) to use.
    expect(screen.getByText(/look up an address/i)).toBeInTheDocument();
    expect(screen.getByText(/add a building/i)).toBeInTheDocument();
  });

  it("reveals Confirm delete/Cancel controls and a cascade-impact warning when Delete is clicked, without calling deleteBuilding yet", () => {
    const deleteSpy = vi.spyOn(client, "deleteBuilding");

    render(<BuildingList buildings={buildings} />);
    const item = screen.getByText("Tower A").closest("li") as HTMLElement;

    fireEvent.click(within(item).getByRole("button", { name: /^delete building tower a$/i }));

    expect(
      within(item).getByRole("button", {
        name: /^confirm delete building tower a and all its elevators$/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(item).getByRole("button", { name: /^cancel deleting building tower a$/i }),
    ).toBeInTheDocument();
    // Deleting a building cascades server-side to delete all of its
    // elevators too (see App.tsx's handleBuildingDeleted) — this must be
    // stated as visible copy, not left implied, so a sighted user reads the
    // consequence before committing, not just a screen-reader user via the
    // aria-label above.
    expect(within(item).getByText(/also delete(s)? all of its elevators/i)).toBeInTheDocument();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("hides the Confirm delete/Cancel controls and calls no API when Cancel is clicked", () => {
    const deleteSpy = vi.spyOn(client, "deleteBuilding");

    render(<BuildingList buildings={buildings} />);
    const item = screen.getByText("Tower A").closest("li") as HTMLElement;

    fireEvent.click(within(item).getByRole("button", { name: /^delete building tower a$/i }));
    fireEvent.click(
      within(item).getByRole("button", { name: /^cancel deleting building tower a$/i }),
    );

    expect(
      within(item).queryByRole("button", {
        name: /^confirm delete building tower a and all its elevators$/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(item).getByRole("button", { name: /^delete building tower a$/i }),
    ).toBeInTheDocument();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("calls deleteBuilding and onDeleted after Confirm delete is clicked", async () => {
    vi.spyOn(client, "deleteBuilding").mockResolvedValue(undefined);
    const onDeleted = vi.fn();

    render(<BuildingList buildings={buildings} onDeleted={onDeleted} />);
    const item = screen.getByText("Tower A").closest("li") as HTMLElement;

    fireEvent.click(within(item).getByRole("button", { name: /^delete building tower a$/i }));
    fireEvent.click(
      within(item).getByRole("button", {
        name: /^confirm delete building tower a and all its elevators$/i,
      }),
    );

    expect(client.deleteBuilding).toHaveBeenCalledWith(1);
    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a pending/disabled state while deleting, then an error banner when deleting a building fails", async () => {
    const error = new Error("boom");
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    let rejectDelete!: (err: Error) => void;
    vi.spyOn(client, "deleteBuilding").mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectDelete = reject;
      }),
    );

    render(<BuildingList buildings={buildings} />);
    const item = screen.getByText("Tower A").closest("li") as HTMLElement;

    fireEvent.click(within(item).getByRole("button", { name: /^delete building tower a$/i }));
    const confirmButton = within(item).getByRole("button", {
      name: /^confirm delete building tower a and all its elevators$/i,
    });
    fireEvent.click(confirmButton);

    expect(confirmButton).toBeDisabled();

    rejectDelete(error);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not delete/i);
    expect(logErrorSpy).toHaveBeenCalledWith("Failed to delete building", error, {
      buildingId: 1,
    });
  });

  it("has no axe accessibility violations in a populated state", async () => {
    const { container } = render(<BuildingList buildings={buildings} />);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe accessibility violations while the cascade-warning Confirm delete/Cancel controls are revealed", async () => {
    const { container } = render(<BuildingList buildings={buildings} />);
    const item = screen.getByText("Tower A").closest("li") as HTMLElement;

    fireEvent.click(within(item).getByRole("button", { name: /^delete building tower a$/i }));

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("gives the inline Confirm delete/Cancel controls distinguishable, building-specific aria-labels", () => {
    render(<BuildingList buildings={buildings} />);
    const item = screen.getByText("Tower A").closest("li") as HTMLElement;

    fireEvent.click(within(item).getByRole("button", { name: /^delete building tower a$/i }));

    const confirmButton = within(item).getByRole("button", {
      name: "Confirm delete building Tower A and all its elevators",
    });
    const cancelButton = within(item).getByRole("button", {
      name: "Cancel deleting building Tower A",
    });
    expect(confirmButton.getAttribute("aria-label")).not.toEqual(
      cancelButton.getAttribute("aria-label"),
    );
  });

  it("moves focus to the 'Buildings' heading after a successful delete, so keyboard/screen-reader focus isn't lost when the row disappears", async () => {
    vi.spyOn(client, "deleteBuilding").mockResolvedValue(undefined);

    render(<BuildingList buildings={buildings} />);
    const item = screen.getByText("Tower A").closest("li") as HTMLElement;

    fireEvent.click(within(item).getByRole("button", { name: /^delete building tower a$/i }));
    fireEvent.click(
      within(item).getByRole("button", {
        name: /^confirm delete building tower a and all its elevators$/i,
      }),
    );

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Buildings" }));
    });
  });

  it("announces which building was deleted via a polite status region", async () => {
    vi.spyOn(client, "deleteBuilding").mockResolvedValue(undefined);

    render(<BuildingList buildings={buildings} />);
    const item = screen.getByText("Tower A").closest("li") as HTMLElement;

    fireEvent.click(within(item).getByRole("button", { name: /^delete building tower a$/i }));
    fireEvent.click(
      within(item).getByRole("button", {
        name: /^confirm delete building tower a and all its elevators$/i,
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/tower a deleted/i);
    });
  });
});
