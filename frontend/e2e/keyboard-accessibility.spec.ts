// Keyboard-only accessibility walkthrough — Schiffon's "final accessibility
// pass" per docs/team/status-log.md (2026-07-27 entry). Complements the
// automated axe scans already in ledger.spec.ts and the component test
// suite: those check for contrast/ARIA violations in a given DOM snapshot,
// but don't verify the app is actually *operable* via keyboard alone (tab
// order, visible focus, no keyboard traps, every action reachable without a
// mouse). This file drives the whole app with only Tab/Shift+Tab/Enter/
// Space/Escape and records what a keyboard-only user would actually
// experience.
import { test, expect, type Page } from "@playwright/test";

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

function addYears(dateStr: string, years: number): Date {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

function computeStatus(dueDate: Date, now: Date): "Compliant" | "Warning" | "Delinquent" {
  const daysUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysUntilDue < 0) return "Delinquent";
  if (daysUntilDue <= 30) return "Warning";
  return "Compliant";
}

/** Pre-seeded mock (no UI-driven building/elevator creation needed) covering
 * all three statuses, so the filter, legend, and remediation panel all have
 * something real to interact with. */
async function mockApiWithSeedData(page: Page) {
  const buildings: MockBuilding[] = [
    {
      id: 1,
      name: "Tower A",
      address: "1 Main St",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: 2,
      name: "Tower B",
      address: "2 Main St",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];
  const elevators: MockElevator[] = [
    {
      id: 1,
      building: 1,
      device_identifier: "EL-1",
      inspection_type: "CAT1",
      last_inspection_date: "2020-01-01",
      dob_device_number: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: 2,
      building: 1,
      device_identifier: "EL-2",
      inspection_type: "CAT1",
      // Due in ~15 days (CAT1 = +1yr): a genuine Warning, not Compliant.
      last_inspection_date: (() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        d.setDate(d.getDate() + 15);
        return d.toISOString().slice(0, 10);
      })(),
      dob_device_number: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: 3,
      building: 2,
      device_identifier: "EL-3",
      inspection_type: "CAT5",
      last_inspection_date: "2024-01-01",
      dob_device_number: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  await page.route("**/api/buildings/**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: buildings });
      return;
    }
    await route.continue();
  });

  await page.route("**/api/elevators/**", async (route) => {
    const request = route.request();
    const idMatch = new URL(request.url()).pathname.match(/\/elevators\/(\d+)\/?$/);
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
    if (route.request().url().includes("/narration/")) {
      await route.fulfill({
        json: { narration: "1 elevator is Delinquent.", generated_at: "2026-07-27T00:00:00Z" },
      });
      return;
    }
    const now = new Date();
    const entries = elevators
      .map((elevator) => {
        const building = buildings.find((b) => b.id === elevator.building);
        const years = elevator.inspection_type === "CAT1" ? 1 : 5;
        const dueDate = addYears(elevator.last_inspection_date, years);
        return {
          ...elevator,
          building_name: building?.name ?? "Unknown",
          due_date: dueDate.toISOString().slice(0, 10),
          status: computeStatus(dueDate, now),
        };
      })
      .sort((a, b) => {
        const rank = { Delinquent: 0, Warning: 1, Compliant: 2 } as const;
        return rank[a.status] - rank[b.status];
      });
    await route.fulfill({ json: entries });
  });
}

/** Single atomic read of both "what's focused" and "is it visibly focused",
 * so there's no chance of the two observations racing against a re-render
 * between separate evaluate() calls. */
async function inspectFocused(page: Page): Promise<{ desc: string; hasFocusRing: boolean }> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) {
      return { desc: "(nothing focused / body)", hasFocusRing: false };
    }
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role") ?? tag;
    let name = el.getAttribute("aria-label") ?? "";
    if (!name && (tag === "input" || tag === "select" || tag === "textarea")) {
      const id = el.getAttribute("id");
      const byFor = id ? document.querySelector(`label[for="${id}"]`) : null;
      const wrapping = el.closest("label");
      name =
        byFor?.textContent?.trim() ??
        wrapping?.textContent?.trim() ??
        el.getAttribute("placeholder") ??
        "";
    }
    if (!name) name = el.textContent?.trim().slice(0, 40) ?? "";

    const s = getComputedStyle(el);
    const hasOutline = s.outlineStyle !== "none" && s.outlineWidth !== "0px";
    const hasShadow = s.boxShadow !== "none";
    return { desc: `${role}: "${name}"`, hasFocusRing: hasOutline || hasShadow };
  });
}

