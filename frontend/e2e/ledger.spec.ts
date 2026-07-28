// This e2e test mocks the backend API via Playwright route interception for
// speed/determinism in CI. It never talks to the real Django backend — a
// manual full-stack pass against the live backend should happen before the
// actual demo.
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

const DAY_MS = 24 * 60 * 60 * 1000;

function addYears(dateStr: string, years: number): Date {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

// Matches the backend's Status enum values exactly (apps.compliance.services.Status) —
// capitalized, not the lowercase form used before this mock was cross-checked against
// the real API contract.
function computeStatus(dueDate: Date, now: Date): "Compliant" | "Warning" | "Delinquent" {
  const daysUntilDue = (dueDate.getTime() - now.getTime()) / DAY_MS;
  if (daysUntilDue < 0) return "Delinquent";
  if (daysUntilDue <= 30) return "Warning";
  return "Compliant";
}

/** Installs stateful mocks for /api/buildings/, /api/elevators/, and /api/ledger/. */
async function mockApi(page: Page) {
  let nextBuildingId = 1;
  let nextElevatorId = 1;
  const buildings: MockBuilding[] = [];
  const elevators: MockElevator[] = [];

  await page.route("**/api/buildings/**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ json: buildings });
      return;
    }
    if (request.method() === "POST") {
      const payload = request.postDataJSON() as { name: string; address: string };
      const building: MockBuilding = {
        id: nextBuildingId++,
        name: payload.name,
        address: payload.address,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      };
      buildings.push(building);
      await route.fulfill({ json: building });
      return;
    }
    await route.continue();
  });

  await page.route("**/api/elevators/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const idMatch = url.pathname.match(/\/elevators\/(\d+)\/?$/);

    if (request.method() === "POST") {
      const payload = request.postDataJSON() as {
        building: number;
        device_identifier: string;
        inspection_type: "CAT1" | "CAT5";
        last_inspection_date: string;
        dob_device_number?: string | null;
      };
      const elevator: MockElevator = {
        id: nextElevatorId++,
        dob_device_number: null,
        ...payload,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      };
      elevators.push(elevator);
      await route.fulfill({ json: elevator });
      return;
    }

    if (request.method() === "PATCH" && idMatch) {
      const id = Number(idMatch[1]);
      const payload = request.postDataJSON() as Partial<MockElevator>;
      const elevator = elevators.find((e) => e.id === id);
      if (elevator) {
        Object.assign(elevator, payload);
        await route.fulfill({ json: elevator });
        return;
      }
    }

    if (request.method() === "GET") {
      await route.fulfill({ json: elevators });
      return;
    }

    await route.continue();
  });

  await page.route("**/api/ledger/**", async (route) => {
    const now = new Date();
    const entries = elevators
      .map((elevator) => {
        const building = buildings.find((b) => b.id === elevator.building);
        const years = elevator.inspection_type === "CAT1" ? 1 : 5;
        const dueDate = addYears(elevator.last_inspection_date, years);
        const status = computeStatus(dueDate, now);
        return {
          ...elevator,
          building_name: building?.name ?? "Unknown",
          due_date: dueDate.toISOString().slice(0, 10),
          status,
        };
      })
      .sort((a, b) => {
        const rank = { Delinquent: 0, Warning: 1, Compliant: 2 } as const;
        if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
        return a.due_date.localeCompare(b.due_date);
      });
    await route.fulfill({ json: entries });
  });
}

