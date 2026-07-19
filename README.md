# Riser

A web app that gives commercial property managers a single, prioritized view of every elevator's NYC DOB compliance status across their portfolio — automatically calculating due dates and surfacing Delinquent/Warning/Compliant risk so nothing slips past a filing deadline. Full product requirements: `docs/prd/Riser-PRD.md`.

## Prerequisites

- **uv** (Python package/venv manager):

  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```

- **Node.js + npm** — install via [nvm](https://github.com/nvm-sh/nvm):

  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  nvm install --lts
  ```

  Then, once inside `frontend/`, run `nvm use` to pick up the version pinned in `frontend/.nvmrc`.

- **GitHub CLI** (`gh`) — used to sync PRs/reviews: [cli.github.com](https://cli.github.com). Run `gh auth login` once installed.

## First-time setup

```bash
# Backend
cd backend
uv sync
cp .env.example .env  # fill in secrets for local dev

# Frontend
cd ../frontend
npm ci
cp .env.example .env

# Git hooks (from repo root)
cd ..
uv tool install pre-commit
pre-commit install --install-hooks -t pre-commit -t pre-push -t commit-msg
```

## Running it

```bash
# Backend dev server (from backend/)
uv run python manage.py migrate
uv run python manage.py runserver

# Frontend dev server (from frontend/, separate terminal)
npm run dev
```

## Tests, lint, and type-checking

These mirror exactly what CI and the pre-commit/pre-push hooks run:

```bash
# Backend (from backend/)
uv run ruff check .
uv run ruff format --check .
uv run mypy .
uv run ty check .
uv run pytest --cov --cov-fail-under=90

# Frontend (from frontend/)
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run test:e2e
```

Both sides enforce a **≥90% coverage gate** — this is a hard requirement, not a suggestion.

## Project structure

```text
backend/    Django 6 + DRF API (apps/compliance/: models, services, views)
frontend/   React 19 + TypeScript + Vite SPA
docs/       PRD, ADRs, sprint tracking (docs/sprints/)
scripts/    Hook scripts (env check, commit-msg guard, format-on-save, etc.)
.claude/    Subagents, skills, and hooks config for this repo
.knowledge-base/  Quick-reference cheat sheets for this project's toolchain
```

## Deployment

Deployed on [Render](https://render.com) via `render.yaml` — two independently-deployed services (`riser-backend`, `riser-frontend`), split so a change under one directory never redeploys the other, and a docs-only change redeploys neither. Connecting the repo to Render and enabling "only deploy if checks pass" against GitHub CI is a one-time manual step in the Render dashboard.

## Working with Claude Code in this repo

This repo has a multi-agent Claude Code setup under `.claude/`. All agents and all human contributors are expected to work **test-first (TDD)**: write/adjust a failing test, confirm it fails, implement minimally, refactor with tests green.

### Subagents (`.claude/agents/`)

| Agent | Purpose | Invoke when |
| --- | --- | --- |
| `backend-design-agent` | Django/DRF models, serializers, views, the due-date/status service | Any `backend/` change |
| `frontend-design-agent` | React component logic, state, data-fetching | Any `frontend/src/` logic change |
| `ui-ux-specialist-agent` | Visual/interaction design, color/contrast, empty states, accessibility | New UI surfaces, a11y fixes |
| `integration-agent` | The API contract seam — serializer shapes ↔ TS types ↔ API client ↔ CORS ↔ e2e | Any endpoint shape change |
| `docs-sync-agent` | Keeps README/CLAUDE.md/CONTRIBUTING/CHANGELOG/docstrings/knowledge-base truthful | After other agents finish a change |

Ask the main Claude Code agent to delegate to one of these, or invoke them directly via the Agent tool.

### Hooks (`.claude/settings.json`)

| Hook | Fires | What it does |
| --- | --- | --- |
| `SessionStart` | Start of every session | Runs `scripts/check-env.sh` (read-only) — reports missing installs, out-of-sync deps, missing `.env` files, uninstalled git hooks, `gh` auth status, and current branch. Claude summarizes findings and proposes fixes, but asks before running anything that mutates state. |
| `Stop` | End of a turn | Runs `scripts/check-knowledge-friction.py` — if the turn hit friction with a project tool (Django, React, uv, Vite, Render, pytest, Vitest, Playwright, eslint, mypy/ty, ruff, commitizen, pre-commit), nudges Claude to add/update a `.knowledge-base/<topic>/overview.md` leaf before actually stopping. Fires at most once per stop (won't loop). |
| `PostToolUse` | After every Edit/Write | Runs `scripts/format-on-save.sh` — auto-runs `ruff format`/`prettier --write` on the touched file. Advisory only; pre-commit still enforces correctness at commit time. |

### Skills (`.claude/skills/`)

- **`/new-sprint`** — scaffolds the next `docs/sprints/sprint-NN.md` from `TEMPLATE.md`, auto-incrementing the number and the two-week date range.
- **`/dev-check`** — re-runs the same environment check the `SessionStart` hook runs, on demand, mid-session.

### Useful built-in Claude Code capabilities (not configured by this repo, but worth knowing about here)

- **`/code-review`** (and **`/code-review ultra`** for a deeper multi-agent pass) — run before merging any PR.
- **`/security-review`** — run before merging anything touching the API surface.
- **`/simplify`** — a focused quality/simplification pass.
- **`/review <PR#>`** — review a teammate's GitHub PR.
- **Playwright MCP browser tools** — for ad hoc manual verification of the running frontend during development, separate from the checked-in Playwright test suite in `frontend/e2e/`.

See `CLAUDE.md` for the full project-context brief these agents/hooks/skills operate under, and `CONTRIBUTING.md` for branching, commit, and review conventions.
