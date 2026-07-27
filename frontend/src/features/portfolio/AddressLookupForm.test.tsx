import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { AddressLookupForm } from "./AddressLookupForm";
import { useIsMounted } from "../narration/useIsMounted";
import * as client from "../../api/client";
import * as logger from "../../lib/logger";
import type { AddressLookupResponse, Building, Elevator } from "../../types/domain";

// Same rationale as NarrationPanel.test.tsx: force a deterministic
// "unmounted mid-request" condition without relying on React 18+'s silent
// setState-after-unmount no-op (which can't otherwise be distinguished from
// a guarded/unguarded implementation in a test).
vi.mock("../narration/useIsMounted", () => ({
  useIsMounted: vi.fn(() => () => true),
}));

const successResponse: AddressLookupResponse = {
  match: { bin: "1001686", resolved_address: "350 5 AVENUE", borough: "MANHATTAN" },
  matches: null,
  drafts: [
    {
      dob_device_number: "1P766",
      device_status: "Active",
      inspection_type: "CAT1",
      last_inspection_date: "2026-03-01",
    },
    {
      dob_device_number: "1P766",
      device_status: "Active",
      inspection_type: "CAT5",
      last_inspection_date: "2022-03-01",
    },
  ],
  reason: null,
};

const ambiguousResponse: AddressLookupResponse = {
  match: null,
  matches: [
    { bin: "1001686", resolved_address: "200 WATER STREET", borough: "MANHATTAN" },
    { bin: "3001234", resolved_address: "200 WATER STREET", borough: "BROOKLYN" },
  ],
  drafts: [],
  reason: "ambiguous_match",
};

async function submitAddress(user: ReturnType<typeof userEvent.setup>, address = "350 5th Ave") {
  await user.type(screen.getByLabelText(/street address/i), address);
  await user.click(screen.getByRole("button", { name: /look up address/i }));
}

