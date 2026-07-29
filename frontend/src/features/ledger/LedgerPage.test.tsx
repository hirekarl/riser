import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { LedgerPage } from "./LedgerPage";
import * as client from "../../api/client";
import * as logger from "../../lib/logger";
import type { Building, LedgerEntry, SeedDemoDataResponse } from "../../types/domain";

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

// Computed relative to the real clock (not a hardcoded literal) so this
// stays "due soon" regardless of when the suite runs — a fixed date string
// silently drifts into the past over time without ever failing the test.
const WARNING_DUE_DATE = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

const mixedStatusEntries: LedgerEntry[] = [
  {
    id: 3,
    building_name: "Tower A",
    device_identifier: "EL-3",
    dob_device_number: null,
    inspection_type: "CAT1",
    last_inspection_date: "2020-01-01",
    due_date: "2021-01-01",
    status: "Delinquent",
    has_open_violation: false,
  },
  {
    id: 1,
    building_name: "Tower A",
    device_identifier: "EL-1",
    dob_device_number: null,
    inspection_type: "CAT1",
    last_inspection_date: "2025-07-01",
    due_date: WARNING_DUE_DATE,
    status: "Warning",
    has_open_violation: false,
  },
  {
    id: 2,
    building_name: "Tower B",
    device_identifier: "EL-2",
    dob_device_number: null,
    inspection_type: "CAT5",
    last_inspection_date: "2024-01-01",
    due_date: "2029-01-01",
    status: "Compliant",
    has_open_violation: false,
  },
];

