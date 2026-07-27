import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useIsMounted } from "./useIsMounted";

describe("useIsMounted", () => {
  it("reports true while mounted and false after unmount", () => {
    const { result, unmount } = renderHook(() => useIsMounted());

    expect(result.current()).toBe(true);

    unmount();

    expect(result.current()).toBe(false);
  });
});
