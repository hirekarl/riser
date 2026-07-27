import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { AddressLookupForm } from "./AddressLookupForm";
import { useIsMounted } from "../narration/useIsMounted";
import * as client from "../../api/client";
import * as logger from "../../lib/logger";
import type { AddressLookupResponse } from "../../types/domain";

// Mocked so the "unmounted mid-request" tests below can force isMounted() to
// report false without literally unmounting — see NarrationPanel.test.tsx
// for why a literal `unmount()` can't distinguish guarded from unguarded
// code in React 18+. Defaults to "always mounted" so every other test below
// behaves like the real hook.
vi.mock("../narration/useIsMounted", () => ({
  useIsMounted: vi.fn(() => () => true),
}));

const MATCH_WITH_DEVICES: AddressLookupResponse = {
  match: {
    bin: "1001686",
    resolved_address: "350 5 AVENUE",
    borough: "MANHATTAN",
  },
  devices: [
    {
      device_number: "DEV-1",
      device_status: "Active",
      cat1_latest_report_filed: "2026-03-01",
      cat5_latest_report_filed: null,
      periodic_latest_inspection: "2026-02-01",
    },
    {
      device_number: "DEV-2",
      device_status: "Active",
      cat1_latest_report_filed: null,
      cat5_latest_report_filed: "2025-11-15",
      periodic_latest_inspection: null,
    },
  ],
  reason: null,
};

const NO_DEVICES_ON_FILE: AddressLookupResponse = {
  match: {
    bin: "1001686",
    resolved_address: "350 5 AVENUE",
    borough: "MANHATTAN",
  },
  devices: [],
  reason: "no_devices_on_file",
};

const ADDRESS_NOT_FOUND: AddressLookupResponse = {
  match: null,
  devices: [],
  reason: "address_not_found",
};

const UPSTREAM_UNAVAILABLE: AddressLookupResponse = {
  match: null,
  devices: [],
  reason: "upstream_unavailable",
};

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/address/i), "350 Fifth Avenue, Manhattan");
  await user.click(screen.getByRole("button", { name: /look up address/i }));
}

