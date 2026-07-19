# RISER

_Product Requirements Document: Net New Build_

**Build name:** Riser **Owner:** Karl Johnson, Andres Ballares, Cornell Robertson, Schiffon Lola Wise **Date:** July 19, 2026

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

### 1b. Users & Needs

**Primary user(s):** Commercial property managers who oversee portfolios of multiple buildings and are personally accountable for keeping every elevator's inspection paperwork current. **Secondary users:** Building owners who want visibility into their portfolio's compliance status without managing day-to-day inspection logging themselves (view-only).

**Key User Needs**

- As a property manager, I need to see every elevator across my portfolio ranked by compliance urgency because I currently have to check buildings one at a time to find what's at risk.
- As a property manager, I need to log each elevator's last inspection date and type so the system calculates its next compliance deadline for me instead of me tracking it manually in a spreadsheet.
- As a building owner, I need a read-only view of my portfolio's compliance status so I can confirm my property manager is staying ahead of deadlines.

## 2. Proposed Solution

Riser is a web app that gives commercial property managers a single, prioritized view of every elevator's compliance status across their portfolio. Users add each building and elevator, then log the device's last inspection date and inspection type (NYC DOB Category 1 annual or Category 5 five-year test). Riser's deterministic interval engine automatically calculates the next statutory due date and assigns the device a Compliant, Warning, or Delinquent status. As a result, property managers can open the app and immediately see which elevators need attention first, instead of cross-referencing paper certificates and spreadsheets across buildings.

### 2a. Value Proposition

Commercial property managers who struggle to track fragmented, recurring elevator inspection deadlines across multiple buildings use Riser, a web-based compliance ledger, to log inspection dates and instantly see which devices are at risk. Unlike scattered spreadsheets and paper certificates, Riser automatically calculates each elevator's next due date and surfaces delinquent devices at the top of a color-coded list, helping managers avoid the $3,000–$5,000+ per-device fines tied to missed NYC DOB filings.

### 2b. Top 3 MVP Value Props

- **The Vitamin** _(must-have baseline):_ A flat, portfolio-wide ledger where managers can add, view, and remove buildings and elevators in one place.
- **The Painkiller** _(solves the core pain):_ Automatic due-date calculation and color-coded risk status (Compliant/Warning/Delinquent) that eliminates manual date-tracking across spreadsheets and paper certificates.
- **The Steroid** _(the magic moment):_ Delinquent and at-risk elevators automatically bubble to the top of the list in real time the instant a date crosses a threshold, turning a manual portfolio scan into a single glance.

### 2c. Goals & Non-Goals

**Goals**

- Give property managers a single, structured system to track elevator compliance deadlines across a multi-building portfolio, replacing fragmented spreadsheets and paper records.
- Make elevator compliance risk visible at a glance by automatically triaging devices into Compliant, Warning, and Delinquent tiers based on real-time date math.
- Ship a complete, reliable, end-to-end demo by Day 14 with zero dependency on external APIs, file parsing, or notification infrastructure.

**Non-Goals**

- No OCR or PDF parsing of inspection certificates — all dates and device details are entered manually via dropdowns and date pickers.
- No live government/municipal scraping — the interval engine uses static, pre-researched NYC DOB Category 1 and Category 5 interval constants instead of live data.
- No automated notifications (no email, SMS, or calendar sync) — the MVP is a pull-based dashboard the user checks, not a push-based alerting system.

### 2d. Success Metrics

| Goal | Signal | Metric | Target |
| --- | --- | --- | --- |
| Single structured tracking system | Manager can view the full portfolio in one ranked list | Elevators visible in the triage list without pagination issues | Portfolio of 25+ elevators renders in one continuous ranked list; Delinquent devices always appear in the top 5 positions |
| Risk visible at a glance | Status updates the instant an inspection date is entered or edited | Time between saving a date change and the UI reflecting the new status/rank | Status and rank update immediately (<1s, no page reload) on every date edit |
| Reliable end-to-end demo by Day 14 | All P0 requirements pass manual QA before demo day | % of P0 requirements verified working | 100% of P0 requirements passing by Day 14; 0 errors across 3 consecutive dry-run demo rehearsals |