describe("AddressLookupForm", () => {
  beforeEach(() => {
    vi.mocked(useIsMounted).mockReturnValue(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an address input and submit button in the idle state", () => {
    render(<AddressLookupForm onSaved={vi.fn()} />);

    expect(screen.getByLabelText(/street address/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /look up address/i })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("has no axe accessibility violations in the idle state", async () => {
    const { container } = render(<AddressLookupForm onSaved={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows a loading state (role=status, disabled button) while the lookup is pending", async () => {
    let resolveLookup: (value: AddressLookupResponse) => void = () => {};
    const pending = new Promise<AddressLookupResponse>((resolve) => {
      resolveLookup = resolve;
    });
    vi.spyOn(client, "lookupBuildingByAddress").mockReturnValue(pending);
    const user = userEvent.setup();

    render(<AddressLookupForm onSaved={vi.fn()} />);
    await submitAddress(user);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /look up address/i })).toBeDisabled();

    resolveLookup(successResponse);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /look up address/i })).toBeEnabled(),
    );
  });

  it("has no axe accessibility violations while loading", async () => {
    let resolveLookup: (value: AddressLookupResponse) => void = () => {};
    const pending = new Promise<AddressLookupResponse>((resolve) => {
      resolveLookup = resolve;
    });
    vi.spyOn(client, "lookupBuildingByAddress").mockReturnValue(pending);
    const user = userEvent.setup();

    const { container } = render(<AddressLookupForm onSaved={vi.fn()} />);
    await submitAddress(user);

    expect(await axe(container)).toHaveNoViolations();
    resolveLookup(successResponse);
  });

  it("shows a generic error message and logs the underlying error on an unexpected failure", async () => {
    const boom = new Error("network down");
    vi.spyOn(client, "lookupBuildingByAddress").mockRejectedValue(boom);
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    const user = userEvent.setup();

    render(<AddressLookupForm onSaved={vi.fn()} />);
    await submitAddress(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not look up/i);
    expect(logErrorSpy).toHaveBeenCalledWith(expect.any(String), boom);
  });

  it("has no axe accessibility violations in the error state", async () => {
    vi.spyOn(client, "lookupBuildingByAddress").mockRejectedValue(new Error("boom"));
    vi.spyOn(logger, "logError").mockImplementation(() => {});
    const user = userEvent.setup();

    const { container } = render(<AddressLookupForm onSaved={vi.fn()} />);
    await submitAddress(user);
    await screen.findByRole("alert");

    expect(await axe(container)).toHaveNoViolations();
  });

  it("does not update state after the component has unmounted mid-request", async () => {
    vi.spyOn(client, "lookupBuildingByAddress").mockResolvedValue(successResponse);
    vi.mocked(useIsMounted).mockReturnValue(() => false);
    const user = userEvent.setup();

    render(<AddressLookupForm onSaved={vi.fn()} />);
    await submitAddress(user);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText(/building name/i)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("treats a reason=null response with no match as an unexpected error rather than rendering a broken review screen", async () => {
    vi.spyOn(client, "lookupBuildingByAddress").mockResolvedValue({
      match: null,
      matches: null,
      drafts: [],
      reason: null,
    });
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    const user = userEvent.setup();

    render(<AddressLookupForm onSaved={vi.fn()} />);
    await submitAddress(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not look up/i);
    expect(logErrorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/no reason and no match/i),
      expect.anything(),
    );
  });

  describe("fallback reasons", () => {
    it.each([
      ["address_not_found" as const, /couldn.t find that address/i],
      ["no_devices_on_file" as const, /no elevator devices on file/i],
      ["upstream_unavailable" as const, /temporarily unavailable/i],
    ])("shows a distinct explanatory message for reason=%s", async (reason, expectedText) => {
      vi.spyOn(client, "lookupBuildingByAddress").mockResolvedValue({
        match: null,
        matches: null,
        drafts: [],
        reason,
      });
      const user = userEvent.setup();

      render(<AddressLookupForm onSaved={vi.fn()} />);
      await submitAddress(user);

      expect(await screen.findByText(expectedText)).toBeInTheDocument();
      // Fallback must point the user at the manual forms rather than dead-end.
      expect(screen.getByText(/manually/i)).toBeInTheDocument();
    });

    it("has no axe accessibility violations for a fallback reason", async () => {
      vi.spyOn(client, "lookupBuildingByAddress").mockResolvedValue({
        match: null,
        matches: null,
        drafts: [],
        reason: "address_not_found",
      });
      const user = userEvent.setup();

      const { container } = render(<AddressLookupForm onSaved={vi.fn()} />);
      await submitAddress(user);
      await screen.findByText(/couldn.t find that address/i);

      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe("ambiguous match", () => {
    it("renders matches as a picker and never silently takes the first one", async () => {
      vi.spyOn(client, "lookupBuildingByAddress").mockResolvedValue(ambiguousResponse);
      const user = userEvent.setup();

      render(<AddressLookupForm onSaved={vi.fn()} />);
      await submitAddress(user, "200 Water St");

      expect(
        screen.getByRole("button", { name: /200 water street.*manhattan/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /200 water street.*brooklyn/i }),
      ).toBeInTheDocument();
    });

    it("re-calls the lookup with the chosen candidate's bin and never silently takes the first match", async () => {
      const lookupSpy = vi
        .spyOn(client, "lookupBuildingByAddress")
        .mockResolvedValueOnce(ambiguousResponse)
        .mockResolvedValueOnce(successResponse);
      const user = userEvent.setup();

      render(<AddressLookupForm onSaved={vi.fn()} />);
      await submitAddress(user, "200 Water St");

      await user.click(screen.getByRole("button", { name: /200 water street.*brooklyn/i }));

      expect(lookupSpy).toHaveBeenNthCalledWith(2, { bin: "3001234" });
      expect(await screen.findByLabelText(/building name/i)).toBeInTheDocument();
    });

    it("has no axe accessibility violations in the ambiguous-match state", async () => {
      vi.spyOn(client, "lookupBuildingByAddress").mockResolvedValue(ambiguousResponse);
      const user = userEvent.setup();

      const { container } = render(<AddressLookupForm onSaved={vi.fn()} />);
      await submitAddress(user, "200 Water St");

      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe("review and save", () => {
    it("renders one editable row per draft, defaulting to the DOB values, all included", async () => {
      vi.spyOn(client, "lookupBuildingByAddress").mockResolvedValue(successResponse);
      const user = userEvent.setup();

      render(<AddressLookupForm onSaved={vi.fn()} />);
      await submitAddress(user);

      const deviceInputs = await screen.findAllByLabelText(/device identifier/i);
      expect(deviceInputs).toHaveLength(2);
      expect(deviceInputs[0]).toHaveValue("1P766");

      const typeSelects = screen.getAllByLabelText(/inspection type/i);
      expect(typeSelects[0]).toHaveValue("CAT1");
      expect(typeSelects[1]).toHaveValue("CAT5");

      const dateInputs = screen.getAllByLabelText(/last inspection date/i);
      expect(dateInputs[0]).toHaveValue("2026-03-01");

      const includeCheckboxes = screen.getAllByRole("checkbox");
      expect(includeCheckboxes).toHaveLength(2);
      for (const checkbox of includeCheckboxes) {
        expect(checkbox).toBeChecked();
      }
    });

    it("disables Save until a building name is entered", async () => {
      vi.spyOn(client, "lookupBuildingByAddress").mockResolvedValue(successResponse);
      const user = userEvent.setup();

      render(<AddressLookupForm onSaved={vi.fn()} />);
      await submitAddress(user);
      await screen.findByLabelText(/building name/i);

      expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
      await user.type(screen.getByLabelText(/building name/i), "Tower A");
      expect(screen.getByRole("button", { name: /^save$/i })).toBeEnabled();
    });

    it("has no axe accessibility violations in the review state", async () => {
      vi.spyOn(client, "lookupBuildingByAddress").mockResolvedValue(successResponse);
      const user = userEvent.setup();

      const { container } = render(<AddressLookupForm onSaved={vi.fn()} />);
      await submitAddress(user);
      await screen.findByLabelText(/building name/i);

      expect(await axe(container)).toHaveNoViolations();
    });

    it("creates the building then an elevator per checked-in draft, and calls onSaved", async () => {
      vi.spyOn(client, "lookupBuildingByAddress").mockResolvedValue(successResponse);
      const createdBuilding: Building = {
        id: 9,
        name: "Tower A",
        address: "350 5 AVENUE",
        created_at: "x",
        updated_at: "x",
      };
      const createBuildingSpy = vi
        .spyOn(client, "createBuilding")
        .mockResolvedValue(createdBuilding);
      const createElevatorSpy = vi.spyOn(client, "createElevator").mockImplementation(
        (payload) =>
          Promise.resolve({
            id: Math.random(),
            created_at: "x",
            updated_at: "x",
            ...payload,
          }) as Promise<Elevator>,
      );
      const onSaved = vi.fn();
      const user = userEvent.setup();

      render(<AddressLookupForm onSaved={onSaved} />);
      await submitAddress(user);
      await screen.findByLabelText(/building name/i);

      // Exclude the second (CAT5) row.
      const includeCheckboxes = screen.getAllByRole("checkbox");
      await user.click(includeCheckboxes[1]);

      await user.type(screen.getByLabelText(/building name/i), "Tower A");
      await user.click(screen.getByRole("button", { name: /^save$/i }));

      await waitFor(() => expect(onSaved).toHaveBeenCalledWith(createdBuilding));

      expect(createBuildingSpy).toHaveBeenCalledWith({
        name: "Tower A",
        address: "350 5 AVENUE",
      });
      expect(createElevatorSpy).toHaveBeenCalledTimes(1);
      expect(createElevatorSpy).toHaveBeenCalledWith({
        building: 9,
        device_identifier: "1P766",
        inspection_type: "CAT1",
        last_inspection_date: "2026-03-01",
      });
    });

    it("reflects edits made to a row's fields before saving", async () => {
      vi.spyOn(client, "lookupBuildingByAddress").mockResolvedValue(successResponse);
      const createdBuilding: Building = {
        id: 9,
        name: "Tower A",
        address: "350 5 AVENUE",
        created_at: "x",
        updated_at: "x",
      };
      vi.spyOn(client, "createBuilding").mockResolvedValue(createdBuilding);
      const createElevatorSpy = vi.spyOn(client, "createElevator").mockImplementation(
        (payload) =>
          Promise.resolve({
            id: 1,
            created_at: "x",
            updated_at: "x",
            ...payload,
          }) as Promise<Elevator>,
      );
      const user = userEvent.setup();

      render(<AddressLookupForm onSaved={vi.fn()} />);
      await submitAddress(user);
      await screen.findByLabelText(/building name/i);

      const deviceInputs = screen.getAllByLabelText(/device identifier/i);
      await user.clear(deviceInputs[0]);
      await user.type(deviceInputs[0], "EL-CUSTOM");

      const typeSelects = screen.getAllByLabelText(/inspection type/i);
      await user.selectOptions(typeSelects[0], "CAT5");

      const dateInputs = screen.getAllByLabelText(/last inspection date/i);
      await user.clear(dateInputs[0]);
      await user.type(dateInputs[0], "2026-05-01");

      await user.type(screen.getByLabelText(/building name/i), "Tower A");
      await user.click(screen.getByRole("button", { name: /^save$/i }));

      await waitFor(() =>
        expect(createElevatorSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            device_identifier: "EL-CUSTOM",
            inspection_type: "CAT5",
            last_inspection_date: "2026-05-01",
          }),
        ),
      );
    });

    it("shows an inline error and logs it when saving fails", async () => {
      vi.spyOn(client, "lookupBuildingByAddress").mockResolvedValue(successResponse);
      const saveError = new Error("boom");
      vi.spyOn(client, "createBuilding").mockRejectedValue(saveError);
      const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
      const user = userEvent.setup();

      render(<AddressLookupForm onSaved={vi.fn()} />);
      await submitAddress(user);
      await screen.findByLabelText(/building name/i);
      await user.type(screen.getByLabelText(/building name/i), "Tower A");
      await user.click(screen.getByRole("button", { name: /^save$/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/could not save/i);
      expect(logErrorSpy).toHaveBeenCalledWith(expect.any(String), saveError);
    });
  });
});
