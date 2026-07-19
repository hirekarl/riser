# What this changes

<!-- One or two sentences: what does this PR do, and why? -->

## PRD requirement / sprint task

<!-- Link the docs/prd/Riser-PRD.md requirement and/or docs/sprints/sprint-NN.md task this closes. -->

## Scope

- [ ] Backend (`backend/`)
- [ ] Frontend (`frontend/`)
- [ ] Both / integration
- [ ] Docs / process only (no deploy expected)

## Checklist

- [ ] Tests written first (TDD), and pass locally
- [ ] Coverage stays >=90% on the affected side (`pytest --cov`/`vitest --coverage`)
- [ ] `ruff`/`mypy`/`ty` (backend) or `eslint`/`tsc` (frontend) clean
- [ ] Commit messages follow Conventional Commits (no AI co-author trailers)
- [ ] Docs (`README.md`/`CLAUDE.md`/`.knowledge-base/`) updated if setup, commands, or tooling changed
- [ ] This PR does not push directly to `main` — it's targeting review

## How to verify

<!-- Steps for the reviewer: commands to run, pages to click through, etc. -->
