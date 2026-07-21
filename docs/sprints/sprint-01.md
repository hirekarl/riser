# Sprint 01: Ship the Dynamic Compliance Risk Triage Pipeline MVP

**Dates:** 2026-07-19 – 2026-07-25 (1 week) **Sprint goal:** Get the core Django/DRF ledger API and React ledger UI working end to end — Building/Elevator CRUD, the deterministic due-date/status engine, and the sorted, color-coded ledger view — as the foundation Sprint 02 builds the remaining P1 polish on top of, ahead of the final capstone presentation on 2026-07-29 (per PRD Goals/Non-Goals, `docs/prd/Riser-PRD.md` section 2c).

This is the first of **two one-week sprints** covering the full MVP window; see `docs/sprints/sprint-02.md` for the second week, and `docs/sprints/day-by-day-plan.md` for the concrete per-person schedule.

**Status as of 2026-07-21: this sprint's P0 core is done** — Building/Elevator CRUD, the due-date/status service, and the sorted ledger endpoint all exist and are tested at 100% coverage on `apps/compliance`. See `docs/sprints/day-by-day-plan.md` for what's left.

## PRD requirements in scope

Copied from `docs/prd/Riser-PRD.md` section 3. All P0 (the P1 polish items are Sprint 02's scope — see `docs/sprints/sprint-02.md`).

- [x] P0 — Add a building with a name/address.
- [x] P0 — Add an elevator with device identifier, inspection type (CAT1/CAT5), last inspection date.
- [x] P0 — View a list of all buildings/elevators in the portfolio.
- [x] P0 — See every elevator in one list, sorted Delinquent > Warning > Compliant.
- [x] P0 — Auto-calculate next due date (CAT1: +1yr, CAT5: +5yr).
- [x] P0 — Assign Compliant/Warning (≤30 days)/Delinquent status.
- [x] P0 — Distinct, high-contrast color per status.
- [x] P0 — Editing a last-inspection date updates due date/status/rank immediately (confirmed 2026-07-21 — `ElevatorViewSet` PATCH already existed and is tested; see `docs/sprints/day-by-day-plan.md` Tue 7/21).

(P1/P2 items are out of scope for Sprint 01 — see Sprint 02.)

## Per-person task checklists

Filled in retroactively on 2026-07-21 — the checklists below were never checked off during the week even though the work landed. Attribution follows the role split agreed in issue #2 (`docs/sprints/day-by-day-plan.md` line 22); per-commit attribution isn't precise since most of this shipped under two broad scaffolding commits.

### Karl Johnson

- [x] API contract seam + integration across the backend/frontend split.

### Andres Ballares

- [x] React ledger UI: `LedgerPage`, ledger data-fetching, API client.

### Cornell Robertson

- [x] Django/DRF backend: Building/Elevator models, due-date/status service, CRUD endpoints, sorted ledger endpoint, tests (100% coverage on `apps/compliance`).

### Schiffon Lola Wise

- [x] `StatusBadge` visual/status-color work (distinct, high-contrast Compliant/Warning/Delinquent).

## Notes / carry-over

- P0 core confirmed solid on 2026-07-21 (34 backend tests / 100% coverage, 28 frontend tests / 97%+ coverage) — see `docs/sprints/day-by-day-plan.md` for the verification run.
- Elevator-edit PATCH endpoint was already in place; only the frontend edit-mode UI (`ElevatorForm`) remained open, carried into Sprint 02's Tue 7/21 work.
- Real Sprint 02 scope/dates are compressed (7/26–7/29, not the original 7-day window) — see `docs/sprints/sprint-02.md`.
