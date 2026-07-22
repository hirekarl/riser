# Sprint 02: Polish, empty states, and demo readiness

**Dates:** 2026-07-26 – 2026-07-29 (compressed to 4 days — the final capstone presentation is 2026-07-29, not the 1-week/8-01 range originally assumed here) **Sprint goal:** Build the P1 polish on top of Sprint 01's working core — editing, empty states, building context, filtering, and the visual status-change moment — plus the AI narration agent and (best-effort) the DOB Open Data address lookup, and get the full set demo-ready for the final presentation (per PRD Goals/Non-Goals, `docs/prd/Riser-PRD.md` section 2c).

This is the second of **two one-week sprints** covering the full MVP window; see `docs/sprints/sprint-01.md` for the first week's core-ledger work, and `docs/sprints/day-by-day-plan.md` for the concrete per-person schedule (which now covers this sprint in more detail than the checklist below).

## PRD requirements in scope

Copied from `docs/prd/Riser-PRD.md` section 3.

- [ ] P1 — Edit an existing elevator's date/type.
- [ ] P1 — Polished empty state.
- [ ] P1 — Show building name inline in the ledger.
- [ ] P1 — Filter/group ledger by building.
- [ ] P1 — Visual highlight on status change.
- [ ] P0/P1 (new, non-negotiable) — AI risk-narration briefing (issue #1, Option 3).
- [ ] P0/P1 (new, best-effort) — DOB Open Data address-lookup auto-populate.

(P2 items remain out of scope; pull from Sprint 01 into this sprint if anything didn't land in week one. See `docs/sprints/day-by-day-plan.md` for the priority/cut-order reasoning behind the two new items.)

## Per-person task checklists

Filled in 2026-07-21 per the concrete schedule in `docs/sprints/day-by-day-plan.md` (role split from issue #2: Cornell → backend/services, Andres → frontend logic/data-fetching, Schiffon → visual/interaction/a11y, Karl → API contract seam + integration).

### Karl Johnson

- [x] Update sprint checklists (this edit).
- [ ] Walk team through `docs/architecture/integration-contracts.md` (Tue 7/21).
- [ ] Contract review: edit shape + filter param match DRF serializers (Wed 7/22); add `anthropic` SDK dependency + `ANTHROPIC_API_KEY` placeholder (Wed 7/22).
- [ ] Demo script/talking points + dry-run #1 (Thu 7/23); run dry-run #2 + freeze scope (Fri 7/24).
- [ ] AI-narration TS type/client method (Sun 7/26); address-lookup TS type/client method + fresh-eyes contract review (Mon 7/27).
- [ ] End-to-end contract verification + best-effort cut call on DOB integration (Tue 7/28).

### Andres Ballares

- [ ] Wire elevator-edit UI to `PATCH` endpoint; confirm due-date/status/rank update live on save (Tue 7/21).
- [ ] Filter/group-by-building in ledger UI + building name inline (Wed 7/22, against Cornell's query param).
- [ ] Realistic-portfolio-size check (25+ elevators) on demo browser (Thu 7/23); final cross-browser/responsive check (Fri 7/24).
- [ ] AI-narration panel component, on-demand + loading state (Sun 7/26); close AI-panel edge cases + address-lookup form shell (Mon 7/27); wire address-lookup form + review/override flow (Tue 7/28).

### Cornell Robertson

- [ ] Confirm/add tests for `PATCH` on `ElevatorViewSet` (Tue 7/21) — **confirmed already done 2026-07-21, no new work needed** (endpoint + test pre-existed; see `docs/sprints/sprint-01.md` carry-over note).
- [ ] Building-scoped filtering (query param) on `LedgerListView` (Wed 7/22).
- [ ] Backend edge-case sweep: leap-year due-date math, boundary Warning/Delinquent transitions (Thu 7/23).
- [ ] Research which NYC Planning geocoding service is reachable (GeoSearch vs. Geoservice) + review DOB Open Data response shape — research only (Fri 7/24).
- [ ] Narration-briefing service, single-turn Claude API call, mocked-client tests (Sun 7/26).
- [ ] Finish AI-agent tests/coverage; start DOB Open Data address→BIN client service (Mon 7/27).
- [ ] Finish DOB service: no-match/error fallback to manual entry, tests (Tue 7/28).

### Schiffon Lola Wise

- [ ] Polished empty-state screen for zero-devices first-run case (Tue 7/21).
- [ ] Status-change highlight/animation on `LedgerPage`/`StatusBadge` (Wed 7/22, after Andres pushes); visual QA on new empty state.
- [ ] Final visual pass: status colors meet distinct/high-contrast requirement (Thu 7/23).
- [ ] Final accessibility pass: contrast, jsx-a11y, axe (Fri 7/24).
- [ ] AI-narration panel placement + empty/loading/error states (Sun 7/26, after Andres pushes).
- [ ] AI-panel accessibility/visual QA; start "review and override" screen design (Mon 7/27, after Andres pushes).
- [ ] Polish review/override screen (Tue 7/28, after Andres pushes).

## Notes / carry-over

_(fill in at sprint close)_
