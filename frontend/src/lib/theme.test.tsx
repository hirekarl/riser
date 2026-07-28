import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./theme";

const STORAGE_KEY = "riser-theme";

function TestConsumer() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <span data-testid="resolved-theme-value">{resolvedTheme}</span>
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

/**
 * Installs a controllable `window.matchMedia` mock for `(prefers-color-scheme:
 * dark)` and returns a handle for simulating a live OS preference change.
 */
function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  const mql = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (event: string, listener: (event: MediaQueryListEvent) => void) => {
      if (event === "change") listeners.add(listener);
    },
    removeEventListener: (event: string, listener: (event: MediaQueryListEvent) => void) => {
      if (event === "change") listeners.delete(listener);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;

  vi.spyOn(window, "matchMedia").mockImplementation(() => mql);

  return {
    setMatches(next: boolean) {
      matches = next;
      const event = { matches: next, media: mql.media } as MediaQueryListEvent;
      listeners.forEach((listener) => {
        listener(event);
      });
    },
    listenerCount: () => listeners.size,
  };
}

describe("ThemeProvider / useTheme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    vi.restoreAllMocks();
  });

  it("defaults to 'system' but resolves and applies a concrete light data-theme when OS prefers light", () => {
    mockMatchMedia(false);

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-value")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved-theme-value")).toHaveTextContent("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("resolves 'system' to a concrete dark data-theme when the OS prefers dark, never leaving the attribute absent", () => {
    mockMatchMedia(true);

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-value")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved-theme-value")).toHaveTextContent("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(true);
  });

  it("applies data-theme and persists to localStorage when toggled to dark", () => {
    mockMatchMedia(false);

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    act(() => {
      screen.getByText("set dark").click();
    });

    expect(screen.getByTestId("theme-value")).toHaveTextContent("dark");
    expect(screen.getByTestId("resolved-theme-value")).toHaveTextContent("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark");
  });

  it("applies data-theme and persists to localStorage when toggled to light", () => {
    mockMatchMedia(true);

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    act(() => {
      screen.getByText("set light").click();
    });

    expect(screen.getByTestId("theme-value")).toHaveTextContent("light");
    expect(screen.getByTestId("resolved-theme-value")).toHaveTextContent("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("light");
  });

  it("resolves back to the OS preference and keeps data-theme concrete when set back to system", () => {
    mockMatchMedia(true);

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    act(() => {
      screen.getByText("set dark").click();
    });
    act(() => {
      screen.getByText("set light").click();
    });
    act(() => {
      screen.getByText("set system").click();
    });

    expect(screen.getByTestId("theme-value")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved-theme-value")).toHaveTextContent("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("restores a persisted choice on next mount", () => {
    mockMatchMedia(false);
    window.localStorage.setItem(STORAGE_KEY, "dark");

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-value")).toHaveTextContent("dark");
    expect(screen.getByTestId("resolved-theme-value")).toHaveTextContent("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("falls back to 'system' when localStorage holds an invalid value", () => {
    mockMatchMedia(false);
    window.localStorage.setItem(STORAGE_KEY, "not-a-real-theme");

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-value")).toHaveTextContent("system");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("falls back to 'system' when localStorage.getItem throws", () => {
    mockMatchMedia(false);
    const getItemSpy = vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
      throw new DOMException("blocked in this context", "SecurityError");
    });

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-value")).toHaveTextContent("system");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    getItemSpy.mockRestore();
  });

  it("updates resolvedTheme and data-theme live when the OS preference changes while following 'system'", () => {
    const media = mockMatchMedia(false);

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("resolved-theme-value")).toHaveTextContent("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    act(() => {
      media.setMatches(true);
    });

    expect(screen.getByTestId("theme-value")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved-theme-value")).toHaveTextContent("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("stops listening for OS preference changes once an explicit choice is made", () => {
    const media = mockMatchMedia(false);

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    expect(media.listenerCount()).toBe(1);

    act(() => {
      screen.getByText("set dark").click();
    });

    expect(media.listenerCount()).toBe(0);

    // Further OS changes should have no effect once an explicit choice is
    // active and the listener has been torn down.
    act(() => {
      media.setMatches(false);
    });

    expect(screen.getByTestId("resolved-theme-value")).toHaveTextContent("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("throws a helpful error when useTheme is used outside a ThemeProvider", () => {
    // Suppress the expected React error-boundary console noise for this case.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<TestConsumer />)).toThrow(/useTheme must be used within a ThemeProvider/);

    consoleSpy.mockRestore();
  });
});
