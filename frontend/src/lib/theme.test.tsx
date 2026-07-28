import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./theme";

const STORAGE_KEY = "riser-theme";

function TestConsumer() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button type="button" onClick={() => setTheme("dark")}>
        set dark
      </button>
      <button type="button" onClick={() => setTheme("light")}>
        set light
      </button>
      <button type="button" onClick={() => setTheme("system")}>
        set system
      </button>
    </div>
  );
}

describe("ThemeProvider / useTheme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("defaults to 'system' with no data-theme attribute when localStorage is empty", () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-value")).toHaveTextContent("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("applies data-theme and persists to localStorage when toggled to dark", () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    act(() => {
      screen.getByText("set dark").click();
    });

    expect(screen.getByTestId("theme-value")).toHaveTextContent("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark");
  });

  it("applies data-theme and persists to localStorage when toggled to light", () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    act(() => {
      screen.getByText("set light").click();
    });

    expect(screen.getByTestId("theme-value")).toHaveTextContent("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("light");
  });

  it("removes the data-theme attribute and clears storage when set back to system", () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    act(() => {
      screen.getByText("set dark").click();
    });
    act(() => {
      screen.getByText("set system").click();
    });

    expect(screen.getByTestId("theme-value")).toHaveTextContent("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("restores a persisted choice on next mount", () => {
    window.localStorage.setItem(STORAGE_KEY, "dark");

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-value")).toHaveTextContent("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("falls back to 'system' when localStorage holds an invalid value", () => {
    window.localStorage.setItem(STORAGE_KEY, "not-a-real-theme");

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-value")).toHaveTextContent("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("throws a helpful error when useTheme is used outside a ThemeProvider", () => {
    // Suppress the expected React error-boundary console noise for this case.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<TestConsumer />)).toThrow(/useTheme must be used within a ThemeProvider/);

    consoleSpy.mockRestore();
  });
});
