# Team status log

Factual, per-session record of what was assigned (per `docs/sprints/day-by-day-plan.md`) versus what actually landed, and by whom. Purpose: keep an objective record for capstone accountability without needing to editorialize in commits, PRs, or conversation — the log states outcomes, not reasons or judgments about any individual.

**How to use this:**

- Add one entry per work session, dated, right after the session (not at sprint close — memory of who-did-what fades fast).
- State the task as it was assigned, who ended up doing it, and whether it shipped. Link the commit/PR where possible.
- **If anyone picks up a task originally assigned to someone else, say so explicitly** — assignee, reassigned-to, and why (e.g. "originally absent," "blocked," "time-boxed handoff") — so the log stays an accurate record of who actually did the work, not just who was supposed to.
- No commentary beyond the fact of what happened. This is a status ledger, not a review.

---

## 2026-07-21 (Tue) — Kickoff / P0 verification / Sprint 02 start

| Task (per day-by-day-plan.md) | Assigned to | Done by | Status | Notes |
| --- | --- | --- | --- | --- |
| Whole-team P0 verification (rerun backend/frontend coverage, walk ledger UI) | Whole team | Karl | Done | Backend: 34 tests, 100% coverage. Frontend: 28 tests, 97%+ coverage. Ran solo — Cornell/Schiffon not present for the session. |
| Update `sprint-01.md`/`sprint-02.md` checklists (Housekeeping item) | Karl | Karl | Done |  |
| Confirm API supports elevator-edit `PATCH`, add if missing | Cornell | Karl (verification only) | Done | No new code needed — `ElevatorViewSet` `PATCH` and its test already existed; confirmed via test suite. |
| Wire elevator-edit UI to endpoint | Andres | — | Pending | Not yet reassigned; not blocked by anything above. |
| Polished empty-state screen (P1) | Schiffon | **Karl (reassigned)** | Done | Schiffon not available for tonight's session. Karl picked this up in her place via the `ui-ux-specialist-agent` so the P1 item doesn't slip. Originally Schiffon's task per `day-by-day-plan.md` Tue 7/21 row. New `EmptyState` component (`frontend/src/components/EmptyState.{tsx,module.css,test.tsx}`), mounted in `LedgerPage.tsx`; test-first, lint/typecheck/coverage all green (97%+). |
| Add `anthropic` SDK dependency + `ANTHROPIC_API_KEY` placeholder | Karl (originally scheduled Wed 7/22) | Karl | Done, pulled forward | Not a reassignment — Karl's own task, done a day early since the session had capacity. `uv add anthropic` (0.117.1) in `backend/pyproject.toml`/`uv.lock`; placeholder added to `.env.example` and local `.env`. Backend suite reverified after: 34 tests, 100% coverage. |
| Contract review: elevator-edit shape + planned ledger filter param vs. actual serializers/views | Karl (originally scheduled Wed 7/22) | Karl | Done, pulled forward | Not a reassignment — Karl's own task, done early. Verified `docs/architecture/integration-contracts.md` against current code: no discrepancies. Confirms elevator-edit `PATCH` is fully wired end-to-end already, and confirms the two real gaps the spec flags (`listElevators()`/`listLedger()` lack a `building` param; `LedgerListView` has no `filter_backends` configured) — both still accurate, still Wed 7/22 Cornell/Andres work. |

## 2026-07-22 (Wed) — P1 polish continues