describe("AddressLookupForm", () => {
  beforeEach(() => {
    vi.mocked(useIsMounted).mockReturnValue(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the address input and submit button, with no status/alert/preview before submission", () => {
    render(<AddressLookupForm />);

    expect(screen.getByLabelText(/address/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /look up address/i })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a loading state (disabled input/button, role=status) while the lookup is pending", async () => {
    let resolveLookup: (value: AddressLookupResponse) => void = () => {};
    const pending = new Promise<AddressLookupResponse>((resolve) => {
      resolveLookup = resolve;
    });
    vi.spyOn(client, "lookupBuildingByAddress").mockReturnValue(pending);
    const user = userEvent.setup();

    render(<AddressLookupForm />);
    await fillAndSubmit(user);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /look/i })).toBeDisabled();
    expect(screen.getByLabelText(/address/i)).toBeDisabled();

    resolveLookup(MATCH_WITH_DEVICES);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /look up address/i })).toBeEnabled(),
    );
  });

  it("renders resolved address, borough, and a read-only device preview on a match with devices, never the BIN", async () => {
    vi.spyOn(client, "lookupBuildingByAddress").mockResolvedValue(MATCH_WITH_DEVICES);
    const user = userEvent.setup();

    const { container } = render(<AddressLookupForm />);
    await fillAndSubmit(user);

    expect(await screen.findByText(/350 5 avenue/i)).toBeInTheDocument();
    expect(screen.getByText(/manhattan/i)).toBeInTheDocument();
    expect(screen.getByText(/dev-1/i)).toBeInTheDocument();
    expect(screen.getByText(/dev-2/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-03-01/)).toBeInTheDocument();
    expect(screen.getByText(/2025-11-15/)).toBeInTheDocument();
    // Preview-only copy, since nothing is persisted today.
    expect(screen.getByText(/nothing.*saved|preview only|not.*saved/i)).toBeInTheDocument();

    // Regression guard: the BIN must never be rendered anywhere, in any form.
    const bin = MATCH_WITH_DEVICES.match?.bin;
    expect(bin).toBeTruthy();
    expect(screen.queryByText(bin as string)).not.toBeInTheDocument();
    expect(container.textContent).not.toContain(bin);
    // Also guard against it being exposed via a non-text attribute (e.g. title).
    expect(container.innerHTML).not.toContain(bin as string);
  });

  it("shows a plain 'no devices on file' message with a manual-entry nudge when the address resolves but DOB has no devices", async () => {
    vi.spyOn(client, "lookupBuildingByAddress").mockResolvedValue(NO_DEVICES_ON_FILE);
    const user = userEvent.setup();

    render(<AddressLookupForm />);
    await fillAndSubmit(user);

    expect(
      await screen.findByText(/no.*devices.*on file|no elevator records/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/add a building|add an elevator/i)).toBeInTheDocument();
    // No device preview list should render when there are no devices.
    expect(screen.queryByText(/dev-1/i)).not.toBeInTheDocument();
  });

  it("shows an address-not-found message with a manual-entry nudge", async () => {
    vi.spyOn(client, "lookupBuildingByAddress").mockResolvedValue(ADDRESS_NOT_FOUND);
    const user = userEvent.setup();

    render(<AddressLookupForm />);
    await fillAndSubmit(user);

    expect(await screen.findByText(/didn.t (find|resolve|match)|not found/i)).toBeInTheDocument();
    expect(screen.getByText(/add a building|add an elevator/i)).toBeInTheDocument();
  });

  it("shows a transient 'service unavailable' message with a manual-entry nudge when upstream is down", async () => {
    vi.spyOn(client, "lookupBuildingByAddress").mockResolvedValue(UPSTREAM_UNAVAILABLE);
    const user = userEvent.setup();

    render(<AddressLookupForm />);
    await fillAndSubmit(user);

    expect(
      await screen.findByText(
        /temporarily unavailable|try again (later|shortly)|currently unavailable/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/add a building|add an elevator/i)).toBeInTheDocument();
  });

  it("shows a generic inline error and logs the real error on a thrown/unexpected failure", async () => {
    const specificError = new Error("Request to lookup failed with status 400");
    vi.spyOn(client, "lookupBuildingByAddress").mockRejectedValue(specificError);
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    const user = userEvent.setup();

    render(<AddressLookupForm />);
    await fillAndSubmit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not look up/i);
    expect(logErrorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/address lookup/i),
      specificError,
    );
    expect(screen.getByRole("button", { name: /look up address/i })).toBeEnabled();
  });

  it("does not move past the loading state once the component has unmounted mid-request (success case)", async () => {
    vi.spyOn(client, "lookupBuildingByAddress").mockResolvedValue(MATCH_WITH_DEVICES);
    vi.mocked(useIsMounted).mockReturnValue(() => false);
    const user = userEvent.setup();

    render(<AddressLookupForm />);
    await fillAndSubmit(user);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText(/350 5 avenue/i)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("does not surface a stale error once the component has unmounted mid-request", async () => {
    vi.spyOn(client, "lookupBuildingByAddress").mockRejectedValue(new Error("boom"));
    vi.spyOn(logger, "logError").mockImplementation(() => {});
    vi.mocked(useIsMounted).mockReturnValue(() => false);
    const user = userEvent.setup();

    render(<AddressLookupForm />);
    await fillAndSubmit(user);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("clears a previous error and result when retrying successfully", async () => {
    vi.spyOn(client, "lookupBuildingByAddress")
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(MATCH_WITH_DEVICES);
    vi.spyOn(logger, "logError").mockImplementation(() => {});
    const user = userEvent.setup();

    render(<AddressLookupForm />);
    await fillAndSubmit(user);
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /look up address/i }));
    await screen.findByText(/350 5 avenue/i);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("has no axe accessibility violations in its initial state", async () => {
    const { container } = render(<AddressLookupForm />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe accessibility violations once a device preview is rendered", async () => {
    vi.spyOn(client, "lookupBuildingByAddress").mockResolvedValue(MATCH_WITH_DEVICES);
    const user = userEvent.setup();

    const { container } = render(<AddressLookupForm />);
    await fillAndSubmit(user);
    await screen.findByText(/350 5 avenue/i);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
