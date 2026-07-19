# Riser Knowledge Base — Index

Fast-reference lookup for Claude Code agents working in this repo. Each row links to a leaf file with a syntax cheatsheet, project-specific gotchas, a minimal example, and links back to the official docs it was grounded in. This is a quick-reference cheat sheet, not exhaustive documentation — when in doubt, follow the References links in the leaf file.

| Topic | Leaf file | One-line scope |
| --- | --- | --- |
| Django | [django/overview.md](django/overview.md) | Django 6 model fields, migrations workflow, 6.0 release changes |
| DRF | [drf/overview.md](drf/overview.md) | DRF ViewSets/routers, ModelSerializer, computed fields |
| React | [react/overview.md](react/overview.md) | React 19 hooks, Actions/useActionState, ref-as-prop, `use()` |
| TypeScript | [typescript/overview.md](typescript/overview.md) | Everyday type syntax, unions/narrowing, utility types, this repo's strict tsconfig flags |
| Vite | [vite/overview.md](vite/overview.md) | vite.config.ts structure, env vars/modes, VITE\_ prefix rule |
| ESLint | [eslint/overview.md](eslint/overview.md) | Flat config (eslint.config.js) syntax with typescript-eslint, react-hooks, and jsx-a11y plugins |
| uv | [uv/overview.md](uv/overview.md) | uv add/remove, dependency-groups (PEP 735), uv sync --locked vs --frozen, uv run |
| ruff | [ruff/overview.md](ruff/overview.md) | pyproject.toml [tool.ruff] lint/format config, select vs extend-select |
| mypy & ty | [mypy-and-ty/overview.md](mypy-and-ty/overview.md) | Both checkers run intentionally (ty fast/local, mypy authoritative/CI); django-stubs wiring |
| pytest | [pytest/overview.md](pytest/overview.md) | Fixtures/conftest, pytest-django settings wiring, django_db marker, time-machine |
| Vitest | [vitest/overview.md](vitest/overview.md) | test config placement, jsdom environment, coverage.thresholds shape |
| Playwright | [playwright/overview.md](playwright/overview.md) | webServer config (incl. multi-service for this monorepo), route mocking for e2e |
| pre-commit | [pre-commit/overview.md](pre-commit/overview.md) | .pre-commit-config.yaml, language: system vs isolated envs, multi-stage hooks |
| commitizen | [commitizen/overview.md](commitizen/overview.md) | Conventional Commits via cz commit, cz bump, version_files sync across backend/frontend |
| Render | [render/overview.md](render/overview.md) | render.yaml Blueprint spec, buildFilter monorepo scoping, databases/envVars |
| GitHub Actions | [github-actions/overview.md](github-actions/overview.md) | Workflow syntax, required-status-check + path-filter merge-blocking gotcha |

Git LFS was deliberately skipped as a topic — this repo has no large binary assets that need it.

## Research status notes

- `mypy-and-ty` and `pytest`: direct WebFetch to `mypy.readthedocs.io`, `docs.pytest.org`, and `pytest-django.readthedocs.io` hit HTTP 429 rate limits during research; those two leaf files were grounded via web search results quoting the same official pages instead of a direct fetch. Each file's own "Status" line notes this — re-verify directly against those docs sites if something looks stale.
- All other 14 leaf files were grounded in a direct, successful WebFetch of the official docs URL(s) listed in that file's own "Official docs" line.