describe("LedgerPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders ledger rows in the exact order given, without re-sorting client-side", () => {
    render(<LedgerPage entries={mixedStatusEntries} />);

    const rows = screen.getAllByRole("row").slice(1); // drop header
    const deviceIdsInOrder = rows.map((row) => within(row).getAllByText(/^EL-\d$/)[0].textContent);

    expect(deviceIdsInOrder).toEqual(["EL-3", "EL-1", "EL-2"]);
  });

  it("shows the building name inline for each elevator", () => {
    render(<LedgerPage entries={mixedStatusEntries} />);

    expect(screen.getAllByText("Tower A").length).toBeGreaterThan(0);
    expect(screen.getByText("Tower B")).toBeInTheDocument();
  });

  it("shows a muted DOB device number annotation when present, and omits it when absent", () => {
    const entries: LedgerEntry[] = [
      { ...mixedStatusEntries[0], id: 10, device_identifier: "EL-DOB", dob_device_number: "1P766" },
      { ...mixedStatusEntries[1], id: 11, device_identifier: "EL-NODOB", dob_device_number: null },
    ];
    render(<LedgerPage entries={entries} />);

    expect(screen.getByText("(DOB #1P766)")).toBeInTheDocument();
    const noDobRow = screen.getByText("EL-NODOB").closest("tr") as HTMLElement;
    expect(within(noDobRow).queryByText(/DOB #/)).not.toBeInTheDocument();
  });

  it("shows a polished empty state with clear instructions when there are zero elevators", () => {
    render(<LedgerPage entries={[]} />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(/no elevators/i)).toBeInTheDocument();
    expect(screen.getByText(/look up your first building by address/i)).toBeInTheDocument();
  });

  it("threads onSeeded through to the empty state's sample-data button", async () => {
    const response: SeedDemoDataResponse = { buildings_created: 7, elevators_created: 27 };
    vi.spyOn(client, "seedDemoData").mockResolvedValue(response);
    const onSeeded = vi.fn();
    const user = userEvent.setup();

    render(<LedgerPage entries={[]} onSeeded={onSeeded} />);

    await user.click(screen.getByRole("button", { name: /try sample data/i }));

    await waitFor(() => expect(onSeeded).toHaveBeenCalled());
  });

  it("defaults onSeeded to a no-op so the sample-data button works even when the parent doesn't pass one", async () => {
    const response: SeedDemoDataResponse = { buildings_created: 7, elevators_created: 27 };
    vi.spyOn(client, "seedDemoData").mockResolvedValue(response);
    const user = userEvent.setup();

    render(<LedgerPage entries={[]} />);

    await user.click(screen.getByRole("button", { name: /try sample data/i }));

    // No onSeeded was passed, so this exercises LedgerPage's default no-op —
    // the button click must still succeed (seed request resolves, success
    // message announced) without throwing, rather than crashing on a missing
    // handler. Matched by text, not role="status": the page also has an
    // always-present visually-hidden live region with that same role (used
    // for delete/save announcements elsewhere), so an unscoped role query is
    // ambiguous once both are on the page at once.
    expect(await screen.findByText(/7 buildings/i)).toBeInTheDocument();
  });

  it("threads onNavigateToPortfolio through to the empty state's CTA button", async () => {
    const onNavigateToPortfolio = vi.fn();
    const user = userEvent.setup();

    render(<LedgerPage entries={[]} onNavigateToPortfolio={onNavigateToPortfolio} />);

    await user.click(screen.getByRole("button", { name: /go to manage portfolio/i }));

    expect(onNavigateToPortfolio).toHaveBeenCalledTimes(1);
  });

  it("defaults onNavigateToPortfolio to a no-op so the empty state's CTA works even when the parent doesn't pass one", async () => {
    const user = userEvent.setup();

    render(<LedgerPage entries={[]} />);

    // No onNavigateToPortfolio was passed — this exercises LedgerPage's
    // default no-op, so the click must not throw.
    await user.click(screen.getByRole("button", { name: /go to manage portfolio/i }));
  });

  it("has no axe accessibility violations in a populated state", async () => {
    const { container } = render(<LedgerPage entries={mixedStatusEntries} />);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("includes a collapsed status-meaning legend that explains all three statuses once expanded", () => {
    const { container } = render(<LedgerPage entries={mixedStatusEntries} />);

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

  it("shows a loading indicator while entries have not yet arrived from the parent", () => {
    render(<LedgerPage entries={null} />);

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("shows an error banner when the parent reports a ledger-load error", () => {
    render(<LedgerPage entries={null} error="Could not load the ledger. Please try again." />);

    expect(screen.getByRole("alert")).toHaveTextContent(/could not load the ledger/i);
  });

  it("does not call updateElevator until Save is clicked", () => {
    const entry: LedgerEntry = {
      id: 1,
      building_name: "Tower A",
      device_identifier: "EL-1",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      due_date: "2021-01-01",
      status: "Delinquent",
      has_open_violation: false,
    };
    const updateSpy = vi.spyOn(client, "updateElevator");

    render(<LedgerPage entries={[entry]} />);
    const dateInput = screen.getByLabelText(/last inspection date for el-1/i);

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

  it("calls onElevatorUpdated after a successful inline Save, so the parent can refetch the ledger", async () => {
    const entry: LedgerEntry = {
      id: 1,
      building_name: "Tower A",
      device_identifier: "EL-1",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      due_date: "2021-01-01",
      status: "Delinquent",
      has_open_violation: false,
    };
    vi.spyOn(client, "updateElevator").mockResolvedValue({
      id: entry.id,
      building: 1,
      device_identifier: entry.device_identifier,
      dob_device_number: entry.dob_device_number,
      inspection_type: entry.inspection_type,
      last_inspection_date: "2026-07-01",
      created_at: "x",
      updated_at: "x",
    });
    const onElevatorUpdated = vi.fn();

    render(<LedgerPage entries={[entry]} onElevatorUpdated={onElevatorUpdated} />);
    const dateInput = screen.getByLabelText(/last inspection date for el-1/i);
    fireEvent.change(dateInput, { target: { value: "2026-07-01" } });
    const row = dateInput.closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /^save inspection date for el-1$/i }));

    await waitFor(() => {
      expect(onElevatorUpdated).toHaveBeenCalledTimes(1);
    });
  });

  it("highlights only the row whose status changed after the entries prop is updated by the parent", async () => {
    const changing: LedgerEntry = {
      id: 1,
      building_name: "Tower A",
      device_identifier: "EL-1",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      due_date: "2021-01-01",
      status: "Delinquent",
      has_open_violation: false,
    };
    const unchanged: LedgerEntry = {
      id: 2,
      building_name: "Tower B",
      device_identifier: "EL-2",
      dob_device_number: null,
      inspection_type: "CAT5",
      last_inspection_date: "2024-01-01",
      due_date: "2029-01-01",
      status: "Compliant",
      has_open_violation: false,
    };
    const changingAfter: LedgerEntry = {
      ...changing,
      last_inspection_date: "2026-07-01",
      due_date: "2027-07-01",
      status: "Compliant",
      has_open_violation: false,
    };

    const { rerender } = render(<LedgerPage entries={[changing, unchanged]} />);

    // Simulates the parent refetching after a save resolves elsewhere
    // (e.g. via onElevatorUpdated) and passing down fresh entries.
    rerender(<LedgerPage entries={[changingAfter, unchanged]} />);

    await waitFor(() => {
      expect(screen.getByText("EL-1").closest("tr")?.className).toMatch(/highlighting/);
    });
    expect(screen.getByText("EL-2").closest("tr")?.className).not.toMatch(/highlighting/);
  });

  it("does not highlight any row on the initial render", () => {
    render(<LedgerPage entries={mixedStatusEntries} />);

    const dataRows = screen.getAllByRole("row").slice(1);
    for (const row of dataRows) {
      expect(row.className).not.toMatch(/highlighting/);
    }
  });

  it("clears the highlight after the animation duration elapses", async () => {
    const before: LedgerEntry = {
      id: 1,
      building_name: "Tower A",
      device_identifier: "EL-1",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
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

    const { rerender } = render(<LedgerPage entries={[before]} />);
    rerender(<LedgerPage entries={[after]} />);

    await waitFor(() => {
      expect(screen.getByText("EL-1").closest("tr")?.className).toMatch(/highlighting/);
    });

    await waitFor(
      () => {
        expect(screen.getByText("EL-1").closest("tr")?.className).not.toMatch(/highlighting/);
      },
      { timeout: 3000 },
    );
  }, 5000);

  it("reverts to the original value and makes no network call when Cancel is clicked", () => {
    const entry: LedgerEntry = {
      id: 1,
      building_name: "Tower A",
      device_identifier: "EL-1",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      due_date: "2021-01-01",
      status: "Delinquent",
      has_open_violation: false,
    };
    const updateSpy = vi.spyOn(client, "updateElevator");

    render(<LedgerPage entries={[entry]} />);
    const dateInput = screen.getByLabelText(/last inspection date for el-1/i);

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
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      due_date: "2021-01-01",
      status: "Delinquent",
      has_open_violation: false,
    };
    const error = new Error("boom");
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    let rejectUpdate!: (err: Error) => void;
    vi.spyOn(client, "updateElevator").mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectUpdate = reject;
      }),
    );

    render(<LedgerPage entries={[entry]} />);
    const dateInput = screen.getByLabelText(/last inspection date for el-1/i);

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

  it("ignores an empty date-input change", () => {
    const entry: LedgerEntry = {
      id: 1,
      building_name: "Tower A",
      device_identifier: "EL-1",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      due_date: "2021-01-01",
      status: "Delinquent",
      has_open_violation: false,
    };
    const updateSpy = vi.spyOn(client, "updateElevator");

    render(<LedgerPage entries={[entry]} />);
    const dateInput = screen.getByLabelText(/last inspection date for el-1/i);

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
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      due_date: "2021-01-01",
      status: "Delinquent",
      has_open_violation: false,
    };

    render(<LedgerPage entries={[entry]} />);
    const dateInput = screen.getByLabelText(/last inspection date for el-1/i);

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

  it("renders an accessible Edit button per row and calls onEditRequest with that row's entry", () => {
    const onEditRequest = vi.fn();

    render(<LedgerPage entries={mixedStatusEntries} onEditRequest={onEditRequest} />);

    const el1Cell = screen.getByText("EL-1");
    const row = el1Cell.closest("tr");
    expect(row).not.toBeNull();

    const editButton = within(row as HTMLElement).getByRole("button", { name: /edit el-1/i });
    fireEvent.click(editButton);

    expect(onEditRequest).toHaveBeenCalledTimes(1);
    expect(onEditRequest).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, device_identifier: "EL-1" }),
    );
  });

  it("shows a 'Remediation steps' button for Warning/Delinquent rows but not for Compliant rows", () => {
    render(<LedgerPage entries={mixedStatusEntries} />);

    const delinquentCell = screen.getByText("EL-3"); // Delinquent
    const warningCell = screen.getByText("EL-1"); // Warning
    const compliantCell = screen.getByText("EL-2"); // Compliant

    expect(
      within(delinquentCell.closest("tr") as HTMLElement).getByRole("button", {
        name: /remediation steps for el-3/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(warningCell.closest("tr") as HTMLElement).getByRole("button", {
        name: /remediation steps for el-1/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(compliantCell.closest("tr") as HTMLElement).queryByRole("button", {
        name: /remediation steps/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("shows Warning-specific remediation copy (distinct from Delinquent's) when a Warning row's details are expanded", () => {
    render(<LedgerPage entries={mixedStatusEntries} />);

    const warningCell = screen.getByText("EL-1"); // Warning, due_date is WARNING_DUE_DATE (5 days out)
    const viewDetailsButton = within(warningCell.closest("tr") as HTMLElement).getByRole("button", {
      name: /remediation steps for el-1/i,
    });

    fireEvent.click(viewDetailsButton);

    const whatsWrongTerm = screen.getByText(/what's wrong/i);
    const detailPanel = whatsWrongTerm.closest("dl") as HTMLElement;

    // Warning copy reads "due soon", never "overdue" (that's Delinquent-only
    // phrasing), and still names the specific inspection type.
    expect(within(detailPanel).getByText(/due soon/i)).toBeInTheDocument();
    expect(within(detailPanel).queryByText(/overdue/i)).not.toBeInTheDocument();
    expect(within(detailPanel).getByText(/CAT1/)).toBeInTheDocument();
    expect(within(detailPanel).getByText(/schedule the inspection now/i)).toBeInTheDocument();
  });

  it("expands a plain-language remediation panel (what's wrong / next step / where to go) when Remediation steps is clicked, and collapses on a second click", () => {
    render(<LedgerPage entries={mixedStatusEntries} />);

    const delinquentCell = screen.getByText("EL-3");
    const viewDetailsButton = within(delinquentCell.closest("tr") as HTMLElement).getByRole(
      "button",
      { name: /remediation steps for el-3/i },
    );

    fireEvent.click(viewDetailsButton);
    const whatsWrongTerm = screen.getByText(/what's wrong/i);
    expect(whatsWrongTerm).toBeInTheDocument();
    expect(screen.getByText(/next step/i)).toBeInTheDocument();
    expect(screen.getByText(/where to go/i)).toBeInTheDocument();

    // The accessible name must track the visible label ("Hide remediation
    // steps" once expanded), not stay pinned to "Remediation steps" —
    // otherwise a screen-reader/voice-control user hears a name that doesn't
    // match what's on screen (WCAG 2.5.3 Label in Name).
    expect(viewDetailsButton).toHaveAccessibleName(/hide remediation steps for el-3/i);

    // Mentions the specific inspection type so the copy is concrete, not
    // generic — scoped to the detail panel itself, since the ledger table's
    // own "Inspection type" column also contains "CAT1" for other rows.
    const detailPanel = whatsWrongTerm.closest("dl") as HTMLElement;
    expect(within(detailPanel).getByText(/CAT1/)).toBeInTheDocument();

    fireEvent.click(viewDetailsButton);
    expect(screen.queryByText(/what's wrong/i)).not.toBeInTheDocument();
    expect(viewDetailsButton).toHaveAccessibleName(/show remediation steps for el-3/i);
  });

  it("has no axe accessibility violations with a remediation panel expanded", async () => {
    const { container } = render(<LedgerPage entries={mixedStatusEntries} />);

    const delinquentCell = screen.getByText("EL-3");
    fireEvent.click(
      within(delinquentCell.closest("tr") as HTMLElement).getByRole("button", {
        name: /remediation steps for el-3/i,
      }),
    );
    screen.getByText(/what's wrong/i);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("shows an open-violation badge on a row whose has_open_violation is true", () => {
    const entries: LedgerEntry[] = [
      { ...mixedStatusEntries[0], has_open_violation: true },
      { ...mixedStatusEntries[1], has_open_violation: false },
    ];
    render(<LedgerPage entries={entries} />);

    const violationRow = screen.getByText("EL-3").closest("tr") as HTMLElement;
    expect(within(violationRow).getByText(/open violation/i)).toBeInTheDocument();

    const cleanRow = screen.getByText("EL-1").closest("tr") as HTMLElement;
    expect(within(cleanRow).queryByText(/open violation/i)).not.toBeInTheDocument();
  });

  it("mentions the open violation in the expanded remediation panel", () => {
    const entries: LedgerEntry[] = [{ ...mixedStatusEntries[0], has_open_violation: true }];
    render(<LedgerPage entries={entries} />);

    fireEvent.click(screen.getByRole("button", { name: /remediation steps for el-3/i }));

    expect(screen.getByText("Open DOB safety violation")).toBeInTheDocument();
  });

  it("does not show a building filter chip row when there are 0 or 1 buildings", () => {
    render(<LedgerPage entries={mixedStatusEntries} />);
    expect(screen.queryByRole("group", { name: /filter by building/i })).not.toBeInTheDocument();

    render(<LedgerPage entries={mixedStatusEntries} buildings={[buildings[0]]} />);
    expect(screen.queryByRole("group", { name: /filter by building/i })).not.toBeInTheDocument();
  });

  it("shows a building filter chip row with an 'All buildings' chip plus one per building", () => {
    render(<LedgerPage entries={mixedStatusEntries} buildings={buildings} />);

    const group = screen.getByRole("group", { name: /filter by building/i });
    const chips = within(group).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual(["All buildings", "Tower A", "Tower B"]);
    // "All buildings" starts pressed (the default, unfiltered state).
    expect(within(group).getByRole("button", { name: "All buildings" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("filters the displayed rows to the selected building chip without triggering a new fetch", () => {
    const listLedgerSpy = vi.spyOn(client, "listLedger");

    render(<LedgerPage entries={mixedStatusEntries} buildings={buildings} />);
    const group = screen.getByRole("group", { name: /filter by building/i });

    fireEvent.click(within(group).getByRole("button", { name: "Tower B" }));

    expect(screen.getByText("EL-2")).toBeInTheDocument();
    expect(screen.queryByText("EL-1")).not.toBeInTheDocument();
    expect(screen.queryByText("EL-3")).not.toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Tower B" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Filtering is now a purely client-side operation over the entries the
    // parent already fetched — it must never issue its own request.
    expect(listLedgerSpy).not.toHaveBeenCalled();
  });

  it("shows the unfiltered ledger again when switching back to the 'All buildings' chip", () => {
    render(<LedgerPage entries={mixedStatusEntries} buildings={buildings} />);
    const group = screen.getByRole("group", { name: /filter by building/i });

    fireEvent.click(within(group).getByRole("button", { name: "Tower B" }));
    expect(screen.queryByText("EL-1")).not.toBeInTheDocument();

    fireEvent.click(within(group).getByRole("button", { name: "All buildings" }));

    expect(screen.getByText("EL-1")).toBeInTheDocument();
    expect(screen.getByText("EL-2")).toBeInTheDocument();
    expect(screen.getByText("EL-3")).toBeInTheDocument();
  });

  it("reveals Confirm delete/Cancel controls when Delete is clicked, without calling deleteElevator yet", () => {
    const entry: LedgerEntry = {
      id: 1,
      building_name: "Tower A",
      device_identifier: "EL-1",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      due_date: "2021-01-01",
      status: "Delinquent",
      has_open_violation: false,
    };
    const deleteSpy = vi.spyOn(client, "deleteElevator");

    render(<LedgerPage entries={[entry]} />);
    const row = screen.getByText("EL-1").closest("tr") as HTMLElement;

    fireEvent.click(within(row).getByRole("button", { name: /^delete el-1$/i }));

    expect(within(row).getByRole("button", { name: /^confirm delete el-1$/i })).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: /^cancel deleting el-1$/i }),
    ).toBeInTheDocument();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("hides the Confirm delete/Cancel controls and calls no API when Cancel is clicked", () => {
    const entry: LedgerEntry = {
      id: 1,
      building_name: "Tower A",
      device_identifier: "EL-1",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      due_date: "2021-01-01",
      status: "Delinquent",
      has_open_violation: false,
    };
    const deleteSpy = vi.spyOn(client, "deleteElevator");

    render(<LedgerPage entries={[entry]} />);
    const row = screen.getByText("EL-1").closest("tr") as HTMLElement;

    fireEvent.click(within(row).getByRole("button", { name: /^delete el-1$/i }));
    fireEvent.click(within(row).getByRole("button", { name: /^cancel deleting el-1$/i }));

    expect(
      within(row).queryByRole("button", { name: /^confirm delete el-1$/i }),
    ).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: /^delete el-1$/i })).toBeInTheDocument();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("calls deleteElevator and onElevatorUpdated after Confirm delete is clicked", async () => {
    const entry: LedgerEntry = {
      id: 1,
      building_name: "Tower A",
      device_identifier: "EL-1",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      due_date: "2021-01-01",
      status: "Delinquent",
      has_open_violation: false,
    };
    vi.spyOn(client, "deleteElevator").mockResolvedValue(undefined);
    const onElevatorUpdated = vi.fn();

    render(<LedgerPage entries={[entry]} onElevatorUpdated={onElevatorUpdated} />);
    const row = screen.getByText("EL-1").closest("tr") as HTMLElement;

    fireEvent.click(within(row).getByRole("button", { name: /^delete el-1$/i }));
    fireEvent.click(within(row).getByRole("button", { name: /^confirm delete el-1$/i }));

    expect(client.deleteElevator).toHaveBeenCalledWith(1);
    await waitFor(() => {
      expect(onElevatorUpdated).toHaveBeenCalledTimes(1);
    });
  });

  it("moves focus to the table caption after a successful delete, so keyboard/screen-reader focus isn't lost when the row disappears", async () => {
    const entry: LedgerEntry = {
      id: 1,
      building_name: "Tower A",
      device_identifier: "EL-1",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      due_date: "2021-01-01",
      status: "Delinquent",
      has_open_violation: false,
    };
    vi.spyOn(client, "deleteElevator").mockResolvedValue(undefined);

    render(<LedgerPage entries={[entry]} />);
    const row = screen.getByText("EL-1").closest("tr") as HTMLElement;

    fireEvent.click(within(row).getByRole("button", { name: /^delete el-1$/i }));
    fireEvent.click(within(row).getByRole("button", { name: /^confirm delete el-1$/i }));

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByText(/portfolio compliance ledger, sorted by urgency/i),
      );
    });
  });

  it("announces which elevator was deleted via a polite status region", async () => {
    const entry: LedgerEntry = {
      id: 1,
      building_name: "Tower A",
      device_identifier: "EL-1",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      due_date: "2021-01-01",
      status: "Delinquent",
      has_open_violation: false,
    };
    vi.spyOn(client, "deleteElevator").mockResolvedValue(undefined);

    render(<LedgerPage entries={[entry]} />);
    const row = screen.getByText("EL-1").closest("tr") as HTMLElement;

    fireEvent.click(within(row).getByRole("button", { name: /^delete el-1$/i }));
    fireEvent.click(within(row).getByRole("button", { name: /^confirm delete el-1$/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/el-1 deleted/i);
    });
  });

  it("shows a pending/disabled state while deleting, then an error banner when deleting an elevator fails", async () => {
    const entry: LedgerEntry = {
      id: 1,
      building_name: "Tower A",
      device_identifier: "EL-1",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      due_date: "2021-01-01",
      status: "Delinquent",
      has_open_violation: false,
    };
    const error = new Error("boom");
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    let rejectDelete!: (err: Error) => void;
    vi.spyOn(client, "deleteElevator").mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectDelete = reject;
      }),
    );

    render(<LedgerPage entries={[entry]} />);
    const row = screen.getByText("EL-1").closest("tr") as HTMLElement;

    fireEvent.click(within(row).getByRole("button", { name: /^delete el-1$/i }));
    const confirmButton = within(row).getByRole("button", { name: /^confirm delete el-1$/i });
    fireEvent.click(confirmButton);

    expect(confirmButton).toBeDisabled();

    rejectDelete(error);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not delete/i);
    expect(logErrorSpy).toHaveBeenCalledWith("Failed to delete elevator", error, {
      elevatorId: 1,
    });
  });

  it("gives the inline Confirm delete/Cancel controls distinguishable aria-labels and no axe violations", async () => {
    const entry: LedgerEntry = {
      id: 1,
      building_name: "Tower A",
      device_identifier: "EL-1",
      dob_device_number: null,
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      due_date: "2021-01-01",
      status: "Delinquent",
      has_open_violation: false,
    };

    render(<LedgerPage entries={[entry]} />);
    const row = screen.getByText("EL-1").closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /^delete el-1$/i }));

    const confirmButton = within(row).getByRole("button", { name: "Confirm delete EL-1" });
    const cancelButton = within(row).getByRole("button", { name: "Cancel deleting EL-1" });
    expect(confirmButton.getAttribute("aria-label")).not.toEqual(
      cancelButton.getAttribute("aria-label"),
    );

    const results = await axe(row);
    expect(results).toHaveNoViolations();
  });

  it("does not show a status filter when there are no entries", () => {
    render(<LedgerPage entries={[]} />);

    expect(screen.queryByLabelText(/filter by status/i)).not.toBeInTheDocument();
  });

  it("shows a status filter with an 'All statuses' option plus one per status, ordered by urgency", () => {
    render(<LedgerPage entries={mixedStatusEntries} />);

    const select = screen.getByLabelText(/filter by status/i);
    const options = within(select).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "All statuses",
      "Delinquent",
      "Warning",
      "Compliant",
    ]);
  });

  it("filters the displayed rows to the selected status without triggering a new fetch", () => {
    const listLedgerSpy = vi.spyOn(client, "listLedger");

    render(<LedgerPage entries={mixedStatusEntries} />);
    const select = screen.getByLabelText(/filter by status/i);

    fireEvent.change(select, { target: { value: "Compliant" } });

    expect(screen.getByText("EL-2")).toBeInTheDocument();
    expect(screen.queryByText("EL-1")).not.toBeInTheDocument();
    expect(screen.queryByText("EL-3")).not.toBeInTheDocument();
    expect(listLedgerSpy).not.toHaveBeenCalled();
  });

  it("shows the unfiltered ledger again when switching back to 'All statuses'", () => {
    render(<LedgerPage entries={mixedStatusEntries} />);
    const select = screen.getByLabelText(/filter by status/i);

    fireEvent.change(select, { target: { value: "Compliant" } });
    expect(screen.queryByText("EL-1")).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: "" } });

    expect(screen.getByText("EL-1")).toBeInTheDocument();
    expect(screen.getByText("EL-2")).toBeInTheDocument();
    expect(screen.getByText("EL-3")).toBeInTheDocument();
  });

  it("combines the building and status filters with AND, not OR", () => {
    render(<LedgerPage entries={mixedStatusEntries} buildings={buildings} />);

    const buildingGroup = screen.getByRole("group", { name: /filter by building/i });
    const statusSelect = screen.getByLabelText(/filter by status/i);

    fireEvent.click(within(buildingGroup).getByRole("button", { name: "Tower A" }));
    fireEvent.change(statusSelect, { target: { value: "Delinquent" } });

    // Only EL-3 is both in Tower A and Delinquent.
    expect(screen.getByText("EL-3")).toBeInTheDocument();
    expect(screen.queryByText("EL-1")).not.toBeInTheDocument(); // Tower A but Warning
    expect(screen.queryByText("EL-2")).not.toBeInTheDocument(); // Compliant but Tower B
  });

  describe("sortable columns", () => {
    function deviceIdsInOrder() {
      const rows = screen.getAllByRole("row").slice(1);
      return rows.map((row) => within(row).getAllByText(/^EL-\d$/)[0].textContent);
    }

    it("sorts ascending by a column on the first click", async () => {
      const user = userEvent.setup();
      render(<LedgerPage entries={mixedStatusEntries} />);

      await user.click(screen.getByRole("button", { name: /sort by device/i }));

      expect(deviceIdsInOrder()).toEqual(["EL-1", "EL-2", "EL-3"]);
    });

    it("reverses to descending on a second click of the same header", async () => {
      const user = userEvent.setup();
      render(<LedgerPage entries={mixedStatusEntries} />);

      const button = screen.getByRole("button", { name: /sort by device/i });
      await user.click(button);
      await user.click(screen.getByRole("button", { name: /sort by device/i }));

      expect(deviceIdsInOrder()).toEqual(["EL-3", "EL-2", "EL-1"]);
    });

    it("clears back to the original prop order on a third click, removing aria-sort", async () => {
      const user = userEvent.setup();
      render(<LedgerPage entries={mixedStatusEntries} />);

      await user.click(screen.getByRole("button", { name: /sort by device/i }));
      await user.click(screen.getByRole("button", { name: /sort by device/i }));
      await user.click(screen.getByRole("button", { name: /sort by device/i }));

      expect(deviceIdsInOrder()).toEqual(["EL-3", "EL-1", "EL-2"]);
      const deviceHeader = screen.getByRole("columnheader", { name: /device/i });
      expect(deviceHeader).not.toHaveAttribute("aria-sort");
    });

    it("resets to ascending on a different column and clears the previous column's aria-sort", async () => {
      const user = userEvent.setup();
      render(<LedgerPage entries={mixedStatusEntries} />);

      await user.click(screen.getByRole("button", { name: /sort by device/i }));
      await user.click(screen.getByRole("button", { name: /sort by building/i }));

      const deviceHeader = screen.getByRole("columnheader", { name: /device/i });
      const buildingHeader = screen.getByRole("columnheader", { name: /building/i });
      expect(deviceHeader).not.toHaveAttribute("aria-sort");
      expect(buildingHeader).toHaveAttribute("aria-sort", "ascending");
    });

    it("composes with an active building/status filter, sorting only the filtered subset", async () => {
      const user = userEvent.setup();
      render(<LedgerPage entries={mixedStatusEntries} buildings={buildings} />);

      const buildingGroup = screen.getByRole("group", { name: /filter by building/i });
      fireEvent.click(within(buildingGroup).getByRole("button", { name: "Tower A" })); // -> EL-3, EL-1
      await user.click(screen.getByRole("button", { name: /sort by device/i }));

      expect(deviceIdsInOrder()).toEqual(["EL-1", "EL-3"]);
    });

    it("sorts the status column by urgency rank, not alphabetically", async () => {
      const user = userEvent.setup();
      render(<LedgerPage entries={mixedStatusEntries} />);

      await user.click(screen.getByRole("button", { name: /sort by status/i }));

      // Delinquent (EL-3), Warning (EL-1), Compliant (EL-2) is the urgency
      // order — alphabetical would be Compliant, Delinquent, Warning.
      expect(deviceIdsInOrder()).toEqual(["EL-3", "EL-1", "EL-2"]);
    });

    it("only puts aria-sort on the currently active column's header", async () => {
      const user = userEvent.setup();
      render(<LedgerPage entries={mixedStatusEntries} />);

      await user.click(screen.getByRole("button", { name: /sort by status/i }));

      const headers = screen.getAllByRole("columnheader");
      const sortedHeaders = headers.filter((header) => header.hasAttribute("aria-sort"));
      expect(sortedHeaders).toHaveLength(1);
      expect(sortedHeaders[0]).toHaveTextContent(/status/i);
    });

    it("renders sortable column headers as real buttons", () => {
      render(<LedgerPage entries={mixedStatusEntries} />);

      expect(screen.getByRole("button", { name: /sort by status/i })).toBeInTheDocument();
    });

    it("has no axe accessibility violations with an active sort applied", async () => {
      const user = userEvent.setup();
      const { container } = render(<LedgerPage entries={mixedStatusEntries} />);

      await user.click(screen.getByRole("button", { name: /sort by status/i }));

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("never gives the Actions header a sort button or aria-sort, under any sort state", async () => {
      const user = userEvent.setup();
      render(<LedgerPage entries={mixedStatusEntries} />);

      const actionsHeader = screen.getByRole("columnheader", { name: /^actions$/i });
      expect(
        within(actionsHeader).queryByRole("button", { name: /sort by/i }),
      ).not.toBeInTheDocument();
      expect(actionsHeader).not.toHaveAttribute("aria-sort");

      await user.click(screen.getByRole("button", { name: /sort by status/i }));

      expect(actionsHeader).not.toHaveAttribute("aria-sort");
      expect(
        within(actionsHeader).queryByRole("button", { name: /sort by/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("disables the inline date input and marks the row for whichever entry is the current edit target", () => {
    const { rerender } = render(<LedgerPage entries={mixedStatusEntries} editingElevatorId={1} />);

    const editedRowInput = screen.getByLabelText(/last inspection date for el-1/i);
    expect(editedRowInput).toBeDisabled();
    expect(editedRowInput.closest("tr")?.className).toMatch(/editingRow/);

    const otherRowInput = screen.getByLabelText(/last inspection date for el-2/i);
    expect(otherRowInput).not.toBeDisabled();
    expect(otherRowInput.closest("tr")?.className).not.toMatch(/editingRow/);

    rerender(<LedgerPage entries={mixedStatusEntries} editingElevatorId={undefined} />);

    expect(screen.getByLabelText(/last inspection date for el-1/i)).not.toBeDisabled();
    expect(
      screen.getByLabelText(/last inspection date for el-1/i).closest("tr")?.className,
    ).not.toMatch(/editingRow/);
  });

  describe("toolbar: title, device count, group-by toggle", () => {
    it("shows a 'N devices across M buildings' count describing the full unfiltered entries, unaffected by an active filter/search", () => {
      render(<LedgerPage entries={mixedStatusEntries} buildings={buildings} />);

      expect(screen.getByText(/3 devices across 2 buildings/i)).toBeInTheDocument();

      const buildingGroup = screen.getByRole("group", { name: /filter by building/i });
      fireEvent.click(within(buildingGroup).getByRole("button", { name: "Tower B" }));

      // Filtering down to one building's rows must not make the header read
      // as if data went missing — it still describes the whole portfolio.
      expect(screen.getByText(/3 devices across 2 buildings/i)).toBeInTheDocument();
    });

    it("does not render the toolbar (title, count, chips, search) at all when there are zero entries", () => {
      render(<LedgerPage entries={[]} buildings={buildings} />);

      expect(screen.queryByText(/devices across/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("group", { name: /filter by building/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/search/i)).not.toBeInTheDocument();
    });

    it("does not show the group-by-building toggle when there are 0 or 1 buildings", () => {
      render(<LedgerPage entries={mixedStatusEntries} buildings={[buildings[0]]} />);

      expect(
        screen.queryByRole("checkbox", { name: /group by building/i }),
      ).not.toBeInTheDocument();
    });

    it("shows the group-by-building toggle when there is more than one building", () => {
      render(<LedgerPage entries={mixedStatusEntries} buildings={buildings} />);

      expect(screen.getByRole("checkbox", { name: /group by building/i })).toBeInTheDocument();
    });
  });

  describe("group-by-building toggle", () => {
    it("groups rows under a per-building header once checked, and returns to a flat list when unchecked", () => {
      render(<LedgerPage entries={mixedStatusEntries} buildings={buildings} />);

      const toggle = screen.getByRole("checkbox", { name: /group by building/i });
      expect(toggle).not.toBeChecked();
      expect(screen.queryByText(/tower a — 2 devices/i)).not.toBeInTheDocument();

      fireEvent.click(toggle);

      expect(toggle).toBeChecked();
      expect(screen.getByText(/tower a — 2 devices/i)).toBeInTheDocument();
      expect(screen.getByText(/tower b — 1 device/i)).toBeInTheDocument();
      // Every row still renders under its group.
      expect(screen.getByText("EL-1")).toBeInTheDocument();
      expect(screen.getByText("EL-2")).toBeInTheDocument();
      expect(screen.getByText("EL-3")).toBeInTheDocument();

      fireEvent.click(toggle);

      expect(screen.queryByText(/tower a — 2 devices/i)).not.toBeInTheDocument();
    });

    it("keeps row actions (Edit) fully working for a row rendered inside a group", () => {
      const onEditRequest = vi.fn();
      render(
        <LedgerPage
          entries={mixedStatusEntries}
          buildings={buildings}
          onEditRequest={onEditRequest}
        />,
      );

      fireEvent.click(screen.getByRole("checkbox", { name: /group by building/i }));

      const row = screen.getByText("EL-1").closest("tr") as HTMLElement;
      fireEvent.click(within(row).getByRole("button", { name: /edit el-1/i }));

      expect(onEditRequest).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, device_identifier: "EL-1" }),
      );
    });

    it("respects the active building/status/search filters while grouped", () => {
      render(<LedgerPage entries={mixedStatusEntries} buildings={buildings} />);

      fireEvent.click(screen.getByRole("checkbox", { name: /group by building/i }));
      const buildingGroup = screen.getByRole("group", { name: /filter by building/i });
      fireEvent.click(within(buildingGroup).getByRole("button", { name: "Tower A" }));

      expect(screen.getByText(/tower a — 2 devices/i)).toBeInTheDocument();
      expect(screen.queryByText(/tower b — \d+ device/i)).not.toBeInTheDocument();
      expect(screen.queryByText("EL-2")).not.toBeInTheDocument();
    });
  });

  describe("search box", () => {
    const searchEntries: LedgerEntry[] = [
      {
        id: 20,
        building_name: "Riverside Tower",
        device_identifier: "EL-RS-1",
        dob_device_number: "9Z999",
        inspection_type: "CAT1",
        last_inspection_date: "2020-01-01",
        due_date: "2021-01-01",
        status: "Delinquent",
        has_open_violation: false,
      },
      {
        id: 21,
        building_name: "Harbor Point",
        device_identifier: "EL-HP-2",
        dob_device_number: null,
        inspection_type: "CAT5",
        last_inspection_date: "2024-01-01",
        due_date: "2029-01-01",
        status: "Compliant",
        has_open_violation: false,
      },
    ];

    it("has a visible (not visually-hidden) label", () => {
      render(<LedgerPage entries={searchEntries} />);

      const input = screen.getByLabelText(/search/i);
      const label = input.closest("div")?.querySelector("label") ?? screen.getByText(/search/i);
      expect(label).not.toHaveClass("visually-hidden");
      expect(input).toBeVisible();
    });

    it("matches by building name", () => {
      render(<LedgerPage entries={searchEntries} />);
      fireEvent.change(screen.getByLabelText(/search/i), { target: { value: "riverside" } });

      expect(screen.getByText("EL-RS-1")).toBeInTheDocument();
      expect(screen.queryByText("EL-HP-2")).not.toBeInTheDocument();
    });

    it("matches by device_identifier", () => {
      render(<LedgerPage entries={searchEntries} />);
      fireEvent.change(screen.getByLabelText(/search/i), { target: { value: "hp-2" } });

      expect(screen.getByText("EL-HP-2")).toBeInTheDocument();
      expect(screen.queryByText("EL-RS-1")).not.toBeInTheDocument();
    });

    it("matches by dob_device_number", () => {
      render(<LedgerPage entries={searchEntries} />);
      fireEvent.change(screen.getByLabelText(/search/i), { target: { value: "9z999" } });

      expect(screen.getByText("EL-RS-1")).toBeInTheDocument();
      expect(screen.queryByText("EL-HP-2")).not.toBeInTheDocument();
    });

    it("matches by status", () => {
      render(<LedgerPage entries={searchEntries} />);
      fireEvent.change(screen.getByLabelText(/search/i), { target: { value: "compliant" } });

      expect(screen.getByText("EL-HP-2")).toBeInTheDocument();
      expect(screen.queryByText("EL-RS-1")).not.toBeInTheDocument();
    });

    it("shows every row again once the search is cleared", () => {
      render(<LedgerPage entries={searchEntries} />);
      const input = screen.getByLabelText(/search/i);

      fireEvent.change(input, { target: { value: "riverside" } });
      expect(screen.queryByText("EL-HP-2")).not.toBeInTheDocument();

      fireEvent.change(input, { target: { value: "" } });
      expect(screen.getByText("EL-RS-1")).toBeInTheDocument();
      expect(screen.getByText("EL-HP-2")).toBeInTheDocument();
    });
  });

  describe("due-date urgency styling", () => {
    it("marks a Delinquent row's due date overdue with a day-count subtext", () => {
      render(<LedgerPage entries={mixedStatusEntries} />);

      const row = screen.getByText("EL-3").closest("tr") as HTMLElement;
      const dueDate = within(row).getByText("2021-01-01");
      expect(dueDate.className).toMatch(/dueOverdue/);
      expect(within(row).getByText(/day.*overdue/i)).toBeInTheDocument();
    });

    it("marks a Warning row's due date as due-soon with a 'Due in N days' subtext", () => {
      render(<LedgerPage entries={mixedStatusEntries} />);

      const row = screen.getByText("EL-1").closest("tr") as HTMLElement;
      const dueDate = within(row).getByText(WARNING_DUE_DATE);
      expect(dueDate.className).toMatch(/dueSoon/);
      expect(within(row).getByText(/due in 5 days/i)).toBeInTheDocument();
    });

    it("marks a Compliant row's due date ok with no day-count subtext", () => {
      render(<LedgerPage entries={mixedStatusEntries} />);

      const row = screen.getByText("EL-2").closest("tr") as HTMLElement;
      const dueDate = within(row).getByText("2029-01-01");
      expect(dueDate.className).toMatch(/dueOk/);
      expect(within(row).queryByText(/day/i)).not.toBeInTheDocument();
    });
  });

  describe("ElevatorDetailDrawer integration", () => {
    it("opens the drawer with the clicked row's entry, and closes it via the close button", () => {
      render(<LedgerPage entries={mixedStatusEntries} />);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      const row = screen.getByText("EL-1").closest("tr") as HTMLElement;
      fireEvent.click(within(row).getByRole("button", { name: /view device details for el-1/i }));

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("Device Details — EL-1")).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText("Close details drawer"));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("opens with a different row's entry when a different row's button is clicked", () => {
      render(<LedgerPage entries={mixedStatusEntries} />);

      const row = screen.getByText("EL-2").closest("tr") as HTMLElement;
      fireEvent.click(within(row).getByRole("button", { name: /view device details for el-2/i }));

      expect(screen.getByText("Device Details — EL-2")).toBeInTheDocument();
    });
  });
});
