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
  bin: string | null;
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
      const payload = request.postDataJSON() as { name: string; address: string; bin?: string };
      const building: MockBuilding = {
        id: nextBuildingId++,
        name: payload.name,
        address: payload.address,
        bin: payload.bin ?? null,
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

/** Switches to the outer "Manage Portfolio" tab, where the address-lookup
 * form, the manual building/elevator forms, and the buildings list now live
 * — they only exist in the DOM (and are only interactable) while this outer
 * tab is active. Scoped through the outer tablist's distinct aria-label
 * since the inner Ledger/Timeline tab pair also has a "Ledger"-named tab. */
async function goToManagePortfolio(page: Page) {
  await page
    .getByRole("tablist", { name: /portfolio sections/i })
    .getByRole("tab", { name: /manage portfolio/i })
    .click();
}

/** Switches back to the outer "Ledger" tab, where the stat band, AI
 * narration panel, and the inner Ledger/Timeline tab pair live. */
async function goToOuterLedger(page: Page) {
  await page
    .getByRole("tablist", { name: /portfolio sections/i })
    .getByRole("tab", { name: /^ledger$/i })
    .click();
}

/** Adds a building via the "Add a building" form — mirrors the inline
 * add-building steps repeated across this file's existing tests. Navigates
 * to the outer "Manage Portfolio" tab first, since that's the only place
 * this form is reachable. */
async function addBuilding(page: Page, name: string, address: string) {
  await goToManagePortfolio(page);
  const buildingForm = page.getByRole("form", { name: /^add a building$/i });
  await buildingForm.getByLabel(/building name/i).fill(name);
  await buildingForm.getByLabel(/address/i).fill(address);
  await page.getByRole("button", { name: /add building/i }).click();
}

/** Adds an elevator to the given (already-added) building via the "Add an
 * elevator" form. Explicitly selects the building, unlike this file's
 * existing single-building tests which rely on the form's default
 * first-building selection. Navigates to the outer "Manage Portfolio" tab
 * first, since that's the only place this form is reachable. */
async function addElevator(
  page: Page,
  building: string,
  deviceId: string,
  inspectionType: "CAT1" | "CAT5",
  lastInspectionDate: string,
) {
  await goToManagePortfolio(page);
  const elevatorForm = page.getByRole("form", { name: /add an elevator/i });
  await expect(elevatorForm.getByLabel(/^building$/i)).toBeEnabled();
  await elevatorForm.getByLabel(/^building$/i).selectOption({ label: building });
  await elevatorForm.getByLabel(/device identifier/i).fill(deviceId);
  await elevatorForm.getByLabel(/inspection type/i).selectOption(inspectionType);
  await elevatorForm.getByLabel(/last inspection date/i).fill(lastInspectionDate);
  await elevatorForm.getByRole("button", { name: /add elevator/i }).click();
}

/** Seeds two buildings and three elevators whose statuses land, by
 * construction, as Delinquent (EL-1, Tower A), Warning (EL-3, Tower B), and
 * Compliant (EL-2, Tower A) — giving the search/group-by-building tests a
 * real, non-trivial urgency order and building split to assert against. */
async function seedTwoBuildingsThreeElevators(page: Page) {
  await addBuilding(page, "Tower A", "1 Main St");
  await addBuilding(page, "Tower B", "2 Main St");

  // Far in the past -> CAT1 due date (last inspection + 1yr) long passed.
  await addElevator(page, "Tower A", "EL-1", "CAT1", "2020-01-01");

  // Due in ~15 days -> a genuine Warning (CAT5 = last inspection + 5yr).
  const warningDate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 5);
    d.setDate(d.getDate() + 15);
    return d.toISOString().slice(0, 10);
  })();
  await addElevator(page, "Tower B", "EL-3", "CAT5", warningDate);

  // Inspected today -> CAT1 due date a year out, comfortably Compliant.
  await addElevator(page, "Tower A", "EL-2", "CAT1", new Date().toISOString().slice(0, 10));
}

test("search box narrows the ledger table by device id and by building name, and clearing it restores the full list", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/");
  await seedTwoBuildingsThreeElevators(page);
  await goToOuterLedger(page);

  await expect(page.getByRole("cell", { name: "EL-1", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "EL-2", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "EL-3", exact: true })).toBeVisible();

  const searchBox = page.getByLabel(/search ledger/i);

  // Narrows by device id.
  await searchBox.fill("EL-3");
  await expect(page.getByRole("cell", { name: "EL-3", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "EL-1", exact: true })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "EL-2", exact: true })).toHaveCount(0);

  // Narrows by building name (both Tower A devices match; Tower B's doesn't).
  await searchBox.fill("Tower A");
  await expect(page.getByRole("cell", { name: "EL-1", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "EL-2", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "EL-3", exact: true })).toHaveCount(0);

  // Clearing the box restores the full, unfiltered list.
  await searchBox.fill("");
  await expect(page.getByRole("cell", { name: "EL-1", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "EL-2", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "EL-3", exact: true })).toBeVisible();
});