## 3. Requirements

### User Journey 1: Property manager building and maintaining their portfolio

**Context:** This is the manager's first and ongoing interaction with Riser — before any risk triage can happen, they need a fast, low-friction way to get their buildings and elevators into the system.

**Sub-journey: Adding buildings and elevators**

- 🔴 **[P0]** User can add a building with a name/address.
- 🔴 **[P0]** User can add an elevator to a building with a device identifier, inspection type (CAT1 Annual or CAT5 Five-Year), and last inspection date.
- 🔴 **[P0]** User can view a list of all buildings and elevators in their portfolio.
- 🟢 **[P1]** User can edit an existing elevator's last inspection date or inspection type.
- ⚪ **[P2]** User can delete a building or elevator from the portfolio.

**Sub-journey: Getting started (empty state)**

- 🟢 **[P1]** User sees a polished empty-state screen with explicit instructions the first time they open the app with no devices logged.
- ⚪ **[P2]** User can add a sample/demo building with one click to explore the app before entering real data.

### User Journey 2: Property manager triaging portfolio-wide compliance risk

**Context:** This is the core value of Riser and the centerpiece of the demo — the manager needs to instantly see which elevators are at risk without manually checking dates building by building.

**Sub-journey: Viewing the risk-triage ledger**

- 🔴 **[P0]** User can see every elevator across their portfolio in a single list, automatically sorted with the most urgent (Delinquent, then Warning, then Compliant) at the top.
- 🔴 **[P0]** System automatically calculates each elevator's next due date from its last inspection date and inspection type (CAT1: +1 year; CAT5: +5 years).
- 🔴 **[P0]** System assigns each elevator a Compliant, Warning (due within 30 days), or Delinquent (past due date) status based on the calculated due date and the current date.
- 🔴 **[P0]** Each status is shown with a distinct, high-contrast color (e.g., green/yellow/red) so risk is visible without reading dates.
- 🟢 **[P1]** User can see which building an elevator belongs to directly in the ledger, without navigating away.
- 🟢 **[P1]** User can filter or group the ledger by building.
- ⚪ **[P2]** User can filter the ledger by status (e.g., show only Delinquent).

**Sub-journey: Reacting to a status change (the demo moment)**

- 🔴 **[P0]** When a user edits an elevator's last inspection date, its due date, status, and position in the ranked list update immediately.
- 🟢 **[P1]** User sees a brief visual indicator (e.g., highlight/animation) when a device's status changes, so the demo moment is visible in real time.

## 4. Appendix

**Design Decisions**

- Decision: MVP uses NYC DOB Category 1 (annual) and Category 5 (5-year) inspection intervals as static constants rather than a configurable/generic interval system. Rationale: keeps the interval engine simple and demo-ready within the 2-week window while still reflecting a real regulatory framework. Alternative considered: a fully generic/configurable interval system supporting any jurisdiction — rejected as unnecessary scope for a single-city MVP demo.
- Decision: Warning threshold set at 30 days before due date; Delinquent triggers immediately upon passing the due date. Rationale: gives a clean, demonstrable three-tier state model without tunable settings.

**Open Questions**

- Should Riser eventually support jurisdictions beyond NYC (different inspection categories/intervals)? Owner: Karl Johnson — not needed before the Day 14 demo, worth revisiting for a v2 roadmap.
- Should Category 3 (escalator) inspections be added, or does the MVP stay elevator-only? Owner: Karl Johnson — assumed elevator-only per the problem statement; confirm before adding device types.

**Other Links**

- NYC DOB Elevator Compliance overview: https://www.nyc.gov/site/buildings/safety/elevator-compliance.page
- 1 RCNY §103-02 (Elevator Inspections and Tests, Filing Requirements, Penalties and Waivers): https://www.nyc.gov/assets/buildings/rules/1_RCNY_103-02.pdf
- Tutor conversation defining MVP scope: `../tutor-convo.txt` (this repo)
