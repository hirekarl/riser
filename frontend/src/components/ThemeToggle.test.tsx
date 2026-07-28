import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { ThemeProvider } from "../lib/theme";
import { ThemeToggle } from "./ThemeToggle";

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

/** Stubs `window.matchMedia("(prefers-color-scheme: dark)")` to report `matches`. */
function mockOsPreference(matches: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    mockOsPreference(false);
  });

  afterEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    vi.restoreAllMocks();
  });

  it("renders a button with an accessible label reflecting the light starting state", () => {
    renderToggle();
    expect(screen.getByRole("button", { name: /switch to dark mode/i })).toBeInTheDocument();
  });

  it("shows the dark-mode icon/label on first render when the OS prefers dark, with no explicit choice made yet", () => {
    mockOsPreference(true);
    renderToggle();

    expect(screen.getByRole("button", { name: /switch to light mode/i })).toBeInTheDocument();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("toggles to dark mode on click, updating the label and data-theme", async () => {
    const user = userEvent.setup();
    renderToggle();

    const button = screen.getByRole("button", { name: /switch to dark mode/i });
    await user.click(button);

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: /switch to light mode/i })).toBeInTheDocument();
  });

  it("toggles back to light mode on a second click", async () => {
    const user = userEvent.setup();
    renderToggle();

    const button = screen.getByRole("button", { name: /switch to dark mode/i });
    await user.click(button);
    await user.click(screen.getByRole("button", { name: /switch to light mode/i }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(screen.getByRole("button", { name: /switch to dark mode/i })).toBeInTheDocument();
  });

  it("reflects the current state via aria-pressed", async () => {
    const user = userEvent.setup();
    renderToggle();

    const button = screen.getByRole("button", { name: /switch to dark mode/i });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await user.click(button);
    expect(screen.getByRole("button", { name: /switch to light mode/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("has no axe accessibility violations", async () => {
    const { container } = renderToggle();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