| Task (per day-by-day-plan.md) | Assigned to | Done by | Status | Notes |
| --- | --- | --- | --- | --- |
| Building-scoped filtering (query param) on `LedgerListView`, land early in the day | Cornell | Cornell | Done, later than planned | Landed end-of-session (~20:45) rather than "early in the day," so it briefly blocked Andres's filter UI overnight (see below). PR #33, merged 7/24. Karl opened a preemptive duplicate (PR #32) early evening, then closed it himself on realizing it was Cornell's assigned task ("not mine to preempt") — no reassignment, just don't-step-on-it. |
| Filter/group-by-building in ledger UI + building name inline | Andres | — | Not done Wed; done Fri (reassigned) | Building name inline had already shipped earlier. The filter UI itself did not land Wed as scheduled and Andres was not present in later sessions either; picked up by Karl Fri 7/24 (PR #37) so the P1 item wouldn't keep slipping. |
| Status-change highlight/animation on `LedgerPage`/`StatusBadge`; visual QA on empty state | Schiffon | — | Not done Wed; done Fri (reassigned) | Did not land Wed as scheduled (blocked on Andres's piece anyway, per the day's own sequencing rule) and Schiffon was not present in later sessions either; picked up by Karl Fri 7/24 (PR #38). |
| Add `anthropic` SDK dependency + `ANTHROPIC_API_KEY` placeholder | Karl | Karl | Done | PR #29, merged. |
| Contract review: edit shape + filter param vs. DRF serializers | Karl | Karl | Done | Logged above (pulled forward from Wed into Tue's session). |
| Fold Andres' proof-of-service/filing-summary proposal (from Slack) into PRD + sprint plan | Karl (self-initiated, not on the day-by-day plan) | Karl | Opened, later superseded | PR #31 proposed swapping the Mon/Tue 7/27-28 DOB Open Data slot for this feature. Opened 17:51, no reviewers pinged. See Fri 7/24 below for resolution. |
| Research which NYC Planning geocoding service is reachable + review DOB Open Data response shape — scheduled as **research only, no code**, for Fri 7/24 | Cornell | Cornell | Done two days early, exceeded scope (in a good way) | Working the same Wed evening (~20:07-20:49), Cornell went beyond "research only" and built a full tested POC — keyless GeoSearch v2 resolver, disambiguation rule, DOB device fetch (PR #34, merged 7/24, 100% coverage). This fully de-risked the one open question threatening the Mon/Tue DOB integration slot, two days ahead of its own schedule. Coincided with Karl's PR #31 (above) proposing to cut that same DOB work — neither PR pinged the other, a coordination gap rather than an error on either side; resolved Fri 7/24 in Cornell's favor (see below). |

## 2026-07-23 (Thu) — no team activity recorded

No PRs, commits, or status-log entries exist for this date. Per `day-by-day-plan.md`, Thu 7/23 was scheduled as a whole-team regression pass (Cornell: boundary/leap-year edge-case sweep; Andres: realistic-portfolio-size check; Schiffon: visual pass; Karl: demo script + dry-run #1) — none of it appears to have happened or been recorded. Concretely surfaced Fri 7/24: the backend test suite had 2 failing tests on `main` (a `time_machine` + local-timezone bug in the exact boundary-condition tests Thu's edge-case sweep was meant to cover) and no demo script existed yet.

## 2026-07-24 (Fri) — buffer day / dry-run #2, run solo by Karl

Cornell, Andres, and Schiffon were not present for this session; Karl ran it solo (with Claude Code) covering both his own Fri tasks and the catch-up work Wed/Thu's gaps left behind.

| Task | Assigned to | Done by | Status | Notes |
| --- | --- | --- | --- | --- |
| Fix the failing backend boundary tests (`time_machine` + local-timezone bug) | Unassigned (surfaced this session) | Karl | Done | PR #35, merged. Root cause: `time_machine.travel(bare_date)` anchors at UTC midnight; on a host timezone behind UTC, `date.today()` resolves to the previous day, silently breaking exact-boundary Warning/Delinquent assertions. Fixed by passing `today` explicitly instead of freezing wall-clock time; knowledge-base note added. |
| Review + merge Cornell's `?building=` ledger filter | Karl | Karl | Done | PR #33 merged, rebased onto latest `main` first. |
| Review + merge Cornell's DOB resolver POC | Karl | Karl | Done | PR #34 merged; review comment explicitly credits the early de-risking work and confirms DOB integration stays on the Mon/Tue plan because of it. |
| Review + merge Schiffon's UI/UX design mockup | Karl | Karl | Done | PR #19 merged as a historical design reference (already superseded in parts by what's since shipped, per Karl's two earlier review rounds on that PR). |
| Resolve the PR #31 vs. Cornell's PR #34 scheduling conflict | Karl | Karl | Done | Closed PR #31; opened PR #36 instead: keeps DOB integration on the Mon/Tue slot (built on Cornell's POC), keeps the proof-of-service idea as a documented post-MVP backlog item rather than a schedule swap, resolves the device→Elevator mapping question Cornell flagged (`TODO(team)` in `dob.py`). |
| Filter/group-by-building in ledger UI (Andres's stalled Wed task) | Andres → **Karl (reassigned)** | Karl | Done | PR #37, merged. Andres not present; picked up so the P1 item didn't keep slipping. Single-building select, not an always-grouped view, per the contract and Karl's own earlier review of PR #19. |
| Status-change highlight animation (Schiffon's stalled Wed task) | Schiffon → **Karl (reassigned)** | Karl | Done | PR #38, merged. Schiffon not present; built after the filter UI landed, per the day-by-day plan's own sequencing rule for that file. Visual language adapted from Schiffon's merged design mockup, re-implemented against React's actual re-render model. |
| Demo script/talking points (originally Thu 7/23) | Karl | Karl | Done, a day late | PR #39, merged. Written Fri since Thu's session didn't happen; framed around the PRD's Problem/Opportunity section per the original task. |

### Outstanding — needs Andres or Schiffon specifically, not reassignable

Everything below requires a real human on real hardware/browsers; Karl (or Claude Code, working on Karl's behalf) cannot substitute for these the way code/docs tasks were picked up above. Carrying forward until one of them is back — no longer racing Saturday's demo specifically, since that's confirmed cancelled (see `docs/sprints/day-by-day-plan.md`'s Sat 7/25 entry), but still worth closing out well before the Wed 7/29 final capstone.

| Task | Assigned to | Originally due | Status |
| --- | --- | --- | --- |
| Realistic-portfolio-size check (25+ elevators) on the actual demo browser | Andres | Thu 7/23 | **Closed 2026-07-25.** Andres ran the real check (not a fallback) — see the "2026-07-25 (Sat), later" entry below. |
| Final cross-browser/responsive check on whatever machine will run the demo | Andres | Fri 7/24 | **Closed 2026-07-25.** Andres ran the real check (not a fallback) — see the "2026-07-25 (Sat), later" entry below. |
| Final visual pass: confirm status colors are distinct/high-contrast in practice | Schiffon | Thu 7/23 | **Outstanding.** `StatusBadge` colors are unchanged since Sprint 01 and were originally built by Schiffon for exactly this requirement, so risk here is low — but no one has re-confirmed it since, and it's a human-judgment check (real screen, real eyes), not something automatable. |
| Final accessibility pass: contrast, jsx-a11y, axe, across everything shipped this week | Schiffon | Fri 7/24 | **Partially covered, not closed out.** Automated `axe` scans exist in this session's own component/e2e tests (LedgerPage's test suite, `e2e/ledger.spec.ts`) and came back clean — but that's incidental coverage from TDD on the features Karl picked up, not the deliberate, whole-app manual pass (screen reader spot-check, keyboard-only walkthrough, real contrast check on the actual empty-state/filter/highlight additions) this task calls for. |

If neither is available well before the 7/29 capstone, the pragmatic fallback is: do a quick manual smoke pass on these four items yourself (Karl) rather than skipping them silently — better than presenting untested UI, even if it's not the deliberate pass Andres/Schiffon would have done.

### Housekeeping: Sat 2026-07-25 Week 1 demo cancelled

Confirmed by Karl 2026-07-24: the Week 1 demo originally scheduled for Saturday is not happening. This removes a scope-freeze deadline that several docs were written against today (`docs/sprints/day-by-day-plan.md`, `docs/demo/week-1-demo-script.md`, and the "before Saturday's demo" framing above) — all updated same-day to reflect it. The only presentation deadline remaining is the final capstone on Wed 2026-07-29.

## 2026-07-25 (Sat) — buffer day: Dependabot triage + fallback QA pass, run solo by Karl

Cornell, Andres, and Schiffon were not present. Per `day-by-day-plan.md`'s Sat 7/25 entry, Karl (with Claude Code) used the freed-up demo day to triage the Dependabot config merged yesterday (`2c6d350`) and attempt the fallback smoke pass this log's own Fri 7/24 entry named for the four outstanding manual items, rather than let them sit untested going into the capstone.

| Task | Assigned to | Done by | Status | Notes |
| --- | --- | --- | --- | --- |
| Review/merge Karl's own pulled-forward PR #43 (narration + address-lookup TS types/client) | Karl | Karl | Reviewed, merge queued — not yet executed | All CI green, branch updated to latest `main`. Merge requires bypassing the repo's review requirement (no other collaborator present to approve) via `gh pr merge --admin`; Claude Code's own auto-mode safety classifier blocks it from running that flag itself, so it's queued for Karl to run directly. |
| Triage 14 Dependabot PRs opened overnight by yesterday's new config | Karl | Karl | Triaged; 12 merges queued, not yet executed; 2 held | Same `--admin` blocker as above applies to all 12 CI-green merges (`#46`-`#54`, `#55`, `#58`, `#59` — GitHub Actions, pre-commit hook, and frontend/backend minor-patch-group bumps). `#56` (eslint 9→10.8.0) and `#57` (`@eslint/js`→10.0.1) correctly held open (not just blocked) with explanatory PR comments: `eslint-plugin-jsx-a11y@6.10.2` peer-caps at eslint `^9`, confirmed via a real `ERESOLVE` CI failure on `#56`, not flakiness. Revisit once jsx-a11y adds eslint 10 support. |
| Realistic-portfolio-size check (25+ elevators) | Andres → **Karl fallback pass** | Karl | Karl's automated fallback pass, per this log's own stated fallback plan — not the deliberate human pass Andres would do. Still worth Andres's real check when back. | Added a `seed_demo_data` management command (test-first, 100% coverage) seeding 7 buildings / 27 elevators spanning Delinquent/Warning/Compliant across both CAT1/CAT5. Loaded the live dev servers and drove the ledger with Playwright: all 27 rows render correctly, sorted Delinquent→Warning→Compliant, 7-building filter dropdown populates correctly, no layout breakage, no console errors. |
| Final cross-browser/responsive check | Andres → **Karl fallback pass (partial)** | Karl | Partial — Chromium only, not the full matrix. | Playwright MCP drives Chromium by default; Safari/Firefox were not exercised. Flagging explicitly so this isn't mistaken for the real cross-browser check. |
| Final visual pass: status colors distinct/high-contrast | Schiffon → **Karl fallback pass** | Karl | Karl's automated/visual fallback pass — not the deliberate human pass Schiffon would do. | Screenshotted the populated ledger: Delinquent (red)/Warning (amber)/Compliant (green) `StatusBadge`s are visually distinct and each pairs its color with a distinct icon (✕/⚠/✓), so status isn't conveyed by color alone. |
| Final accessibility pass: contrast, jsx-a11y, axe, across everything shipped this week | Schiffon → **Karl fallback pass** | Karl | Karl's automated fallback pass — not the deliberate manual pass (screen reader, keyboard-only walkthrough) Schiffon would do. | Ran `@axe-core/playwright`'s `AxeBuilder` against the live seeded app in three states: populated ledger, empty state (added a zero-elevator building via the UI form's own building-create flow to trigger it naturally), and mid-animation status-change highlight. **0 violations (0 serious/critical) in all three states.** Extends, rather than just repeats, the incidental component-level axe coverage already in the test suite. |
| Sync PRD Open Question #3 (GeoSearch reachability) — stale "unresolved" wording | Karl (doc-sync gap, not on the day-by-day plan) | Karl | Done | `day-by-day-plan.md` and `geocoding-reachability-findings.md` already showed Cornell confirmed GeoSearch v2 reachable/keyless on 7/22; the PRD's own Open Questions bullet was never updated to match, unlike the Socrata app-token question closed out in `549755b`. |
| Sync ADR 0003's Open Questions section (Socrata app-token line) | Karl (doc-sync gap, not on the day-by-day plan) | Karl | Done | Same underlying resolution as above, this doc just hadn't been touched when `549755b` closed it out elsewhere. |

**Not touched today — still needs explicit team confirmation, not a doc-sync gap:** `docs/adr/0002-no-auth-for-mvp.md` remains `Proposed — unconfirmed`. `CLAUDE.md` calls this out as something to confirm before a demo; with no fixed demo deadline forcing the conversation anymore, it risks staying unconfirmed straight through the 7/29 capstone unless someone explicitly raises it with the team.

## 2026-07-25 (Sat), later — Andres's real QA pass (supersedes today's earlier fallback)

Andres present this session. Per this log's own Fri 7/24 "Outstanding" table, ran the two manual QA items on his own machine/browsers that Karl's same-day automated fallback pass (above) explicitly could not substitute for.

| Task | Assigned to | Done by | Status | Notes |
| --- | --- | --- | --- | --- |
| Realistic-portfolio-size check (25+ elevators) | Andres | Andres | Done | Seeded via `seed_demo_data` (7 buildings / 27 elevators). Drove the live ledger in real Chrome (via the Claude Code Chrome extension, not headless): all 27 rows render, correctly sorted Delinquent→Warning→Compliant, filter dropdown correctly scopes to each of the 7 buildings, no layout breakage, no console errors, scrolling felt instant. No bugs found. |
| Final cross-browser/responsive check | Andres | Andres | Done | Covered real WebKit (Safari engine) and Firefox — the two browsers Karl's Chromium-only Playwright pass didn't touch — plus a narrow-viewport (390×844, phone-width) resize pass, via Playwright driving locally-installed browser binaries against the live dev server on this machine. **Found and fixed a real bug**: at phone width, the ledger page overflowed horizontally in both WebKit and Firefox (the table had no scroll container and the CSS has no responsive breakpoints anywhere). Fixed test-first via `ui-ux-specialist-agent` on `fix/ledger-table-narrow-viewport-overflow`: wrapped the table in an `overflow-x: auto` container plus an `overflow-x: hidden` backstop on `body` (WebKit-specific residual scroll, caught via a behavioral `window.scrollX` check, not just `scrollWidth`/`clientWidth`). New Playwright e2e test added (failed before the fix, passes after). Full lint/typecheck/coverage/e2e all green; fix independently re-verified against the live dev server in real WebKit, Firefox, and Chromium. PR #66, not yet merged. |