test("generates an AI narration briefing on demand, showing a loading state then the narration text", async ({
  page,
}) => {
  await mockApi(page);

  let resolveNarration: (() => void) | undefined;
  const narrationRequestSeen = new Promise<void>((resolve) => {
    resolveNarration = resolve;
  });

  await page.route("**/api/ledger/narration/**", async (route) => {
    resolveNarration?.();
    // An artificial delay so the loading state is reliably observable by the
    // assertions below, comfortably longer than the round-trip/assertion
    // overhead that follows the click.
    await new Promise((r) => setTimeout(r, 1000));
    await route.fulfill({
      json: {
        narration: "Two elevators are delinquent and need attention this week.",
        generated_at: "2026-07-25T00:00:00Z",
      },
    });
  });

  await page.goto("/");

  // Scoped to the narration panel itself, since the ledger has its own
  // (unrelated) role="status" loading placeholder before it finishes loading.
  // The button is located by role only (not by accessible name) because its
  // label text itself changes to "Generating briefing…" while loading — a
  // name-filtered locator would otherwise auto-wait for the original
  // "Generate briefing" name to reappear, which only happens once the
  // request has already resolved, masking the disabled state entirely.
  const narrationPanel = page.getByRole("region", { name: /ai portfolio briefing/i });
  const generateButton = narrationPanel.getByRole("button");
  await expect(generateButton).toBeVisible();
  await expect(generateButton).toHaveAccessibleName(/generate briefing/i);

  await generateButton.click();

  // Loading state appears while the request is pending.
  await expect(narrationPanel.getByRole("status")).toBeVisible();
  await expect(generateButton).toBeDisabled();

  await narrationRequestSeen;

  // Narration text renders once the request resolves.
  await expect(
    page.getByText(/two elevators are delinquent and need attention this week/i),
  ).toBeVisible();
  await expect(generateButton).toBeEnabled();
  await expect(generateButton).toHaveAccessibleName(/generate briefing/i);

  // Accessibility: zero critical/serious violations with the narration rendered.
  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = accessibilityScanResults.violations.filter((violation: Result) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(seriousOrCritical).toEqual([]);
});

test("full add building -> add elevator -> status color -> edit date -> status updates flow", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/");

  // Empty state renders with clear instructions.
  await expect(page.getByText(/no elevators yet/i)).toBeVisible();
  await expect(page.getByText(/look up your first building by address/i)).toBeVisible();

  // Add a building.
  const buildingForm = page.getByRole("form", { name: /^add a building$/i });
  await buildingForm.getByLabel(/building name/i).fill("Tower A");
  await buildingForm.getByLabel(/address/i).fill("1 Main St");
  await page.getByRole("button", { name: /add building/i }).click();

  const elevatorForm = page.getByRole("form", { name: /add an elevator/i });
  await expect(elevatorForm.getByLabel(/^building$/i)).toBeEnabled();

  // Add an elevator with an old last-inspection date so it starts Delinquent
  // (CAT1 due date = last inspection + 1 year, long past).
  await elevatorForm.getByLabel(/device identifier/i).fill("EL-1");
  await elevatorForm.getByLabel(/inspection type/i).selectOption("CAT1");
  await elevatorForm.getByLabel(/last inspection date/i).fill("2020-01-01");
  await elevatorForm.getByRole("button", { name: /add elevator/i }).click();

  // Ledger shows the new elevator with a Delinquent status, high-contrast red.
  const row = page.getByRole("row").filter({ hasText: "EL-1" });
  await expect(row).toBeVisible();
  await expect(row.getByText(/delinquent/i)).toBeVisible();

  // Edit the last-inspection date to today; status/color/rank must update
  // immediately once confirmed (no page reload), per the PRD's "demo moment"
  // requirement. Editing the inline date field requires an explicit Save —
  // it no longer auto-commits on change.
  await row
    .getByLabel(/last inspection date for el-1/i)
    .fill(new Date().toISOString().slice(0, 10));
  await row.getByRole("button", { name: /save inspection date for el-1/i }).click();

  await expect(row.getByText(/compliant/i)).toBeVisible();
  await expect(row.getByText(/delinquent/i)).not.toBeVisible();

  // Accessibility: zero critical/serious violations on the populated ledger.
  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = accessibilityScanResults.violations.filter((violation: Result) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(seriousOrCritical).toEqual([]);
});

test("edit an elevator via the ledger row's Edit button, updating its device identifier and status live", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/");

  // Add a building.
  const buildingForm = page.getByRole("form", { name: /^add a building$/i });
  await buildingForm.getByLabel(/building name/i).fill("Tower A");
  await buildingForm.getByLabel(/address/i).fill("1 Main St");
  await page.getByRole("button", { name: /add building/i }).click();

  const elevatorForm = page.getByRole("form", { name: /add an elevator/i });
  await expect(elevatorForm.getByLabel(/^building$/i)).toBeEnabled();

  // Add an elevator with an old last-inspection date so it starts Delinquent.
  await elevatorForm.getByLabel(/device identifier/i).fill("EL-1");
  await elevatorForm.getByLabel(/inspection type/i).selectOption("CAT1");
  await elevatorForm.getByLabel(/last inspection date/i).fill("2020-01-01");
  await elevatorForm.getByRole("button", { name: /add elevator/i }).click();

  const row = page.getByRole("row").filter({ hasText: "EL-1" });
  await expect(row).toBeVisible();
  await expect(row.getByText(/delinquent/i)).toBeVisible();

  // Open the full edit form for this row.
  await row.getByRole("button", { name: /edit el-1/i }).click();

  const editForm = page.getByRole("form", { name: /edit an elevator/i });
  await expect(editForm).toBeVisible();
  await expect(editForm.getByLabel(/device identifier/i)).toHaveValue("EL-1");

  // The primary "Save changes" action and the secondary "Cancel" action
  // must be visually distinguishable (not just by label), so a user
  // scanning the form can tell the committing action from the discard one.
  const saveButton = editForm.getByRole("button", { name: /save changes/i });
  const cancelButton = editForm.getByRole("button", { name: /^cancel$/i });
  const [saveStyles, cancelStyles] = await Promise.all([
    saveButton.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, fontWeight: s.fontWeight };
    }),
    cancelButton.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, fontWeight: s.fontWeight };
    }),
  ]);
  expect(saveStyles.background).not.toBe(cancelStyles.background);
  expect(saveStyles.fontWeight).not.toBe(cancelStyles.fontWeight);

  // Accessibility: zero critical/serious violations while both actions
  // (and their color/contrast treatment) are visible together.
  const editFormScanResults = await new AxeBuilder({ page }).analyze();
  const editFormSeriousOrCritical = editFormScanResults.violations.filter((violation: Result) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(editFormSeriousOrCritical).toEqual([]);

  // Change the device identifier and bring the last-inspection date current,
  // so status/due-date/rank should recompute on save.
  await editForm.getByLabel(/device identifier/i).fill("EL-1-RENAMED");
  await editForm.getByLabel(/last inspection date/i).fill(new Date().toISOString().slice(0, 10));
  await editForm.getByRole("button", { name: /save changes/i }).click();

  // The form reverts to create mode after a successful save.
  await expect(page.getByRole("form", { name: /add an elevator/i })).toBeVisible();

  // The ledger reflects the renamed device and its new, live-updated status.
  const updatedRow = page.getByRole("row").filter({ hasText: "EL-1-RENAMED" });
  await expect(updatedRow).toBeVisible();
  await expect(updatedRow.getByText(/compliant/i)).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: /^EL-1$/ })).toHaveCount(0);
  // Scoped to the ledger table itself (not the whole page): the page also
  // always contains the word "Delinquent" in the collapsed status-meaning
  // legend, and — since the status filter dropdown added its own
  // `<option>Delinquent</option>` — an unscoped page-wide locator here is
  // ambiguous (a Playwright strict-mode violation) even though neither of
  // those is the ledger row this assertion actually cares about.
  await expect(page.getByRole("table").getByText(/delinquent/i)).not.toBeVisible();

  // Accessibility: zero critical/serious violations after the edit flow.
  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = accessibilityScanResults.violations.filter((violation: Result) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(seriousOrCritical).toEqual([]);
});

