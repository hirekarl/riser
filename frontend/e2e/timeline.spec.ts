// e2e coverage for the Timeline tab's visual/interaction design pass
// (ui-ux-specialist-agent lane): status badges + urgency treatment on the
// Timeline table, and the tab switcher's active/inactive/focus states.
// Mocks the backend via route interception, same convention as
// ledger.spec.ts and keyboard-accessibility.spec.ts.
import { test, expect, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import type { Result } from "axe-core";

interface MockBuilding {
  id: number;
  name: string;
  address: string;
  created_at: string;
  updated_at: string;
}

interface MockElevator {
  id: number;
  building: number;
  device_identifier: string;
  inspection_type: "CAT1" | "CAT5";
  last_inspection_date: string;
  dob_device_number: string | null;
  created_at: string;
  updated_at: string;
}

function isoDateOffsetFromToday(days: number): string {
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  return new Date(today.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Pre-seeded mock: one elevator due very soon (Warning, day 3) and one due
 * comfortably later (Compliant, day 60) — enough to exercise the Timeline's
 * status badges, urgent-row treatment, and sort order without any UI-driven
 * setup. */
async function mockApiWithSeedData(page: Page) {
  const buildings: MockBuilding[] = [
    {
      id: 1,
      name: "Tower A",
      address: "1 Main St",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];
  const elevators: MockElevator[] = [
    {
      id: 1,
      building: 1,
      device_identifier: "EL-SOON",
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      dob_device_number: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: 2,
      building: 1,
      device_identifier: "EL-LATER",
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      dob_device_number: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];
  const dueDates: Record<number, string> = {
    1: isoDateOffsetFromToday(3),
    2: isoDateOffsetFromToday(60),
  };
  const statuses: Record<number, "Compliant" | "Warning"> = {
    1: "Warning",
    2: "Compliant",
  };

  await page.route("**/api/buildings/**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: buildings });
      return;
    }
    await route.continue();
  });

  await page.route("**/api/elevators/**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: elevators });
      return;
    }
    await route.continue();
  });

  await page.route("**/api/ledger/**", async (route) => {
    const entries = elevators.map((elevator) => {
      const building = buildings.find((b) => b.id === elevator.building);
      return {
        ...elevator,
        building_name: building?.name ?? "Unknown",
        due_date: dueDates[elevator.id],
        status: statuses[elevator.id],
      };
    });
    await route.fulfill({ json: entries });
  });
}

test("Timeline tab shows status badges and a distinct urgent treatment for a row due very soon, with zero axe violations", async ({
  page,
}) => {
  await mockApiWithSeedData(page);
  await page.goto("/");

  await page.getByRole("tab", { name: /^timeline$/i }).click();

  const soonRow = page.getByRole("row").filter({ hasText: "EL-SOON" });
  const laterRow = page.getByRole("row").filter({ hasText: "EL-LATER" });
  await expect(soonRow).toBeVisible();
  await expect(laterRow).toBeVisible();

  // Color is never the only signal: each row's status is also conveyed as
  // text (the badge's visible label), independent of the urgent-row tint.
  await expect(soonRow.getByText(/warning/i)).toBeVisible();
  await expect(laterRow.getByText(/compliant/i)).toBeVisible();

  // The due-very-soon row must be visually distinguishable from a row due
  // comfortably later, via a real computed style difference (not just a
  // class name that happens to not render anything).
  const [soonBackground, laterBackground] = await Promise.all([
    soonRow
      .locator("td")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    laterRow
      .locator("td")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ]);
  expect(soonBackground).not.toBe(laterBackground);

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = accessibilityScanResults.violations.filter((violation: Result) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(seriousOrCritical).toEqual([]);
});

test("the tab switcher shows a visibly distinct active tab and a visible focus ring, and is keyboard-operable", async ({
  page,
}) => {
  await mockApiWithSeedData(page);
  await page.goto("/");

  const ledgerTab = page.getByRole("tab", { name: /^ledger$/i });
  const timelineTab = page.getByRole("tab", { name: /^timeline$/i });

  const [ledgerBackgroundBefore, timelineBackgroundBefore] = await Promise.all([
    ledgerTab.evaluate((el) => getComputedStyle(el).backgroundColor),
    timelineTab.evaluate((el) => getComputedStyle(el).backgroundColor),
  ]);

  // Active (Ledger, by default) and inactive (Timeline) tabs must be
  // visually distinguishable from each other, not just via aria-selected.
  expect(ledgerBackgroundBefore).not.toBe(timelineBackgroundBefore);

  // Keyboard operability + a visible focus ring on the tab itself.
  await timelineTab.focus();
  const focusStyles = await timelineTab.evaluate((el) => {
    const s = getComputedStyle(el);
    return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth };
  });
  expect(focusStyles.outlineStyle).not.toBe("none");
  expect(focusStyles.outlineWidth).not.toBe("0px");

  await page.keyboard.press("Enter");
  await expect(timelineTab).toHaveAttribute("aria-selected", "true");

  // Once active, Timeline's own background must now match what Ledger's
  // active-state background was (the shared "selected" treatment), not stay
  // at its earlier inactive-state color. Polled because the background-color
  // change is animated (a short CSS transition), so it isn't instantaneous.
  await expect
    .poll(() => timelineTab.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe(ledgerBackgroundBefore);
});
