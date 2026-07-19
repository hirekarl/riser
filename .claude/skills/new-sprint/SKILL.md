---
name: new-sprint
description: Scaffold the next one-week sprint file under docs/sprints/ from TEMPLATE.md, auto-incrementing the sprint number and filling in the next one-week date range. Use when the user asks to start a new sprint or close out the current one.
---

# New Sprint

1. List `docs/sprints/sprint-*.md`, find the highest existing `NN`, and compute the next number zero-padded to two digits (e.g. `01` → `02`).
2. Read the current highest sprint file's `**Dates:**` line to get its end date. The new sprint's start date is the day after that end date; its end date is start + 6 days (7-day/1-week window inclusive).
3. Copy `docs/sprints/TEMPLATE.md` to `docs/sprints/sprint-NN.md` with the computed number and dates filled in.
4. Leave the sprint goal, "PRD requirements in scope" checklist, and all four per-person checklists as placeholders for the user to fill in — do not guess at scope or task assignments.
5. Tell the user the new file's path and remind them to fill in the sprint goal and the PRD requirement IDs/priorities from `docs/prd/Riser-PRD.md` section 3 before the sprint starts.