test("visually marks the row currently open in the Edit form, distinct from other rows", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/");

  const buildingForm = page.getByRole("form", { name: /^add a building$/i });
  await buildingForm.getByLabel(/building name/i).fill("Tower A");
  await buildingForm.getByLabel(/address/i).fill("1 Main St");
  await page.getByRole("button", { name: /add building/i }).click();

  const elevatorForm = page.getByRole("form", { name: /add an elevator/i });
  await expect(elevatorForm.getByLabel(/^building$/i)).toBeEnabled();

  // Two elevators so there's an edited row and an unedited row to compare.
  await elevatorForm.getByLabel(/device identifier/i).fill("EL-1");
  await elevatorForm.getByLabel(/inspection type/i).selectOption("CAT1");
  await elevatorForm.getByLabel(/last inspection date/i).fill("2020-01-01");
  await elevatorForm.getByRole("button", { name: /add elevator/i }).click();

  await expect(elevatorForm.getByLabel(/^building$/i)).toBeEnabled();
  await elevatorForm.getByLabel(/device identifier/i).fill("EL-2");
  await elevatorForm.getByLabel(/inspection type/i).selectOption("CAT1");
  await elevatorForm.getByLabel(/last inspection date/i).fill("2020-01-01");
  await elevatorForm.getByRole("button", { name: /add elevator/i }).click();

  const editedRow = page.getByRole("row").filter({ hasText: "EL-1" });
  const otherRow = page.getByRole("row").filter({ hasText: "EL-2" });
  await expect(editedRow).toBeVisible();
  await expect(otherRow).toBeVisible();

  const backgroundBefore = await editedRow
    .locator("td")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);

  await editedRow.getByRole("button", { name: /edit el-1/i }).click();
  await expect(page.getByRole("form", { name: /edit an elevator/i })).toBeVisible();

  const backgroundDuringEdit = await editedRow
    .locator("td")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  const otherRowBackground = await otherRow
    .locator("td")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);

  // The row under edit must gain a visually distinct background once its
  // Edit form opens, while a row not being edited stays unaffected.
  expect(backgroundDuringEdit).not.toBe(backgroundBefore);
  expect(backgroundDuringEdit).not.toBe(otherRowBackground);

  // Accessibility: zero critical/serious violations with the edited-row
  // treatment and the edit form both visible at once.
  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = accessibilityScanResults.violations.filter((violation: Result) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(seriousOrCritical).toEqual([]);
});

