import { afterEach, describe, expect, it, vi } from "vitest";
import { logError, logWarn } from "./logger";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("logError", () => {
    it("calls console.error with a prefixed message, the error, and the context", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("boom");
      const context = { elevatorId: 1 };

      logError("Something went wrong", error, context);

      expect(spy).toHaveBeenCalledWith("[Riser] Something went wrong", error, context);
    });

    it("defaults context to an empty object when omitted", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("boom");

      logError("Something went wrong", error);

      expect(spy).toHaveBeenCalledWith("[Riser] Something went wrong", error, {});
    });
  });

  describe("logWarn", () => {
    it("calls console.warn with a prefixed message and the context", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const context = { status: "Bogus" };

      logWarn("Unrecognized status", context);

      expect(spy).toHaveBeenCalledWith("[Riser] Unrecognized status", context);
    });

    it("defaults context to an empty object when omitted", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

      logWarn("Unrecognized status");

      expect(spy).toHaveBeenCalledWith("[Riser] Unrecognized status", {});
    });
  });
});