test("group-by-building groups rows under building headers, preserves urgency order within/across groups, and row actions still work on a grouped row", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/");
  await seedTwoBuildingsThreeElevators(page);
  await goToOuterLedger(page);

  const table = page.getByRole("table");

  // Ungrouped: server-sorted purely by urgency — Delinquent (EL-1) > Warning
  // (EL-3) > Compliant (EL-2) — regardless of building.
  const deviceOrderBefore = (await table.getByRole("row").allTextContents())
    .map((text) => (text.match(/EL-\d/) ?? [])[0])
    .filter((id): id is string => Boolean(id));
  expect(deviceOrderBefore).toEqual(["EL-1", "EL-3", "EL-2"]);

  const groupToggle = page.getByLabel(/group by building/i);
  // The toggle's real `<input type="checkbox">` is visually hidden in favor
  // of the adjacent custom switch graphic (see .groupToggle input in
  // LedgerPage.module.css) — force bypasses Playwright's hit-target
  // visibility check while still dispatching a real click/change on the
  // input itself, exactly like a user clicking the visible switch does.
  await groupToggle.check({ force: true });

  await expect(page.getByRole("row").filter({ hasText: /Tower A — 2 devices/ })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: /Tower B — 1 device/ })).toBeVisible();

  // Grouped: Tower A's group leads (its EL-1 was the first-appearing entry
  // in the urgency-sorted list), and within it EL-1 (Delinquent) still comes
  // before EL-2 (Compliant) — regrouping by building must never scramble the
  // existing urgency order within or across groups.
  const deviceOrderAfter = (await table.getByRole("row").allTextContents())
    .map((text) => (text.match(/EL-\d/) ?? [])[0])
    .filter((id): id is string => Boolean(id));
  expect(deviceOrderAfter).toEqual(["EL-1", "EL-2", "EL-3"]);

  // A row action (Edit) still works correctly on a row rendered inside a
  // group — a real regression risk if renderEntryRow()'s extraction ever
  // mismatched entries when called from the grouped code path.
  const groupedRowForEl2 = page.getByRole("row").filter({ hasText: "EL-2" });
  await groupedRowForEl2.getByRole("button", { name: /edit el-2/i }).click();

  const editForm = page.getByRole("form", { name: /edit an elevator/i });
  await expect(editForm).toBeVisible();
  await expect(editForm.getByLabel(/device identifier/i)).toHaveValue("EL-2");

  await editForm.getByLabel(/device identifier/i).fill("EL-2-RENAMED");
  await editForm.getByRole("button", { name: /save changes/i }).click();

  await expect(page.getByRole("form", { name: /add an elevator/i })).toBeVisible();

  // Edit auto-navigated away to the outer "Manage Portfolio" tab, unmounting
  // (not just hiding) the outer Ledger panel — LedgerPage's own local
  // group-by-building state is lost with it, so re-enable it after switching
  // back rather than assuming it survived the round trip.
  await goToOuterLedger(page);
  await expect(page.getByRole("cell", { name: "EL-2-RENAMED", exact: true })).toBeVisible();
  await groupToggle.check({ force: true });
  // The renamed row is still correctly grouped under Tower A afterward.
  await expect(page.getByRole("row").filter({ hasText: /Tower A — 2 devices/ })).toBeVisible();
});

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
  await goToManagePortfolio(page);
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
  await goToOuterLedger(page);
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
  await goToManagePortfolio(page);
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

  await goToOuterLedger(page);
  const row = page.getByRole("row").filter({ hasText: "EL-1" });
  await expect(row).toBeVisible();
  await expect(row.getByText(/delinquent/i)).toBeVisible();

  // Open the full edit form for this row — this auto-navigates the browser
  // to the outer "Manage Portfolio" tab, since that's where the edit form
  // (ElevatorForm) now lives.
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

  // The form reverts to create mode after a successful save. Still on the
  // outer "Manage Portfolio" tab (Save does not auto-navigate back), so the
  // ledger table itself is unreachable until switching back.
  await expect(page.getByRole("form", { name: /add an elevator/i })).toBeVisible();
  await goToOuterLedger(page);

  // The ledger reflects the renamed device and its new, live-updated status.
  const updatedRow = page.getByRole("row").filter({ hasText: "EL-1-RENAMED" });
  await expect(updatedRow).toBeVisible();
  await expect(updatedRow.getByText(/compliant/i)).toBeVisible();
  // Cell-scoped (not row-scoped): an anchored regex against a row's entire
  // concatenated cell text (e.g. `hasText: /^EL-1$/`) can never match once
  // other cells (status/date/etc.) are present, so it would pass trivially
  // regardless of whether the rename actually happened.
  await expect(page.getByRole("cell", { name: "EL-1", exact: true })).toHaveCount(0);
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

  await goToManagePortfolio(page);
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

  await goToOuterLedger(page);
  const editedRow = page.getByRole("row").filter({ hasText: "EL-1" });
  const otherRow = page.getByRole("row").filter({ hasText: "EL-2" });
  await expect(editedRow).toBeVisible();
  await expect(otherRow).toBeVisible();

  const backgroundBefore = await editedRow
    .locator("td")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);

  // Opening the Edit form auto-navigates to the outer "Manage Portfolio" tab,
  // unmounting the outer Ledger panel (and the row within it) entirely — so
  // switch back before re-inspecting the row's background.
  await editedRow.getByRole("button", { name: /edit el-1/i }).click();
  await expect(page.getByRole("form", { name: /edit an elevator/i })).toBeVisible();
  await goToOuterLedger(page);

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
  // treatment visible on the outer Ledger tab (the edit form itself is on
  // the outer Manage Portfolio tab, unmounted here, per the auto-navigate
  // behavior above).
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
  await goToManagePortfolio(page);
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

  await goToOuterLedger(page);
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
