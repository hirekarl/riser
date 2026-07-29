import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { axe } from "vitest-axe";
import { BuildingList } from "./BuildingList";
import * as client from "../../api/client";
import * as logger from "../../lib/logger";
import type { Building, BuildingFineExposure } from "../../types/domain";

const buildings: Building[] = [
  {
    id: 1,
    name: "Tower A",
    address: "1 Main St",
    bin: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
  {
    id: 2,
    name: "Tower B",
    address: "2 Main St",
    bin: null,
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

    // Resolved entries for every building avoid the per-row loading state's
    // own role="status" elements colliding with the delete-announcement
    // region this test is asserting on (a missing/pending entry falls back
    // to that same loading state — see FineExposureSummary).
    const resolvedFineExposures: BuildingFineExposure[] = buildings.map((b) => ({
      building: b.id,
      bin: null,
      total_exposure: null,
      open_violation_count: null,
      reason: "no_bin_on_file",
    }));
    render(<BuildingList buildings={buildings} fineExposures={resolvedFineExposures} />);
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

  describe("fine exposure (issue #120, always visible)", () => {
    it("shows a loading state per row while fineExposures is null", () => {
      render(<BuildingList buildings={buildings} fineExposures={null} />);

      const rows = screen.getAllByText(/checking fine exposure/i);
      expect(rows).toHaveLength(buildings.length);
    });

    it("shows the total exposure and violation count once resolved", () => {
      const fineExposures: BuildingFineExposure[] = [
        {
          building: 1,
          bin: "1001026",
          total_exposure: "3150.50",
          open_violation_count: 2,
          reason: null,
        },
        { building: 2, bin: "2000094", total_exposure: "0", open_violation_count: 0, reason: null },
      ];
      render(<BuildingList buildings={buildings} fineExposures={fineExposures} />);

      expect(screen.getByText(/\$3,150\.50/)).toBeInTheDocument();
      expect(screen.getByText(/2 open violations/i)).toBeInTheDocument();
    });

    it("uses singular 'violation' when the count is exactly 1", () => {
      const fineExposures: BuildingFineExposure[] = [
        {
          building: 1,
          bin: "1001026",
          total_exposure: "3000.00",
          open_violation_count: 1,
          reason: null,
        },
        { building: 2, bin: "2000094", total_exposure: "0", open_violation_count: 0, reason: null },
      ];
      render(<BuildingList buildings={buildings} fineExposures={fineExposures} />);

      expect(screen.getByText(/1 open violation\./i)).toBeInTheDocument();
    });

    it("shows an explanatory (non-error) message for a building with no BIN on file", () => {
      const fineExposures: BuildingFineExposure[] = [
        {
          building: 1,
          bin: null,
          total_exposure: null,
          open_violation_count: null,
          reason: "no_bin_on_file",
        },
        { building: 2, bin: "2000094", total_exposure: "0", open_violation_count: 0, reason: null },
      ];
      render(<BuildingList buildings={buildings} fineExposures={fineExposures} />);

      expect(screen.getByText(/hasn.t been matched to a NYC DOB building/i)).toBeInTheDocument();
    });

    it("shows a per-row error when that building's entry has reason upstream_unavailable", () => {
      const fineExposures: BuildingFineExposure[] = [
        {
          building: 1,
          bin: "1001026",
          total_exposure: null,
          open_violation_count: null,
          reason: "upstream_unavailable",
        },
        { building: 2, bin: "2000094", total_exposure: "0", open_violation_count: 0, reason: null },
      ];
      render(<BuildingList buildings={buildings} fineExposures={fineExposures} />);

      expect(screen.getByText(/couldn.t check fine exposure/i)).toBeInTheDocument();
      // Tower B still resolved fine — one building's failure doesn't blank the others.
      expect(screen.getByText(/\$0\.00/)).toBeInTheDocument();
    });

    it("shows a fineExposuresError banner when the whole portfolio fetch failed", () => {
      render(
        <BuildingList
          buildings={buildings}
          fineExposures={null}
          fineExposuresError="Could not load fine exposure. Please try again."
        />,
      );

      expect(screen.getByRole("alert")).toHaveTextContent(/could not load fine exposure/i);
    });

    it("renders nothing fine-exposure-related when the prop is omitted entirely", () => {
      render(<BuildingList buildings={buildings} />);

      // Defaults to the loading state (null), not a silently missing feature.
      expect(screen.getAllByText(/checking fine exposure/i)).toHaveLength(buildings.length);
    });

    it("has no axe accessibility violations once resolved", async () => {
      const fineExposures: BuildingFineExposure[] = [
        {
          building: 1,
          bin: "1001026",
          total_exposure: "3150.50",
          open_violation_count: 2,
          reason: null,
        },
        { building: 2, bin: "2000094", total_exposure: "0", open_violation_count: 0, reason: null },
      ];
      const { container } = render(
        <BuildingList buildings={buildings} fineExposures={fineExposures} />,
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