test("ledger table does not cause horizontal page overflow on a narrow (phone-width) viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/");

  // Add a building.
  const buildingForm = page.getByRole("form", { name: /^add a building$/i });
  await buildingForm.getByLabel(/building name/i).fill("Tower A");
  await buildingForm.getByLabel(/address/i).fill("1 Main St");
  await page.getByRole("button", { name: /add building/i }).click();

  const elevatorForm = page.getByRole("form", { name: /add an elevator/i });
  await expect(elevatorForm.getByLabel(/^building$/i)).toBeEnabled();

  // Add an elevator so the ledger table (with its six columns) actually renders.
  await elevatorForm.getByLabel(/device identifier/i).fill("EL-1");
  await elevatorForm.getByLabel(/inspection type/i).selectOption("CAT1");
  await elevatorForm.getByLabel(/last inspection date/i).fill("2020-01-01");
  await elevatorForm.getByRole("button", { name: /add elevator/i }).click();

  const row = page.getByRole("row").filter({ hasText: "EL-1" });
  await expect(row).toBeVisible();

  // The page itself must not require horizontal scrolling at phone width, even
  // though the ledger table is wide — the table should scroll within its own
  // bounded container instead of blowing out the whole page's width.
  //
  // Note: this deliberately checks document.body's scroll metrics, not
  // document.documentElement's. On Chromium and WebKit, a flex-item
  // descendant with `overflow-x: auto` and wide content can make
  // documentElement.scrollWidth report a value larger than clientWidth even
  // when nothing is actually scrollable (confirmed directly: real user
  // horizontal scroll input via a WebKit-native drag left window.scrollX at
  // 0 both before and after this assertion; document.body's metrics tracked
  // that real, observable behavior correctly in all three engines, while
  // documentElement's did not). body.scrollWidth is the metric that actually
  // corresponds to "does the page require horizontal scrolling."
  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  const clientWidth = await page.evaluate(() => document.body.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

  // Belt-and-suspenders: assert the page truly cannot be scrolled
  // horizontally, which is the actual, real-world symptom this test guards
  // against (this is what caught a residual WebKit-only regression that the
  // static scrollWidth/clientWidth check above did not: WebKit could still
  // be dragged 52px to the right even once documentElement's reported
  // scrollWidth no longer changed).
  await page.mouse.wheel(500, 0);
  const scrollXAfterAttempt = await page.evaluate(() => window.scrollX);
  expect(scrollXAfterAttempt).toBe(0);
});
