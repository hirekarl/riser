import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
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
    expect(screen.getByText("2025-02-14")).toBeInTheDocument();
    expect(screen.getByText("2026-02-14")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Open DOB Safety Violation Detected");
    expect(screen.getByRole("link", { name: /verify on nyc dob bis web search/i })).toHaveAttribute(
      "href",
      "https://a810-bisweb.nyc.gov/bisweb/bispi00.jsp",
    );
  });

  it("does not show the open-violation alert when has_open_violation is false", () => {
    render(
      <ElevatorDetailDrawer
        entry={{ ...mockEntry, has_open_violation: false }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows 'Unlinked' for a device with no dob_device_number", () => {
    render(
      <ElevatorDetailDrawer entry={{ ...mockEntry, dob_device_number: null }} onClose={vi.fn()} />,
    );

    expect(screen.getByText("Unlinked")).toBeInTheDocument();
  });

  it("renders as a dialog and focuses the close button on open", () => {
    render(<ElevatorDetailDrawer entry={mockEntry} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName(/device details — p-404/i);
    expect(screen.getByLabelText("Close details drawer")).toHaveFocus();
  });

  it("calls onClose when the close button is clicked", () => {
    const handleClose = vi.fn();
    render(<ElevatorDetailDrawer entry={mockEntry} onClose={handleClose} />);

    fireEvent.click(screen.getByLabelText("Close details drawer"));

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the Escape key is pressed", () => {
    const handleClose = vi.fn();
    render(<ElevatorDetailDrawer entry={mockEntry} onClose={handleClose} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on Escape when no entry is open", () => {
    const handleClose = vi.fn();
    render(<ElevatorDetailDrawer entry={null} onClose={handleClose} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(handleClose).not.toHaveBeenCalled();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const handleClose = vi.fn();
    render(<ElevatorDetailDrawer entry={mockEntry} onClose={handleClose} />);

    fireEvent.click(screen.getByTestId("drawer-overlay"));

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(<ElevatorDetailDrawer entry={mockEntry} onClose={vi.fn()} />);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
