# RISER

_Product Requirements Document: Net New Build_

**Build name:** Riser **Owner:** Karl Johnson, Andres Ballares, Cornell Robertson, Schiffon Lola Wise **Date:** July 21, 2026 (revision 2, following issues #1, #2, #20)

**Revision note:** This revision folds in the discussion started by issue #20 (Andres' post-MVP vision) and a re-analysis of what's honestly reachable by 2026-07-29. The key finding driving it: NYC publishes a free, structured, no-authentication-required Open Data feed (**DOB NOW: Elevator Safety Compliance**, resource `e5aq-a4j2` on the NYC Open Data Socrata portal) containing exactly the fields Riser's due-date engine needs — device number, CAT1/CAT5 latest filing dates, device status, and building address/BIN. That means "connect to real DOB data" is a plain JSON GET against a public dataset, not the scraping/OCR risk it was previously assumed to be. This changes what counts as the honest MVP: the original north star (§1/§1a below, unchanged) says the gap is that property managers lack a portfolio-wide system and are stuck manually tracking dates — but requiring every device to be hand-typed solves a narrower problem than that, when DOB has already computed most of those dates for us. This revision keeps manual entry as a first-class, always-available path (not every device is in the dataset, and the numbers must stay user-correctable) and adds real-data lookup as the higher-leverage default. The lookup is address-first from the user's perspective — a manager types the building's address, and Riser resolves that to a BIN on the backend before querying the DOB dataset; the BIN itself is an implementation detail, not something a manager should need to know or type. **Note on the geocoding step:** the address→BIN resolver this assumes (NYC Planning's GeoSearch API) could not be confirmed reachable during this revision — see the Open Questions and `docs/architecture/integration-contracts.md` for the risk and fallback plan.

## 1. Problem

Commercial property managers are risking thousands of dollars in municipal fines because they lack a single, structured system to track fragmented, recurring elevator compliance deadlines across multiple buildings.

**Supporting Context (optional)**

- NYC has 84,000+ registered elevator/escalator devices citywide, including 63,000+ passenger elevators (NYC DOB Elevator Report).
- Failure to file a Category 1 (annual) inspection report carries a $3,000-per-elevator fine, plus $150/month/elevator in late fees.
- Failure to file a Category 5 (5-year) inspection report carries a $5,000-per-elevator fine, plus $250/month/elevator in late fees.

### 1a. Opportunity

Give property managers overseeing multi-building portfolios a single system to see every elevator's compliance status at a glance, removing the manual tracking burden that currently causes preventable fines — starting with NYC's 84,000+ regulated elevator devices, a market with no dominant portfolio-level compliance tool today.

**Market Opportunity**

- NYC alone has 84,000+ elevator/escalator devices under DOB jurisdiction, including 63,000+ passenger elevators.
- Two recurring, high-stakes filing categories (CAT1 annual, CAT5 five-year) each carry $3,000–$5,000+ per-device fines for missed filings — real, quantifiable financial exposure that a tracking tool directly addresses.
- **New:** the underlying filing data (device status, CAT1/CAT5 latest-filed dates) is already public via NYC Open Data, but nothing aggregates it into a portfolio-level, risk-ranked view — the gap is synthesis and triage, not data collection. That's a sharper, more defensible version of the same opportunity.

### 1b. Users & Needs

**Primary user(s):** Commercial property managers who oversee portfolios of multiple buildings and are personally accountable for keeping every elevator's inspection paperwork current. **Secondary users:** Building owners who want visibility into their portfolio's compliance status without managing day-to-day inspection logging themselves (view-only).

**Key User Needs**

- As a property manager, I need to see every elevator across my portfolio ranked by compliance urgency because I currently have to check buildings one at a time to find what's at risk.
- As a property manager, I need to add a building and have its elevators' compliance data populate automatically wherever possible, instead of re-typing dates that DOB has already recorded.
- As a property manager, I need to log or correct a device's inspection date and type myself when it isn't in the public dataset, so the system still works for buildings DOB data doesn't cover.
- As a building owner, I need a read-only view of my portfolio's compliance status so I can confirm my property manager is staying ahead of deadlines.

## 2. Proposed Solution

Riser is a web app that gives commercial property managers a single, prioritized view of every elevator's compliance status across their portfolio. A manager adds a building by its address, and Riser resolves that address to a BIN (Building Identification Number) on the backend and automatically pulls that building's known elevators and their latest CAT1/CAT5 filing dates from NYC's public DOB NOW Open Data feed — no manual re-entry required for devices DOB already has on file, and no need for the manager to know or enter a BIN themselves. For devices absent from that feed, or when a manager wants to override the pulled data, manual entry (device identifier, inspection type, last inspection date) remains fully supported. Riser's deterministic interval engine calculates each device's next statutory due date and assigns it a Compliant, Warning, or Delinquent status, so managers see which elevators need attention first instead of cross-referencing paper certificates, spreadsheets, or hunting through a government data portal themselves.

### 2a. Value Proposition

Commercial property managers who struggle to track fragmented, recurring elevator inspection deadlines across multiple buildings use Riser, a web-based compliance ledger, to pull in real DOB filing data by building and instantly see which devices are at risk. Unlike scattered spreadsheets, paper certificates, or manually cross-referencing NYC's own open-data portal, Riser aggregates the compliance picture automatically, calculates each elevator's next due date, and surfaces delinquent devices at the top of a color-coded list — helping managers avoid the $3,000–$5,000+ per-device fines tied to missed NYC DOB filings.

### 2b. Top 3 MVP Value Props

- **The Vitamin** _(must-have baseline):_ A flat, portfolio-wide ledger where managers can add, view, and remove buildings and elevators in one place — populated from real data where possible, manual entry where not.
- **The Painkiller** _(solves the core pain):_ Automatic due-date calculation and color-coded risk status (Compliant/Warning/Delinquent) that eliminates manual date-tracking across spreadsheets, paper certificates, _and_ raw government data lookups.
- **The Steroid** _(the magic moment):_ Adding a building by address instantly populates its entire elevator roster with real, current DOB filing data and risk-ranks it — turning a task that used to mean N manual forms (or a trip to NYC Open Data) into one address lookup, with delinquent devices bubbling to the top in real time as data changes.

### 2c. Goals & Non-Goals

**Goals**

- Give property managers a single, structured system to track elevator compliance deadlines across a multi-building portfolio, replacing fragmented spreadsheets and paper records.
- Make elevator compliance risk visible at a glance by automatically triaging devices into Compliant, Warning, and Delinquent tiers based on real-time date math.
- Wherever real DOB filing data exists for a device, use it as the default — reserve manual entry for devices/fields the public dataset doesn't cover, rather than requiring hand-entry as the only path.
- Ship a complete, reliable, end-to-end demo by the final capstone presentation (2026-07-29) with no dependency on infrastructure the team can't stand up and verify within the build window.

**Non-Goals**

- No OCR or PDF parsing of inspection certificates — DOB's own structured Open Data feed removes the need to parse documents at all; anything outside that feed is entered manually via dropdowns and date pickers.
- No automated outbound communications (email, SMS, calendar invites) sent without a human in the loop — if Riser drafts agency-outreach or manager alerts, a person reviews and sends them; Riser does not send on its own.
- No standing/background polling service — DOB data is refreshed on-demand (when a building is added or a manager triggers a refresh), not via a continuously-running scheduled job. A pull-based demo is far lower-risk than an unattended job breaking silently before the demo.
- No automated sourcing of defect-level detail (ELV3 outcomes, ELV29 affirmations, violation specifics) — no public dataset for this has been confirmed yet (open question below), so Journey 3 stays manual-entry-only until one is identified and vetted.

### 2d. Success Metrics

| Goal | Signal | Metric | Target |
| --- | --- | --- | --- |
| Single structured tracking system | Manager can view the full portfolio in one ranked list | Elevators visible in the triage list without pagination issues | Portfolio of 25+ elevators renders in one continuous ranked list; Delinquent devices always appear in the top 5 positions |
| Risk visible at a glance | Status updates the instant an inspection date is entered, edited, or pulled from DOB | Time between a data change and the UI reflecting the new status/rank | Status and rank update immediately (<1s, no page reload) on every change |
| Real data reduces manual entry | Adding a building's elevator roster via address lookup vs. one-by-one manual forms | Number of user actions required to onboard an N-device building already in the DOB dataset | 1 address lookup onboards all of a building's known devices, vs. N manual forms today |
| Reliable end-to-end demo by the final presentation | All P0 requirements pass manual QA before demo day | % of P0 requirements verified working | 100% of P0 requirements passing by 2026-07-29; 0 errors across 3 consecutive dry-run demo rehearsals |

## 3. Requirements

### User Journey 1: Property manager building and maintaining their portfolio

**Context:** This is the manager's first and ongoing interaction with Riser — before any risk triage can happen, they need a fast, low-friction way to get their buildings and elevators into the system, using real data where it exists.

**Sub-journey: Adding a building via real DOB data (new)**

- 🔴 **[P0]** User can add a building by entering its street address; the backend resolves that address to a BIN (via NYC Planning's GeoSearch API) and calls the NYC Open Data "DOB NOW: Elevator Safety Compliance" feed, returning that building's known devices with device number, device status, CAT1/CAT5 latest-filed dates, and address. The manager never sees or enters a BIN directly — it's resolved server-side.
- 🟢 **[P1]** User can review the pulled device list before saving and override any field (e.g., correct a stale filing date) — DOB data is a default, not an unchangeable source of truth.
- 🟢 **[P1]** If an address doesn't resolve to a BIN, or the BIN returns no devices, or the lookup fails, the user falls back to the manual add-building/add-elevator flow (Sub-journey below) with a clear explanatory message, not a dead end.
- ⚪ **[P2]** User can trigger a manual "refresh from DOB" action on an existing building to re-pull current filing data on demand.

**Sub-journey: Adding buildings and elevators manually**

- 🔴 **[P0]** User can add a building with a name/address.
- 🔴 **[P0]** User can add an elevator to a building with a device identifier, inspection type (CAT1 Annual or CAT5 Five-Year), and last inspection date.
- 🔴 **[P0]** User can view a list of all buildings and elevators in their portfolio.
- 🟢 **[P1]** User can edit an existing elevator's last inspection date or inspection type.
- ⚪ **[P2]** User can delete a building or elevator from the portfolio.

**Sub-journey: Getting started (empty state)**

- 🟢 **[P1]** User sees a polished empty-state screen with explicit instructions the first time they open the app with no devices logged, pointing to the address-lookup path as the fast start.
- ⚪ **[P2]** User can add a sample/demo building with one click to explore the app before entering real data.

### User Journey 2: Property manager triaging portfolio-wide compliance risk

**Context:** This is the core value of Riser and the centerpiece of the demo — the manager needs to instantly see which elevators are at risk without manually checking dates building by building or cross-referencing a government data portal.

**Sub-journey: Viewing the risk-triage ledger**

- 🔴 **[P0]** User can see every elevator across their portfolio in a single list, automatically sorted with the most urgent (Delinquent, then Warning, then Compliant) at the top.
- 🔴 **[P0]** System automatically calculates each elevator's next due date from its last inspection date and inspection type (CAT1: +1 year; CAT5: +5 years), regardless of whether that date came from DOB data or manual entry.
- 🔴 **[P0]** System assigns each elevator a Compliant, Warning (due within 30 days), or Delinquent (past due date) status based on the calculated due date and the current date.
- 🔴 **[P0]** Each status is shown with a distinct, high-contrast color (e.g., green/yellow/red) so risk is visible without reading dates.
- 🟢 **[P1]** User can see which building an elevator belongs to directly in the ledger, without navigating away.
- 🟢 **[P1]** User can filter or group the ledger by building.
- ⚪ **[P2]** User can filter the ledger by status (e.g., show only Delinquent).

**Sub-journey: Reacting to a status change (the demo moment)**

- 🔴 **[P0]** When a user edits an elevator's last inspection date (manually, or via a DOB refresh), its due date, status, and position in the ranked list update immediately.
- 🟢 **[P1]** User sees a brief visual indicator (e.g., highlight/animation) when a device's status changes, so the demo moment is visible in real time.

**Sub-journey: Timeline & narration (new)**

- 🟢 **[P1]** User can view a Timeline tab showing upcoming compliance due dates across the whole portfolio (e.g., next 90 days), not just the current-status ledger.
- 🔴 **[P0]** **Decided (closes issue #1):** Riser ships a proactive risk-narration briefing — an on-demand (button-triggered, not push/scheduled, per the "no automated notifications" non-goal) Claude API call over already-computed ledger state, producing a plain-language summary of urgent/recent portfolio risk (e.g., "3 elevators are Delinquent, 2 enter Warning this week — prioritize X first"). Chosen over a conversational chat-copilot agent for lower live-demo risk (no multi-turn unpredictability to rehearse). Scheduled Sun 2026-07-26 per `docs/sprints/day-by-day-plan.md`; treated as non-negotiable for the capstone AI-agent requirement, ranked above the DOB auto-populate stretch in the plan's cut order.

### User Journey 3: Property manager tracking the post-inspection filing lifecycle (new, roadmap-honest)

**Context:** Captured from Andres' vision (issue #20) so the real end-to-end DOB lifecycle — inspection → defect → correction → affirmation — is represented in the PRD, even though the data source for automating it isn't confirmed yet (see Open Questions). All of Journey 3 is manual entry for now.

- ⚪ **[P2]** User can record a defect found during a device's inspection (description, date found, hazardous yes/no).
- ⚪ **[P2]** Riser calculates the DOB 90-day correction-and-reinspection deadline from a defect's recorded date and folds it into that device's risk status.
- ⚪ **[P2]** User can mark a defect corrected and record its ELV29 Affirmation of Correction filing (filed date, reference/notes).
- ⚪ **[P2]** Devices with an open hazardous-flagged defect surface as a distinct, higher-severity indicator, separate from the routine Warning/Delinquent tiers.
- 🔵 **[P3 / post-MVP]** User can generate a pre-filled agency-outreach email (building details, requested inspection window) that the manager reviews and sends themselves — Riser drafts, never auto-sends, per the Non-Goals above.

## 4. Appendix

**Design Decisions**

- Decision: MVP uses NYC DOB Category 1 (annual) and Category 5 (5-year) inspection intervals as static constants rather than a configurable/generic interval system. Rationale: keeps the interval engine simple and demo-ready within the 2-week window while still reflecting a real regulatory framework. Alternative considered: a fully generic/configurable interval system supporting any jurisdiction — rejected as unnecessary scope for a single-city MVP demo.
- **Decision (closes issue #1): the embedded-AI-agent capstone requirement is satisfied by a proactive risk-narration briefing** (§3 Journey 2), not a conversational chat copilot, an OCR certificate-intake assistant, or a maintenance dispatch draft assistant — the other three candidates issue #1 raised. Rationale: lowest live-demo risk (single-turn, over already-correct data, no multi-turn unpredictability to rehearse) while still satisfying the requirement. See `docs/sprints/day-by-day-plan.md` for the scheduled build (Sun 2026-07-26) and its non-negotiable priority in the cut order.
- Decision: Warning threshold set at 30 days before due date; Delinquent triggers immediately upon passing the due date. Rationale: gives a clean, demonstrable three-tier state model without tunable settings.
- **Decision (new): use NYC Open Data's "DOB NOW: Elevator Safety Compliance" Socrata dataset (`e5aq-a4j2`) as the source for auto-populating CAT1/CAT5 filing dates and device status by BIN.** Rationale: it's a free, structured, no-auth-required public dataset already containing the exact fields the due-date engine needs (`device_number`, `cat1_latest_report_filed`, `cat5_latest_report_filed`, `periodic_latest_inspection`, `device_status`, plus `bin`/`borough`/`house_number`/`street_name` for the address label), which reframes "connect to DOB" from a scraping/OCR risk into a plain JSON GET request. Alternative considered: stay fully manual-entry-only, as in v1 — rejected because it solves a narrower problem than the one stated in §1/§1a once it was confirmed the real data is this accessible.
- **Decision (new): the user-facing lookup is address-first; BIN resolution happens server-side via NYC Planning's public GeoSearch API.** Rationale: property managers think in addresses, not BINs — asking them to look up and enter a BIN themselves would reintroduce exactly the kind of manual, government-portal friction this feature exists to remove. The backend resolves address → BIN → DOB filing data as one chained lookup; the BIN never surfaces in the UI. Alternative considered: have the user enter the BIN directly — rejected as an unnecessary implementation detail leaking into the user-facing flow.
- **Decision (new): DOB data refresh is on-demand (pull), not a background poller.** Rationale: no scheduling/deploy infrastructure exists yet, and pull-based refresh still satisfies "see current status at a glance" without the operational risk of a standing job breaking silently during the demo window.
- **Decision (new): Journey 3 (filing lifecycle) is manual-entry-only pending a confirmed data source.** Rationale: issue #20 flagged ELV3/ELV29/violation data as unresearched; committing to automated sourcing before identifying and vetting the actual dataset is a scope risk the team shouldn't take on this close to demo day. The requirement is captured honestly rather than either promising automation or dropping the idea entirely.

**Open Questions**

- Does NYC Open Data publish defect/violation-level detail suitable for automated ELV3/ELV29 tracking, or is a different dataset needed (e.g., a DOB NOW Safety violations feed)? Owner: Andres Ballares — blocks Journey 3 moving past manual entry.
- Should an NYC Open Data app token be provisioned for higher rate limits, or is anonymous access sufficient at demo scale? Owner: Karl Johnson.
- Is NYC Planning's GeoSearch API (assumed no-auth) actually reachable, or has it been retired in favor of the key-required Geoservice API? One live check during this revision returned HTTP 410 Gone from the GeoSearch search endpoint while its own landing page showed no deprecation notice — status is unresolved. Owner: Cornell Robertson — must be confirmed before Monday 2026-07-27's integration work starts (see `docs/architecture/integration-contracts.md`); if neither option is quickly usable, the address-lookup feature falls back to manual BIN entry or is cut per the day-by-day plan's cut order.
- How should address→BIN resolution handle ambiguous matches (e.g., multiple buildings/BINs on one tax lot, or an address the resolver can't confidently match)? Owner: Cornell Robertson — needs a decision before the address-lookup flow ships (e.g., show a disambiguation list vs. take the first match).
- Should Riser eventually support jurisdictions beyond NYC? Now more consequential than in v1, since the DOB Open Data integration is NYC-specific — a multi-jurisdiction version needs a different data source per city. Owner: Karl Johnson — not needed before Day 14, worth flagging for v2 roadmap discussion.
- Should Category 3 (escalator) inspections be added, or does the MVP stay elevator-only? Owner: Karl Johnson — assumed elevator-only per the problem statement; confirm before adding device types.

**Other Links**

- NYC DOB Elevator Compliance overview: https://www.nyc.gov/site/buildings/safety/elevator-compliance.page
- 1 RCNY §103-02 (Elevator Inspections and Tests, Filing Requirements, Penalties and Waivers): https://www.nyc.gov/assets/buildings/rules/1_RCNY_103-02.pdf
- NYC Open Data — DOB NOW: Elevator Safety Compliance dataset: https://data.cityofnewyork.us/Housing-Development/DOB-NOW-Elevator-Safety-Compliance/e5aq-a4j2
- Tutor conversation defining MVP scope: `../tutor-convo.txt` (this repo)
- Issue #20 — Andres' post-MVP vision discussion (GitHub)