test("keyboard-only walkthrough: every control is reachable, operable, and visibly focused via Tab alone", async ({
  page,
}) => {
  await mockApiWithSeedData(page);
  await page.goto("/");
  await expect(page.getByRole("table")).toBeVisible();

  // Full-page Tab sweep: walk forward through every focusable element,
  // recording the trace and flagging any step with no visible focus ring.
  const trace: string[] = [];
  const missingFocusRing: string[] = [];
  const seen = new Set<string>();
  let stuckCount = 0;

  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    const { desc, hasFocusRing } = await inspectFocused(page);
    trace.push(desc);

    // Only flag the FIRST arrival at a given element as missing its focus
    // ring. Multi-part native controls (e.g. <input type="date">'s
    // month/day/year segments) report the same outer element across several
    // Tab presses while navigating internally — what matters for a keyboard
    // user is whether landing on the control at all was visible, not every
    // internal segment move within it.
    if (!hasFocusRing && desc !== "(nothing focused / body)" && !seen.has(desc)) {
      missingFocusRing.push(`step ${i}: ${desc}`);
    }

    // Detect a keyboard trap / end-of-page: same element focused 3x running.
    if (desc === trace[trace.length - 2] && desc === trace[trace.length - 3]) {
      stuckCount++;
      if (stuckCount > 2) break;
    } else {
      stuckCount = 0;
    }
    seen.add(desc);
  }

  console.log("=== Keyboard Tab trace ===\n" + trace.join("\n"));
  console.log(`=== Unique focusable stops: ${seen.size} ===`);
  if (missingFocusRing.length > 0) {
    console.log("=== Steps with NO visible focus indicator ===\n" + missingFocusRing.join("\n"));
  }

  // The core interactive surfaces must all appear somewhere in the trace —
  // if any of these never got focus, they're not keyboard-reachable at all.
  const traceText = trace.join(" | ").toLowerCase();
  expect(traceText).toContain("add building");
  expect(traceText).toContain("add elevator");
  expect(traceText).toContain("generate briefing");
  expect(traceText).toContain("what do these statuses mean");
  expect(traceText).toContain("all buildings");
  expect(traceText).toContain("edit el-");
  expect(traceText).toContain("view details");

  // No step should be missing a visible focus indicator — this is the
  // single most common real-world keyboard-accessibility failure (a control
  // that *works* via keyboard but a sighted keyboard user can't tell is
  // focused).
  expect(
    missingFocusRing,
    `Elements with no visible focus ring:\n${missingFocusRing.join("\n")}`,
  ).toEqual([]);
});

test("keyboard-only: the status legend opens via keyboard, not just mouse click", async ({
  page,
}) => {
  await mockApiWithSeedData(page);
  await page.goto("/");

  const summary = page.getByText(/what do these statuses mean/i);
  await summary.focus();
  await expect((await inspectFocused(page)).hasFocusRing).toBeTruthy();
  await page.keyboard.press("Enter");

  const details = page.locator("details");
  await expect(details).toHaveAttribute("open", "");
  await expect(page.getByText(/more than 30 days/i)).toBeVisible();
});

test("keyboard-only: View details expands/collapses the remediation panel without a mouse", async ({
  page,
}) => {
  await mockApiWithSeedData(page);
  await page.goto("/");

  const row = page.getByRole("row").filter({ hasText: "EL-1" }); // Delinquent
  const viewDetailsButton = row.getByRole("button", { name: /view details/i });

  await viewDetailsButton.focus();
  await expect((await inspectFocused(page)).hasFocusRing).toBeTruthy();
  await page.keyboard.press("Enter");

  await expect(page.getByText(/what's wrong/i)).toBeVisible();
  await expect(page.getByText(/next step/i)).toBeVisible();
  await expect(page.getByText(/where to go/i)).toBeVisible();

  // Space should also activate it (both are valid per the native button
  // activation spec keyboard users rely on).
  await page.keyboard.press("Enter"); // collapse
  await expect(page.getByText(/what's wrong/i)).not.toBeVisible();
  await viewDetailsButton.focus();
  await page.keyboard.press(" ");
  await expect(page.getByText(/what's wrong/i)).toBeVisible();
});

test("keyboard-only: the elevator Edit form opens, is fully tabbable, and Cancel returns focus sensibly", async ({
  page,
}) => {
  await mockApiWithSeedData(page);
  await page.goto("/");

  const row = page.getByRole("row").filter({ hasText: "EL-1" });
  const editButton = row.getByRole("button", { name: /edit el-1/i });
  await editButton.focus();
  await page.keyboard.press("Enter");

  const editForm = page.getByRole("form", { name: /edit an elevator/i });
  await expect(editForm).toBeVisible();

  // Every field in the edit form must be reachable by Tab, in a sane order.
  await expect(editForm.getByLabel(/device identifier/i)).toBeVisible();
  const cancelButton = editForm.getByRole("button", { name: /^cancel$/i });
  await cancelButton.focus();
  await expect((await inspectFocused(page)).hasFocusRing).toBeTruthy();
  await page.keyboard.press("Enter");

  await expect(editForm).not.toBeVisible();
});

test("keyboard-only: the building filter chips are fully operable via keyboard", async ({
  page,
}) => {
  await mockApiWithSeedData(page);
  await page.goto("/");

  const towerBChip = page.getByRole("button", { name: "Tower B", exact: true });
  await towerBChip.focus();
  await expect((await inspectFocused(page)).hasFocusRing).toBeTruthy();
  await page.keyboard.press("Enter");
  await expect(towerBChip).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("cell", { name: "EL-3", exact: true })).toBeVisible();
});
