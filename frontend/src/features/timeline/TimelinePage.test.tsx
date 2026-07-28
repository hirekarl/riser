import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { axe } from "vitest-axe";
import { TimelinePage } from "./TimelinePage";
import type { LedgerEntry } from "../../types/domain";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Mirrors the UTC-midnight normalization convention used elsewhere (see
// LedgerPage.tsx's getRemediationCopy) so these offsets line up exactly with
// how the component itself computes "today".
function isoDateOffsetFromToday(days: number): string {
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  return new Date(today.getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

function makeEntry(overrides: Partial<LedgerEntry>): LedgerEntry {
  return {
    id: 1,
    device_identifier: "EL-1",
    inspection_type: "CAT1",
    last_inspection_date: "2020-01-01",
    building_name: "Tower A",
    due_date: isoDateOffsetFromToday(10),
    status: "Warning",
    ...overrides,
  };
}

describe("TimelinePage", () => {
  it("shows a loading indicator while entries are null", () => {
    render(<TimelinePage entries={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("shows an error banner when a ledger-load error is passed", () => {
    render(<TimelinePage entries={null} error="Could not load the ledger. Please try again." />);
    expect(screen.getByRole("alert")).toHaveTextContent(/could not load the ledger/i);
  });

  it("includes an entry due exactly 90 days from today (inclusive boundary)", () => {
    const entry = makeEntry({
      id: 1,
      device_identifier: "EL-90",
      due_date: isoDateOffsetFromToday(90),
    });
    render(<TimelinePage entries={[entry]} />);
    expect(screen.getByText("EL-90")).toBeInTheDocument();
  });

  it("excludes an entry due 91 days from today", () => {
    const entry = makeEntry({
      id: 1,
      device_identifier: "EL-91",
      due_date: isoDateOffsetFromToday(91),
    });
    render(<TimelinePage entries={[entry]} />);
    expect(screen.queryByText("EL-91")).not.toBeInTheDocument();
    expect(screen.getByText(/nothing is due in the next 90 days/i)).toBeInTheDocument();
  });

  it("excludes a past-due entry (already Delinquent, and shown on the ledger instead)", () => {
    const entry = makeEntry({
      id: 1,
      device_identifier: "EL-PAST",
      due_date: isoDateOffsetFromToday(-5),
      status: "Delinquent",
    });
    render(<TimelinePage entries={[entry]} />);
    expect(screen.queryByText("EL-PAST")).not.toBeInTheDocument();
  });

  it("includes an entry due today (day 0)", () => {
    const entry = makeEntry({
      id: 1,
      device_identifier: "EL-TODAY",
      due_date: isoDateOffsetFromToday(0),
    });
    render(<TimelinePage entries={[entry]} />);
    expect(screen.getByText("EL-TODAY")).toBeInTheDocument();
  });

  it("sorts entries ascending by due date, nearest first, regardless of input order", () => {
    const far = makeEntry({
      id: 1,
      device_identifier: "EL-FAR",
      due_date: isoDateOffsetFromToday(80),
    });
    const near = makeEntry({
      id: 2,
      device_identifier: "EL-NEAR",
      due_date: isoDateOffsetFromToday(5),
    });
    const mid = makeEntry({
      id: 3,
      device_identifier: "EL-MID",
      due_date: isoDateOffsetFromToday(30),
    });

    render(<TimelinePage entries={[far, near, mid]} />);

    const rows = screen.getAllByRole("row").slice(1); // drop header row
    const deviceIdsInOrder = rows.map((row) => within(row).getAllByText(/^EL-\w+$/)[0].textContent);
    expect(deviceIdsInOrder).toEqual(["EL-NEAR", "EL-MID", "EL-FAR"]);
  });

  it("shows a clear empty-state message when nothing is due in the next 90 days", () => {
    render(<TimelinePage entries={[]} />);
    expect(screen.getByText(/nothing is due in the next 90 days/i)).toBeInTheDocument();
  });

  it("has no axe violations in a populated state", async () => {
    const entry = makeEntry({});
    const { container } = render(<TimelinePage entries={[entry]} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe violations in the empty state", async () => {
    const { container } = render(<TimelinePage entries={[]} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
