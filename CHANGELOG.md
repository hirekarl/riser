# Changelog

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
