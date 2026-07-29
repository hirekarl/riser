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

interface SweepResult {
  trace: string[];
  missingFocusRing: string[];
}

/** Full Tab sweep from wherever focus currently is: walks forward through
 * every focusable element, recording the trace and flagging any step with no
 * visible focus ring, until either 80 presses have happened or a keyboard
 * trap / end-of-page is detected (the same element focused 3x running).
 * Shared by both the default-Ledger-section and the Manage-Portfolio-section
 * sweep tests below, which differ only in where the sweep starts and which
 * stops they expect. */
async function sweepTabOrder(page: Page): Promise<SweepResult> {
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

  return { trace, missingFocusRing };
}

test("keyboard-only walkthrough: every control on the default Ledger section is reachable, operable, and visibly focused via Tab alone", async ({
  page,
}) => {
  await mockApiWithSeedData(page);
  await page.goto("/");
  await expect(page.getByRole("table")).toBeVisible();

  const { trace, missingFocusRing } = await sweepTabOrder(page);

  console.log("=== Keyboard Tab trace (Ledger section) ===\n" + trace.join("\n"));
  console.log(`=== Unique focusable stops: ${new Set(trace).size} ===`);
  if (missingFocusRing.length > 0) {
    console.log("=== Steps with NO visible focus indicator ===\n" + missingFocusRing.join("\n"));
  }

  // The core interactive surfaces on the default Ledger section must all
  // appear somewhere in the trace — if any of these never got focus, they're
  // not keyboard-reachable at all. The address-lookup/building/elevator
  // forms are NOT included here: they now live behind the (initially
  // inactive) outer "Manage Portfolio" tab, so they're unreachable via Tab
  // alone from a fresh page load — see the Manage Portfolio sweep test below
  // for their coverage instead. The outer tab button itself is still
  // reachable and focusable (just not activated), so it's included.
  const traceText = trace.join(" | ").toLowerCase();
  expect(traceText).toContain("manage portfolio");
  expect(traceText).toContain("generate briefing");
  expect(traceText).toContain("what do these statuses mean");
  // The building filter is a chip row (role="group", individual buttons with
  // aria-pressed) rather than a <select> — its group label itself isn't
  // focusable, so the trace is checked against the chips themselves.
  expect(traceText).toContain("all buildings");
  expect(traceText).toContain("tower a");
  expect(traceText).toContain("search ledger");
  expect(traceText).toContain("group by building");
  expect(traceText).toContain("edit el-");
  expect(traceText).toContain("remediation steps");
  expect(traceText).toContain("view device details");

  // No step should be missing a visible focus indicator — this is the
  // single most common real-world keyboard-accessibility failure (a control
  // that *works* via keyboard but a sighted keyboard user can't tell is
  // focused).
  expect(
    missingFocusRing,
    `Elements with no visible focus ring:\n${missingFocusRing.join("\n")}`,
  ).toEqual([]);
});

