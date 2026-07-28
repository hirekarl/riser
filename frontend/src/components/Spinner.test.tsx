import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Spinner } from "./Spinner";

describe("Spinner", () => {
  it("is purely decorative — hidden from assistive tech", () => {
    render(<Spinner />);
    const spinner = document.querySelector("[aria-hidden='true']");
    expect(spinner).toBeInTheDocument();
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(
      <p role="status">
        <Spinner /> Loading…
      </p>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
