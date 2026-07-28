import "@testing-library/jest-dom/vitest";
import "vitest-axe/extend-expect";
import { cleanup } from "@testing-library/react";
import { afterEach, expect } from "vitest";
import * as matchers from "vitest-axe/matchers";

expect.extend(matchers);

// jsdom doesn't implement `window.matchMedia`. Provide a baseline stub (OS
// preference defaults to "not dark") so code that reads
// `prefers-color-scheme` doesn't crash; individual tests that need to
// simulate a specific OS preference (or a live change event) should
// `vi.spyOn(window, "matchMedia")` with their own implementation.
if (!window.matchMedia) {
  window.matchMedia = ((query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
});
