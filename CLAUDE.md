# CLAUDE.md

Guidance for Claude Code (and any human) working in this repo.

## What this is

**Riser** — a web app that gives commercial property managers a single, prioritized view of every elevator's NYC DOB compliance status across their portfolio. Full requirements: `docs/prd/Riser-PRD.md`. Current sprint: `docs/sprints/` (highest-numbered `sprint-NN.md`).

The MVP is a Django 6 + DRF backend (`backend/`) and a React 19 + TypeScript + Vite frontend (`frontend/`), single-tenant with no authentication (see `docs/adr/0002-no-auth-for-mvp.md` — confirm this assumption with the team before the demo if it hasn't been confirmed yet).

## Repo layout

```text
backend/    Django 6 + DRF API (apps/compliance/: models, services, views)
frontend/   React 19 + TypeScript + Vite SPA
docs/       PRD, ADRs, sprint tracking
scripts/    Hook scripts (env check, commit-msg guard, format-on-save, etc.)
.claude/    Subagents, skills, hooks config for this repo
.knowledge-base/   Quick-reference cheat sheets for this project's toolchain
```

## Opening ceremony

At the start of every session, a `SessionStart` hook runs `scripts/check-env.sh` (read-only — never mutates anything) and injects its output into context. When you see that output:

1. Summarize any `[warn]`/`[fail]` line in plain language for the user.
2. Propose the exact remediation command shown next to it.
3. **Ask before running anything that mutates state** — `uv sync`, `npm ci`/`install`, `pre-commit install`, `gh auth login`, `git checkout -b`, etc. Read-only commands (`git status`, `git fetch`) don't need confirmation first.

The same check can be re-run mid-session via the `/dev-check` skill.

## Toolchain command cheat sheet

Backend (from `backend/`): `uv sync`, `uv run python manage.py runserver`, `uv run pytest --cov --cov-fail-under=90`, `uv run ruff check .`, `uv run ruff format .`, `uv run mypy .`, `uv run ty check .`.

Frontend (from `frontend/`): `npm ci`, `npm run dev`, `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run test:e2e`, `npm run build`.

## Multi-agent architecture — mandatory TDD

Five subagents in `.claude/agents/`, each scope-bounded and each required to work **test-first** (write/adjust a failing test, confirm it fails, implement minimally, refactor with tests green):

| Agent | Owns | Does not own |
| --- | --- | --- |
| `backend-design-agent` | `backend/` — models, serializers, views, the due-date/status service | `frontend/`, API contract shape changes (joint with `integration-agent`) |
| `frontend-design-agent` | `frontend/src/` logic, state, data-fetching | final visuals/a11y (`ui-ux-specialist-agent`), API contract shape |
| `ui-ux-specialist-agent` | visual/interaction design, color/contrast, empty states, accessibility | component state/data-fetching |
| `integration-agent` | the API contract seam: DRF serializer shapes ↔ TS types ↔ API client ↔ CORS ↔ cross-layer e2e | unrelated backend logic, frontend visuals |
| `docs-sync-agent` | README/CLAUDE.md/CONTRIBUTING/CHANGELOG/docstrings/`.knowledge-base/` consistency | feature code, tests |

Coverage must stay **≥90%** on both `backend/` and `frontend/` — this is enforced by pre-push hooks and CI, not just a suggestion.

## `.knowledge-base/` — quick reference for this toolchain

`.knowledge-base/INDEX.md` maps to one `overview.md` leaf file per tool (Django, DRF, React, TypeScript, Vite, ESLint, uv, ruff, mypy-and-ty, pytest, Vitest, Playwright, pre-commit, commitizen, Render, GitHub Actions). Check there first when you hit a syntax question or a gotcha specific to this stack, and update the relevant leaf file yourself when you hit real friction with one of these tools — there's no automated nudge for this anymore (the `Stop` hook that used to prompt for it was removed after producing repeated false positives; see git history for `scripts/check-knowledge-friction.py` if reviving the idea).

## Git and commit hygiene

- Conventional Commits, enforced by commitizen at the `commit-msg` git stage. Use `cz commit` for a guided prompt if you don't want to hand-write the format.
- **Never add an AI co-author trailer** (e.g. `Co-Authored-By: Claude <...>`) to any commit message. A local pre-commit hook rejects these automatically, but do not rely on the hook alone — never generate one in the first place.
- Never push directly to `main` without going through review and CI, except the narrow, documented admin bypass (review-only, not CI) — see `CONTRIBUTING.md`.
- Work happens on feature branches (`<type>/<short-description>`), merged via PR with at least one approving review and green required CI checks.

## Working with Claude Code in this repo

See the "Working with Claude Code in this repo" section of `README.md` for the full breakdown of agents, hooks, skills, and useful built-in capabilities (`/code-review`, `/security-review`, `/simplify`, `/review`, Playwright MCP) for this project.
