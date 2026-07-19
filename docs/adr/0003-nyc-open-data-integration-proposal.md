# 3. NYC Open Data integration for device auto-populate and compliance reconciliation (proposal)

## Status

Proposed — not accepted, not implemented. This ADR does not change the PRD or any code; it exists so the team can react to a concrete option.

## Context

`docs/prd/Riser-PRD.md` section 2c currently lists as an MVP non-goal: "No live government/municipal scraping — the interval engine uses static, pre-researched NYC DOB Category 1 and Category 5 interval constants instead of live data." That decision shaped Sprint 01's build: `Building` and `Elevator` models, and the deterministic due-date/status engine in `backend/apps/compliance/services.py`, are entirely manual-entry — a property manager (PM) types in each elevator's device identifier, inspection type, and last inspection date, and Riser computes the due date and Compliant/Warning/Delinquent status from that input alone. No external API is called anywhere in the current backend.

That was a reasonable scope cut for a zero-dependency, two-week, Day-14 demo. It's being revisited now because the PRD has been confirmed as a work-in-progress rather than a canonical, closed spec, and because the manual-entry design has a gap directly relevant to the product's own problem statement: Riser's stated purpose is preventing PMs from "risking thousands of dollars in fines" from missed filings, but the current design does nothing to prevent the two most likely human-error paths to a missed filing — a PM forgetting to log a device at all, or mistyping/forgetting to update its last inspection date. Pure date math on manually-entered data inherits whatever the PM got wrong.

A sibling project, `~/documents/dev/ea-property-intelligence`, already queries the relevant NYC Open Data (Socrata) datasets for a related but distinct product (public-data property intelligence for elevator advocacy — complaint/enforcement/ownership risk profiling). It has no Django/DRF code and nothing here is directly portable, but its `ELEVATOR_COMPLAINTS_API_GUIDE.md` and `CLAUDE.md` document real, hard-won integration knowledge — dataset IDs, schema gotchas, and known data-quality gaps — that would directly inform a Riser integration if the team pursues one. That knowledge is cited throughout this proposal.

## Decision

This ADR proposes three options for the team to evaluate, ranked by recommended priority. Accepting any of them would formally supersede the "no live government/municipal scraping" non-goal in `docs/prd/Riser-PRD.md` section 2c, per the ADR convention in `docs/adr/0001` ("a changed decision gets a new ADR that supersedes the old one, rather than an edit to the original").

### Option 1 — Device auto-populate (recommended starting point)

Use **DOB NOW Device Details** (Socrata dataset `juyv-2jek`) to resolve a building's registered elevator devices by address or BIN (Building Identification Number). When a PM adds a building, Riser would look up and pre-populate its registered elevator devices (device ID, machine type) instead of requiring the PM to type each one in by hand.

This targets the higher-severity failure mode directly: a device that's never entered into Riser has no due-date tracking at all, which is a bigger fine risk than a tracked device with a slightly stale date. It's also the smallest of the three options — one dataset, one lookup path (address/BIN → device list), no ongoing reconciliation logic.

### Option 2 — Compliance reconciliation (larger scope)

In addition to Option 1, cross-check the PM's manually-entered status against DOB's own **DOB NOW Safety Compliance** record (Socrata dataset `e5aq-a4j2`), which reflects DOB's own filing/compliance status per device. Divergence (e.g., Riser computes "Compliant" from the PM's entered date, but DOB's own record shows an overdue or missing filing) would be surfaced as a flag rather than silently trusted.

This is a stronger signal than pure date arithmetic — it grounds Riser's status in the regulator's own record rather than solely in what the PM typed — but it's meaningfully more work: it requires either an on-demand lookup on every ledger view or a periodic reconciliation job, plus UI/UX for presenting a divergence between "what you entered" and "what DOB has on file."

### Option 3 — Complaint-based risk signal (not recommended for Riser)

**DOB Elevator Complaints** (Socrata dataset `kqwi-7ncn`) driven risk scoring is `ea-property-intelligence`'s core value proposition, answering "is this building high-risk from an advocacy/enforcement standpoint." That's a different question from Riser's "is this specific device's statutory paperwork current," and building it would pull Riser's scope toward duplicating a tool that already exists rather than strengthening Riser's own compliance-ledger focus. Recorded here as considered-and-deprioritized, not overlooked.

## Consequences

Costs and constraints below are drawn directly from `ea-property-intelligence`'s documented experience integrating these same datasets, so they don't need to be rediscovered:

- **Date parsing is application-side, not SoQL-side.** DOB's complaint/compliance date fields (`date_entered`, `disposition_date`, `inspection_date`) are `MM/DD/YYYY` plain text, not a Socrata `calendar_date` type. SoQL date functions don't work on them, and naive text comparison breaks across year boundaries (documented in `ELEVATOR_COMPLAINTS_API_GUIDE.md`). Any date-bearing field pulled from these datasets must be parsed and compared in Python, not in the query.
- **Not real-time.** These datasets are periodically refreshed, not a live feed — UI copy referencing DOB data should say "as of DOB's last data refresh," not imply instant/live status.
- **New operational credential.** A free Socrata app token (`SOCRATA_APP_TOKEN`) is needed to avoid low anonymous rate limits — one more secret to provision and manage.
- **Real scope addition, not a tweak.** Either option requires a Socrata HTTP client, address/BIN resolution (e.g., NYC Planning GeoSearch, `geosearch.planninglabs.nyc`), and either an on-demand lookup or a scheduled reconciliation job. This walks back the PRD's current "zero dependency on external APIs, file parsing, or notification infrastructure" Day-14 demo goal (`docs/prd/Riser-PRD.md` section 2c) — whether this ships before or after the Day-14 demo needs to be an explicit team decision, not an implicit side effect of accepting this ADR.
- **Public data has real gaps.** Even where a field exists in a DOB/HPD dataset, it may be sparsely populated — `ea-property-intelligence`'s `CLAUDE.md` notes one enforcement field (`omostatusreason` on ERP orders) is populated on only ~2% of relevant records citywide. Any Riser feature built on this data should be framed to the PM as "verification/assistance," not "authoritative ground truth" — DOB's own record can itself be incomplete.

## Open questions

- Does this ship before or after the Day-14 demo? The PRD's demo-readiness goal currently assumes zero external dependencies.
- If Option 1 is accepted, does device auto-populate **replace** the P0 "add an elevator manually" requirement (`docs/prd/Riser-PRD.md` section 3), or sit alongside it as an alternative entry path (manual entry stays available for devices DOB hasn't registered or that resolve incorrectly)?
- If Option 2 is accepted, what does the UI do with a divergence — is it just a visual flag, or does it override the PM's entered status?
- Who owns provisioning the `SOCRATA_APP_TOKEN` for this environment, and does it belong in `.env.example` alongside existing config?
