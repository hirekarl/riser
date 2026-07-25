import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "./ErrorBoundary";
import * as logger from "../lib/logger";

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("kaboom");
  }
  return <p>All good</p>;
}

describe("ErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a role=alert fallback and logs the error when a child throws", () => {
    const logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    // Suppress React's noisy console.error for the expected render throw.
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(logErrorSpy).toHaveBeenCalledWith(
      "Uncaught render error",
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );
  });

  it("renders children normally when nothing throws", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("All good")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("recovers when 'Try again' is clicked after the underlying problem is fixed", async () => {
    vi.spyOn(logger, "logError").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();

    // Keep the same root component type across the rerender (below) so React
    // preserves the ErrorBoundary instance/state instead of remounting it.
    function Wrapper({ shouldThrow }: { shouldThrow: boolean }) {
      return (
        <ErrorBoundary>
          <Bomb shouldThrow={shouldThrow} />
        </ErrorBoundary>
      );
    }

    const { rerender } = render(<Wrapper shouldThrow={true} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Fix the underlying condition, then click "Try again" to reset the
    // boundary's state and re-render the (now non-throwing) children.
    rerender(<Wrapper shouldThrow={false} />);
    // Still showing the fallback until "Try again" is clicked, since the
    // boundary itself hasn't reset yet.
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("All good")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