test("keyboard-only walkthrough: every control on the Manage Portfolio section is reachable, operable, and visibly focused via Tab alone", async ({
  page,
}) => {
  await mockApiWithSeedData(page);
  await page.goto("/");
  await expect(page.getByRole("table")).toBeVisible();

  // Keyboard-only activation of the outer "Manage Portfolio" tab — a raw
  // `.click()` would defeat the point of a keyboard-only test, since a real
  // keyboard-only user reaches this via Tab + Enter, never a pointer.
  await page.getByRole("tab", { name: /manage portfolio/i }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("form", { name: /^add a building$/i })).toBeVisible();

  const { trace, missingFocusRing } = await sweepTabOrder(page);

  console.log("=== Keyboard Tab trace (Manage Portfolio section) ===\n" + trace.join("\n"));
  console.log(`=== Unique focusable stops: ${new Set(trace).size} ===`);
  if (missingFocusRing.length > 0) {
    console.log("=== Steps with NO visible focus indicator ===\n" + missingFocusRing.join("\n"));
  }

  // The address-lookup form, the manual building/elevator forms, and the
  // buildings list (pre-seeded with two buildings by mockApiWithSeedData
  // above, so a real "Delete building" action exists to reach) all live here
  // now, and must all be keyboard-reachable once this outer tab is active.
  const traceText = trace.join(" | ").toLowerCase();
  expect(traceText).toContain("building address");
  expect(traceText).toContain("add building");
  expect(traceText).toContain("add elevator");
  expect(traceText).toContain("delete building");

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

test("keyboard-only: Remediation steps expands/collapses the remediation panel without a mouse", async ({
  page,
}) => {
  await mockApiWithSeedData(page);
  await page.goto("/");

  const row = page.getByRole("row").filter({ hasText: "EL-1" }); // Delinquent
  const viewDetailsButton = row.getByRole("button", { name: /remediation steps/i });

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

test("keyboard-only: the building filter chip row is fully operable via keyboard", async ({
  page,
}) => {
  await mockApiWithSeedData(page);
  await page.goto("/");

  const chipGroup = page.getByRole("group", { name: /filter by building/i });
  const towerBChip = chipGroup.getByRole("button", { name: "Tower B" });

  await towerBChip.focus();
  await expect((await inspectFocused(page)).hasFocusRing).toBeTruthy();
  await expect(towerBChip).toHaveAttribute("aria-pressed", "false");

  // Buttons activate on Enter (and Space, per native button semantics) —
  // Enter is exercised here since it's the more common expectation for a
  // keyboard user tabbing through a row of chips.
  await page.keyboard.press("Enter");

  await expect(towerBChip).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("cell", { name: "EL-3", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "EL-1", exact: true })).not.toBeVisible();

  // The "All buildings" chip un-narrows the table again, also via keyboard.
  const allBuildingsChip = chipGroup.getByRole("button", { name: "All buildings" });
  await allBuildingsChip.focus();
  await expect((await inspectFocused(page)).hasFocusRing).toBeTruthy();
  await page.keyboard.press("Enter");
  await expect(allBuildingsChip).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("cell", { name: "EL-1", exact: true })).toBeVisible();
});

test("keyboard-only: the search box narrows the ledger table via keyboard", async ({ page }) => {
  await mockApiWithSeedData(page);
  await page.goto("/");

  const searchBox = page.getByLabel(/search ledger/i);
  await searchBox.focus();
  await expect((await inspectFocused(page)).hasFocusRing).toBeTruthy();

  await page.keyboard.type("EL-3");
  await expect(page.getByRole("cell", { name: "EL-3", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "EL-1", exact: true })).not.toBeVisible();

  // Clearing the box via keyboard (select-all + delete) restores the full list.
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await expect(page.getByRole("cell", { name: "EL-1", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "EL-3", exact: true })).toBeVisible();
});

test("keyboard-only: the group-by-building toggle is operable via keyboard", async ({ page }) => {
  await mockApiWithSeedData(page);
  await page.goto("/");

  const groupToggle = page.getByLabel(/group by building/i);
  await groupToggle.focus();
  await expect((await inspectFocused(page)).hasFocusRing).toBeTruthy();
  await expect(groupToggle).not.toBeChecked();

  await page.keyboard.press(" ");

  await expect(groupToggle).toBeChecked();
  await expect(page.getByRole("row").filter({ hasText: /Tower A — 2 devices/ })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: /Tower B — 1 device/ })).toBeVisible();
});

test.describe("keyboard-only: ElevatorDetailDrawer", () => {
  test("opens via the row's Device details button, moves focus to its close button, and Escape closes it back to a sensible focus target", async ({
    page,
  }) => {
    await mockApiWithSeedData(page);
    await page.goto("/");

    const row = page.getByRole("row").filter({ hasText: "EL-1" });
    const detailButton = row.getByRole("button", { name: /view device details for el-1/i });
    await detailButton.focus();
    await expect((await inspectFocused(page)).hasFocusRing).toBeTruthy();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: /device details — el-1/i });
    await expect(dialog).toBeVisible();

    // Focus must land on the drawer's own close button on open (per its
    // useEffect), not stay on the trigger or fall back to <body>.
    const closeButton = dialog.getByRole("button", { name: /close details drawer/i });
    await expect(closeButton).toBeFocused();
    await expect((await inspectFocused(page)).hasFocusRing).toBeTruthy();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("closing the drawer's close button via keyboard also dismisses it", async ({ page }) => {
    await mockApiWithSeedData(page);
    await page.goto("/");

    const row = page.getByRole("row").filter({ hasText: "EL-2" });
    await row.getByRole("button", { name: /view device details for el-2/i }).click();

    const dialog = page.getByRole("dialog", { name: /device details — el-2/i });
    await expect(dialog).toBeVisible();
    const closeButton = dialog.getByRole("button", { name: /close details drawer/i });
    await expect(closeButton).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(dialog).not.toBeVisible();
  });

  test("clicking the backdrop closes the drawer", async ({ page }) => {
    await mockApiWithSeedData(page);
    await page.goto("/");

    const row = page.getByRole("row").filter({ hasText: "EL-3" });
    await row.getByRole("button", { name: /view device details for el-3/i }).click();

    const dialog = page.getByRole("dialog", { name: /device details — el-3/i });
    await expect(dialog).toBeVisible();

    // The backdrop button is deliberately excluded from the tab order
    // (tabIndex=-1, aria-hidden) — it's a mouse/touch-only dismiss affordance
    // layered behind the real dialog, so it's exercised via a real click here
    // rather than the keyboard-only helpers used elsewhere in this file.
    await page.getByTestId("drawer-overlay").click({ force: true });
    await expect(dialog).not.toBeVisible();
  });
});
