# Sprint 02: Polish, empty states, and demo readiness

**Dates:** 2026-07-26 – 2026-07-29 (compressed to 4 days — the final capstone presentation is 2026-07-29, not the 1-week/8-01 range originally assumed here) **Sprint goal:** Build the P1 polish on top of Sprint 01's working core — editing, empty states, building context, filtering, and the visual status-change moment — plus the AI narration agent and (best-effort) the DOB Open Data address lookup, and get the full set demo-ready for the final presentation (per PRD Goals/Non-Goals, `docs/prd/Riser-PRD.md` section 2c).

This is the second of **two one-week sprints** covering the full MVP window; see `docs/sprints/sprint-01.md` for the first week's core-ledger work, and `docs/sprints/day-by-day-plan.md` for the concrete per-person schedule (which now covers this sprint in more detail than the checklist below).

## PRD requirements in scope

Copied from `docs/prd/Riser-PRD.md` section 3.

- [x] P1 — Edit an existing elevator's date/type. (PRD requires date _or_ type; the inline ledger date-editor satisfies this as written.)
- [x] P1 — Polished empty state.
- [x] P1 — Show building name inline in the ledger.
- [x] P1 — Filter/group ledger by building.
- [x] P1 — Visual highlight on status change.
- [ ] P0/P1 (new, non-negotiable) — AI risk-narration briefing (issue #1, Option 3).
- [ ] P0/P1 (new, best-effort) — DOB Open Data address-lookup auto-populate. (Stages 1-2 of the pipeline are built/tested ahead of schedule — `backend/apps/compliance/dob.py` — but the endpoint + frontend wiring are still Mon/Tue 7/27-28 work; see `docs/architecture/integration-contracts.md` §4.)

(P2 items remain out of scope; pull from Sprint 01 into this sprint if anything didn't land in week one. See `docs/sprints/day-by-day-plan.md` for the priority/cut-order reasoning behind the two new items.)

## Per-person task checklists

Filled in 2026-07-21 per the concrete schedule in `docs/sprints/day-by-day-plan.md` (role split from issue #2: Cornell → backend/services, Andres → frontend logic/data-fetching, Schiffon → visual/interaction/a11y, Karl → API contract seam + integration).

Checkbox convention: `[x]` means merged to `main`; code that's complete but still in an open PR or under review stays `[ ]`, with a note on its status.

### Karl Johnson

- [x] Update sprint checklists (this edit).
- [ ] Walk team through `docs/architecture/integration-contracts.md` (Tue 7/21). Never happened live — team was never together at once. Lower-risk than it looks: every contract-dependent feature built since (ledger filter, highlight, DOB POC, PR #43's narration/address-lookup types+client) has matched the doc without incident, confirmed again by Sat 7/25's fresh-eyes review below. Still worth an actual walkthrough if the team syncs before 7/29, but not currently blocking anything.
- [x] Contract review: edit shape + filter param match DRF serializers (Wed 7/22); add `anthropic` SDK dependency + `ANTHROPIC_API_KEY` placeholder (Wed 7/22).
- [x] Demo script/talking points (Thu 7/23 task, done Fri 7/24 since Thu's session didn't happen — see `docs/team/status-log.md`). Dry-run #1 (Thu) did not happen; Fri 7/24 became a solo catch-up session rather than a full team dry-run #2 — see status log.
- [x] AI-narration TS type/client method; address-lookup TS type/client method (both pulled forward from Sun 7/26/Mon 7/27, done Fri 7/24 — PR #43, merged Sat 7/25). Fresh-eyes contract review done Sat 7/25: shipped `NarrationResponse`/`NarrationErrorResponse`/`AddressLookupRequest`/`AddressLookupResponse`/`DobDeviceMatch` types and `fetchNarration()`/`lookupBuildingByAddress()` client methods match `integration-contracts.md` §3/§5 exactly — no discrepancies.
- [ ] End-to-end contract verification + best-effort cut call on DOB integration (Tue 7/28). **Blocked** — needs Cornell's narration service (`backend/apps/compliance/services/narration.py`) and the `/api/buildings/lookup/` endpoint to exist first; neither has started.

### Andres Ballares

- [ ] Wire elevator-edit UI to `PATCH` endpoint; confirm due-date/status/rank update live on save (Tue 7/21). Did not land Tue as scheduled; code complete 2026-07-25 (4 days late) — PR #69 in review, changes requested (stale-data overwrite between the inline date input and the new edit form; Cancel button unstyled). Andres addressing now.
- [x] Filter/group-by-building in ledger UI + building name inline (Wed 7/22, against Cornell's query param). Did not land Wed as scheduled; picked up by Karl Fri 7/24 since Andres wasn't present — see `docs/team/status-log.md`.
- [x] Realistic-portfolio-size check (25+ elevators) on demo browser (Thu 7/23); final cross-browser/responsive check (Fri 7/24). Did not happen Thu-Fri (Andres not present). **Sat 7/25: Karl ran an automated fallback pass** (Chromium only). **Later same day: Andres ran real cross-browser pass** (WebKit/Firefox + narrow-viewport 390×844 phone-width). Found and fixed a real bug: ledger table overflowed horizontally on WebKit/Firefox at phone width. Fixed test-first with `overflow-x: auto` wrapper container — PR #66, merged; see `docs/team/status-log.md` 2026-07-25 entry for details.
- [ ] AI-narration panel component, on-demand + loading state (Sun 7/26); close AI-panel edge cases + address-lookup form shell (Mon 7/27); wire address-lookup form + review/override flow (Tue 7/28).

### Cornell Robertson

- [ ] Confirm/add tests for `PATCH` on `ElevatorViewSet` (Tue 7/21) — **confirmed already done 2026-07-21, no new work needed** (endpoint + test pre-existed; see `docs/sprints/sprint-01.md` carry-over note).
- [x] Building-scoped filtering (query param) on `LedgerListView` (Wed 7/22).
- [ ] Backend edge-case sweep: leap-year due-date math, boundary Warning/Delinquent transitions (Thu 7/23). Not done — Thu's session didn't happen. A real bug in this exact area (a `time_machine`/local-timezone interaction in the boundary tests) surfaced and was fixed by Karl Fri 7/24 — see `docs/team/status-log.md`.
- [x] Research which NYC Planning geocoding service is reachable (GeoSearch vs. Geoservice) + review DOB Open Data response shape — research only (Fri 7/24). **Done two days early (Wed 7/22 evening) and exceeded scope**: built a full working, tested resolver POC rather than research notes — `backend/apps/compliance/dob.py`, `docs/architecture/geocoding-reachability-findings.md`.
- [ ] Narration-briefing service, single-turn Claude API call, mocked-client tests (Sun 7/26).
- [ ] Finish AI-agent tests/coverage; start DOB Open Data address→BIN client service (Mon 7/27).
- [ ] Finish DOB service: no-match/error fallback to manual entry, tests (Tue 7/28).

### Schiffon Lola Wise

- [x] Polished empty-state screen for zero-devices first-run case (Tue 7/21). Schiffon wasn't present that session; picked up by Karl via the `ui-ux-specialist-agent` — see `docs/team/status-log.md`'s 2026-07-21 entry.
- [x] Status-change highlight/animation on `LedgerPage`/`StatusBadge` (Wed 7/22, after Andres pushes); visual QA on new empty state. Did not land Wed as scheduled; picked up by Karl Fri 7/24 after the filter UI landed, since Schiffon wasn't present — see status log.
- [ ] Final visual pass: status colors meet distinct/high-contrast requirement (Thu 7/23). Not done — Schiffon not present Thu. **Sat 7/25: Karl's fallback pass** confirmed Delinquent/Warning/Compliant colors are visually distinct and each pairs its color with a distinct icon (not color alone) — still open for Schiffon's real judgment-call pass; see status log.
- [ ] Final accessibility pass: contrast, jsx-a11y, axe (Fri 7/24). Not done — Schiffon not present Fri. (Note: the highlight animation Karl built this session does have automated axe coverage in its own tests, but that's not a substitute for Schiffon's full manual pass.) **Sat 7/25: Karl's fallback pass** ran `@axe-core/playwright` against the live seeded app (populated ledger, empty state, mid-animation highlight) — 0 violations in all three — still open for the deliberate manual pass (screen reader, keyboard-only walkthrough); see status log.
- [ ] AI-narration panel placement + empty/loading/error states (Sun 7/26, after Andres pushes).
- [ ] AI-panel accessibility/visual QA; start "review and override" screen design (Mon 7/27, after Andres pushes).
- [ ] Polish review/override screen (Tue 7/28, after Andres pushes).

## Notes / carry-over

_(fill in at sprint close)_
