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
