import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { NarrationPanel } from "./NarrationPanel";
import * as client from "../../api/client";
import * as logger from "../../lib/logger";
import type { NarrationResponse } from "../../types/domain";

describe("NarrationPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the trigger button and no narration text before it's clicked", () => {
    render(<NarrationPanel />);

    expect(screen.getByRole("button", { name: /generate briefing/i })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the AI briefing heading, attributed to Claude, in every state", () => {
    render(<NarrationPanel />);

    const heading = screen.getByRole("heading", { name: /ai portfolio briefing/i });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText(/powered by claude/i)).toBeInTheDocument();
  });

  it("shows a loading state (disabled button, role=status) while the request is pending", async () => {
    let resolveNarration: (value: NarrationResponse) => void = () => {};
    const pending = new Promise<NarrationResponse>((resolve) => {
      resolveNarration = resolve;
    });
    vi.spyOn(client, "fetchNarration").mockReturnValue(pending);
    const user = userEvent.setup();

    render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();

    resolveNarration({ narration: "All good.", generated_at: "2026-07-25T00:00:00Z" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /generate briefing/i })).toBeEnabled(),
    );
  });

  it("renders the narration text on success", async () => {
    vi.spyOn(client, "fetchNarration").mockResolvedValue({
      narration: "Two elevators are delinquent and need attention this week.",
      generated_at: "2026-07-25T00:00:00Z",
    });
    const user = userEvent.setup();

    render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));

    expect(
      await screen.findByText(/two elevators are delinquent and need attention this week/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces generated_at as a readable timestamp on success", async () => {
    vi.spyOn(client, "fetchNarration").mockResolvedValue({
      narration: "All clear.",
      generated_at: "2026-07-25T14:32:00Z",
    });
    const user = userEvent.setup();

    render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));
    await screen.findByText(/all clear/i);

    const timeEl = document.querySelector("time");
    expect(timeEl).not.toBeNull();
    expect(timeEl).toHaveAttribute("dateTime", "2026-07-25T14:32:00Z");
    expect(timeEl?.textContent).not.toBe("");
  });

  it("has exactly one loading announcement, not a duplicate on the button and a status region", async () => {
    let resolveNarration: (value: NarrationResponse) => void = () => {};
    const pending = new Promise<NarrationResponse>((resolve) => {
      resolveNarration = resolve;
    });
    vi.spyOn(client, "fetchNarration").mockReturnValue(pending);
    const user = userEvent.setup();

    render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));

    // The button's own accessible name should stay constant; only the
    // role="status" region should announce the loading text, so screen
    // readers don't hear it twice.
    expect(screen.getByRole("button", { name: /generate briefing/i })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/generating briefing/i);

    resolveNarration({ narration: "All good.", generated_at: "2026-07-25T00:00:00Z" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /generate briefing/i })).toBeEnabled(),
    );
  });

  it("shows an inline error message on failure without crashing", async () => {
    vi.spyOn(client, "fetchNarration").mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();

    render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not generate/i);
    expect(screen.getByRole("button", { name: /generate briefing/i })).toBeEnabled();
  });

  it("allows retrying after a failure, clearing the previous error", async () => {
    vi.spyOn(client, "fetchNarration")
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ narration: "All clear.", generated_at: "2026-07-25T00:00:00Z" });
    const user = userEvent.setup();

    render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /generate briefing/i }));
    await screen.findByText(/all clear/i);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("has no axe accessibility violations in its initial state", async () => {
    const { container } = render(<NarrationPanel />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("does not crash or warn when unmounted while the request is still pending", async () => {
    let resolveNarration: (value: NarrationResponse) => void = () => {};
    const pending = new Promise<NarrationResponse>((resolve) => {
      resolveNarration = resolve;
    });
    vi.spyOn(client, "fetchNarration").mockReturnValue(pending);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();

    const { unmount } = render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));

    expect(() => {
      unmount();
    }).not.toThrow();
    resolveNarration({ narration: "All good.", generated_at: "2026-07-25T00:00:00Z" });
    await Promise.resolve();
    await Promise.resolve();

    const unmountedStateWarning = consoleErrorSpy.mock.calls.some((call) =>
      String(call[0]).includes("state update on an unmounted component"),
    );
    expect(unmountedStateWarning).toBe(false);
  });

  it("does not call the state setter again after unmounting while the request is pending", async () => {
    // NarrationPanel's fetch is click-triggered (not effect-driven), so there's
    // no natural useEffect cleanup to hook the mount-guard into. This test
    // verifies the guard's actual mechanism (the setState call itself is
    // skipped post-unmount) rather than only its externally-visible symptoms,
    // since React 18+ already silently no-ops updates on unmounted trees
    // without warning or throwing — so a pure "no console.error" assertion
    // alone cannot distinguish guarded from unguarded code.
    vi.resetModules();
    const setStateCalls: unknown[] = [];
    vi.doMock("react", async () => {
      const actual = await vi.importActual<typeof import("react")>("react");
      return {
        ...actual,
        useState: <S,>(initial: S | (() => S)) => {
          const [state, setState] = actual.useState(initial);
          const wrapped = (value: S | ((prev: S) => S)) => {
            setStateCalls.push(value);
            setState(value);
          };
          return [state, wrapped] as const;
        },
      };
    });

    const { NarrationPanel: IsolatedNarrationPanel } = await import("./NarrationPanel");
    const isolatedClient = await import("../../api/client");
    let resolveNarration: (value: NarrationResponse) => void = () => {};
    const pending = new Promise<NarrationResponse>((resolve) => {
      resolveNarration = resolve;
    });
    vi.spyOn(isolatedClient, "fetchNarration").mockReturnValue(pending);
    const user = userEvent.setup();

    const { unmount } = render(<IsolatedNarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));
    const callCountBeforeUnmount = setStateCalls.length;

    unmount();
    resolveNarration({ narration: "All good.", generated_at: "2026-07-25T00:00:00Z" });
    await Promise.resolve();
    await Promise.resolve();

    expect(setStateCalls.length).toBe(callCountBeforeUnmount);

    vi.doUnmock("react");
    vi.resetModules();
  });

  it("logs the caught error via logError when the request rejects", async () => {
    const error = new Error("boom");
    vi.spyOn(client, "fetchNarration").mockRejectedValue(error);
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    const user = userEvent.setup();

    render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));

    await screen.findByRole("alert");
    expect(logErrorSpy).toHaveBeenCalledWith("Failed to generate narration briefing", error);
  });

  it("has no axe accessibility violations once narration is rendered", async () => {
    vi.spyOn(client, "fetchNarration").mockResolvedValue({
      narration: "All clear this week.",
      generated_at: "2026-07-25T00:00:00Z",
    });
    const user = userEvent.setup();

    const { container } = render(<NarrationPanel />);
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));
    await screen.findByText(/all clear this week/i);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
