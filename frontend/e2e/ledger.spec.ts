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
      };
      const elevator: MockElevator = {
        id: nextElevatorId++,
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

test("full add building -> add elevator -> status color -> edit date -> status updates flow", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/");

  // Empty state renders with clear instructions.
  await expect(page.getByText(/no elevators yet/i)).toBeVisible();
  await expect(page.getByText(/add your first building/i)).toBeVisible();

  // Add a building.
  await page.getByLabel(/building name/i).fill("Tower A");
  await page.getByLabel(/address/i).fill("1 Main St");
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
  // immediately, with no page reload, per the PRD's "demo moment" requirement.
  await row
    .getByLabel(/last inspection date for el-1/i)
    .fill(new Date().toISOString().slice(0, 10));

  await expect(row.getByText(/compliant/i)).toBeVisible();
  await expect(row.getByText(/delinquent/i)).not.toBeVisible();

  // Accessibility: zero critical/serious violations on the populated ledger.
  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = accessibilityScanResults.violations.filter((violation: Result) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(seriousOrCritical).toEqual([]);
});
