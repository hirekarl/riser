# Changelog

## v0.8.0 (2026-07-29)

### Feat

- **frontend**: split App into Ledger/Manage Portfolio tabs
- **frontend**: consolidate executive UI redesign from PR #127 and #128
- **frontend**: make ledger table columns sortable
- surface DOB fine/penalty exposure across the portfolio (#120)
- add a typed-confirmation portfolio reset for demo purposes
- **backend**: expose dob_device_number and seed demo data from live DOB lookups
- **frontend**: add SoftwareApplication JSON-LD structured data
- **frontend**: add llms.txt describing Riser the product
- **frontend**: add explicit AI-crawler entries to robots.txt
- **frontend**: add noindex baseline and placeholder social card
- **backend**: add X-Robots-Tag noindex middleware
- **frontend**: add "Try sample data" button to seed demo data
- **backend**: add POST /api/demo-data/seed/ endpoint
- **frontend**: add status filter to the compliance ledger
- **frontend**: add delete actions for elevators and buildings
- **frontend**: add Timeline tab for upcoming due dates
- **backend**: add DOB address-lookup endpoint
- **frontend**: add DOB address-lookup form and review screen
- **backend**: implement AI risk-narration briefing endpoint
- **frontend**: replace default favicon with Riser brand mark

### Fix

- **infra**: switch riser-frontend to commit-based auto-deploy trigger
- **backend**: auto-load .env for local development
- **compliance**: filter inactive DOB devices and aggregate safety + ECB violations per building
- **frontend**: show Building name as visibly required in address-lookup review
- **frontend**: scroll and focus the edit form when Edit is clicked (#118)
- **render**: switch riser-backend to autoDeployTrigger: commit
- **frontend**: make dark-mode CSS and the theme toggle respect each other
- **frontend**: fix dark-mode contrast, add theme toggle, and wire dob_device_number
- **docs**: correct PR numbers, dates, and attribution in merge-session log
- **e2e**: scope delinquent-text locator to ledger table
- **frontend**: surface cascade-delete risk and fix focus loss on row delete
- **frontend**: disambiguate e2e getByLabel(/address/i) after AddressLookupForm
- **frontend**: use a collision-safe key for DOB disambiguation candidates
- **frontend**: use picked candidate's address after DOB disambiguation
- **frontend**: guard NarrationPanel against unmount, log swallowed errors
- **backend**: use a real Haiku model id for narration generation

## v0.7.0 (2026-07-26)

### Feat

- **frontend**: add elevator detail/remediation panel to the ledger
- **frontend**: apply v3 design pass — brand tokens, wordmark, AI briefing card

### Fix

- **frontend**: fix due-date math, time-bomb test, and a11y label on remediation panel
- **frontend**: fix dark-mode contrast on v3 brand colors
- **frontend**: replace gradient buttons with WCAG-compliant solid rust
- **frontend**: surface generated_at and remove duplicate loading a11y announcement
- **frontend**: hardcode v3 accent colors per-module instead of index.css tokens
- **design**: remove DOB BIN from auto-recognize match card

## v0.6.0 (2026-07-26)

### Feat

- **frontend**: add on-demand AI-narration panel

## v0.5.0 (2026-07-25)

### Feat

- **frontend**: add a status-meaning legend and reconcile ledger edit affordances
- **frontend**: add ErrorBoundary around App and the ledger view
- **frontend**: add a minimal logging utility and wire it into existing catch blocks
- **backend**: add custom DRF exception handler with structured logging
- **integration**: add frontend/.env.example documenting VITE_API_BASE_URL
- **frontend**: add elevator-edit mode to ElevatorForm

### Fix

- **e2e**: click Save after editing the inline ledger date
- **docs**: remove README claim that DOB address-lookup is already live
- anchor lib/lib64 gitignore rules to repo root
- **frontend**: make StatusBadge and the buildings fetch resilient with retry
- **backend**: correct stale ALLOWED_HOSTS hostname in .env.example
- **backend**: validate the building query param and return 400 for non-numeric ids
- **frontend**: prevent stale-edit race between inline date input and edit form
- **frontend**: contain ledger table overflow on narrow viewports
- **render**: correct backend hostname in ALLOWED_HOSTS/VITE_API_BASE_URL
- **render**: repair blueprint for first deploy

### Refactor

- **frontend**: replace auto-save inline date edit with explicit confirm state
- **backend**: use a regex for local CORS fallback ports

## v0.4.0 (2026-07-25)

### Feat

- **backend**: add seed_demo_data management command
- **frontend**: add TS types/client methods for narration + address lookup
- **frontend**: highlight ledger rows on status change
- **frontend**: filter the ledger by building

## v0.3.0 (2026-07-22)

### Feat

- **compliance**: POC address->BIN->DOB device resolver + geocoding findings
- **compliance**: support ?building= filter on the ledger endpoint
- **frontend**: add building filter param to listElevators client
- **frontend**: add polished empty-state component to ledger

### Fix

- **backend**: make status boundary tests timezone-safe
- **hooks**: stop knowledge-friction hook from joining unrelated blocks
- **tooling**: configure root mypy.ini and pyright for editor and script type checks
- **hooks**: scope knowledge-friction detection to real Bash failures
- **ci**: sync frontend package version and auto-update it on release

## v0.2.0 (2026-07-19)

### Feat

- **claude**: add multi-agent architecture, knowledge base, and project docs
- **frontend**: scaffold React 19 + TypeScript + Vite SPA
- **backend**: scaffold Django 6 + DRF compliance API

### Fix

- **ci**: regenerate backend lockfile in release workflow
- **ci**: configure git identity in release workflow
- **ci**: pass --yes to cz bump --dry-run to avoid interactive prompt
- **ci**: name commitizen-check job to match required status check
- **ci**: use correct commitizen entrypoint name in uvx invocations
- **docs**: correct sprint cadence to two one-week sprints
