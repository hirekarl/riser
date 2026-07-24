# Week 1 demo script — Sat 2026-07-25

> **Update 2026-07-24: this demo is cancelled — confirmed not happening.** Nothing below needs to be rehearsed or delivered tomorrow. Kept as-is rather than deleted: the hook, golden-path walkthrough, and close are good raw material to reuse (and adapt/extend) when writing the real script for the Wed 2026-07-29 final capstone presentation, which is now the only presentation deadline left. See `docs/sprints/day-by-day-plan.md`'s Sat 7/25 entry for the full context on the cancellation.

Talking points for Saturday's Week 1 demo (`docs/sprints/day-by-day-plan.md`), written the day after its original Thu 7/23 slot since no artifact existed yet going into Friday's dry-run #2. Scope: P0 core + whatever P1 polish has landed by Saturday morning — see `docs/sprints/sprint-02.md` for the current per-item status. Framed around the PRD's Problem/Opportunity section (`docs/prd/Riser-PRD.md` §1/§1a), not a feature-by-feature tour.

## Timing

Aim for 5-7 minutes total: ~1 min hook, ~4-5 min live walkthrough, ~1 min close. Leave the rest of the slot for questions.

## 1. The hook (problem/opportunity, ~1 min)

Say this, don't paraphrase live — it's the whole reason the tool exists:

> "NYC has over 84,000 registered elevator devices. Every one of them has two recurring filing deadlines — an annual CAT1 inspection and a five-year CAT5 inspection — and missing either one carries a fine starting at $3,000 per device, plus monthly late fees on top. Property managers who oversee more than one building today track this with spreadsheets, paper certificates, or by manually cross-referencing NYC's own open-data portal, one building at a time. There's no tool that gives them one ranked view of what's actually at risk across their whole portfolio. That's the gap Riser fills."

Land on: *the problem isn't data collection, it's synthesis and triage* — NYC already publishes the underlying filing data; nobody aggregates it into one risk-ranked view. That's Riser's actual value, not "another form to fill out."

## 2. Live walkthrough

Golden path, narrated as you click — each step ties back to a specific line in the hook above.

1. **Add a building manually** (name + address). *"This is the always-available path — not every device is in NYC's public dataset, and even when it is, a manager needs to be able to correct it."*
2. **Add an elevator** to that building (device identifier, CAT1 or CAT5, last inspection date). Point out the empty state disappearing and the ledger populating.
3. **Show the ranked ledger**: Delinquent → Warning → Compliant, color-coded status badges. *"This is the core value prop — one flat list, sorted by urgency, instead of checking buildings one at a time."*
4. **Add a second building/elevator** with a different status (e.g. a near-term due date) so the ledger has visible rank diversity before the next steps.
5. **Filter the ledger by building.** *"For a manager with a large portfolio, this narrows the view to one property without losing the same ranked format."*
6. **Edit an elevator's last-inspection date** so its status flips (e.g. Delinquent → Compliant). Narrate the due-date/status/rank recalculating live, and point out the row's brief highlight sweep — *"the system is telling you something just changed, not just silently reordering the table under you."*
7. **(If landed by Saturday) Trigger the AI narration panel** and read its summary aloud — *"a plain-language brief on top of the same ranked data, not a separate source of truth."*

## 3. The close (~1 min)

> "Everything you just saw — the ranking, the due-date math, the status changes — is deterministic and driven by real filing data or manager-entered corrections, not a guess. That's the difference between Riser and a spreadsheet: the portfolio-wide risk picture updates itself the moment a date changes, instead of a manager having to remember to."

Tie back explicitly to the fine amounts from the hook if there's time — the dollar figures are the thing a non-technical demo audience will remember.

## Fallback / cut-call notes

- If a P1 item flagged in `sprint-02.md` hasn't landed by Saturday morning, skip that step in the walkthrough silently — don't apologize for it live. The P0 core (steps 1-3, 6) is what's "never cut" per the day-by-day plan's cut order and must work regardless.
- Rehearse steps 1-6 at least once end-to-end before the actual demo (per Friday's dry-run #2) with a realistic multi-building portfolio already seeded, not built live from zero, so the ranking/filter steps have something to show.
