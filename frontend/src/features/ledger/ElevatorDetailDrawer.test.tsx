import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LedgerEntry } from "../../types/domain";
import { ElevatorDetailDrawer } from "./ElevatorDetailDrawer";

const mockEntry: LedgerEntry = {
  id: 10,
  device_identifier: "P-404",
  inspection_type: "CAT1",
  last_inspection_date: "2025-02-14",
  dob_device_number: "4D404",
  building_name: "One World Trade",
  due_date: "2026-02-14",
  status: "Delinquent",
  has_open_violation: true,
};

describe("ElevatorDetailDrawer", () => {
  it("renders nothing when entry is null", () => {
    const { container } = render(<ElevatorDetailDrawer entry={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders device details when entry is provided", () => {
    render(<ElevatorDetailDrawer entry={mockEntry} onClose={vi.fn()} />);
    expect(screen.getByText("Device Details — P-404")).toBeInTheDocument();
    expect(screen.getByText("One World Trade")).toBeInTheDocument();
    expect(screen.getByText("4D404")).toBeInTheDocument();
    expect(screen.getByText("CAT1")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Open DOB Safety Violation Detected");
  });

  it("calls onClose when close button is clicked", () => {
    const handleClose = vi.fn();
    render(<ElevatorDetailDrawer entry={mockEntry} onClose={handleClose} />);
    fireEvent.click(screen.getByLabelText("Close details drawer"));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", () => {
    const handleClose = vi.fn();
    render(<ElevatorDetailDrawer entry={mockEntry} onClose={handleClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking overlay background", () => {
    const handleClose = vi.fn();
    render(<ElevatorDetailDrawer entry={mockEntry} onClose={handleClose} />);
    fireEvent.click(screen.getByTestId("drawer-overlay"));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
