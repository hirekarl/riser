# Contributing to Riser

## Team

Karl Johnson, Andres Ballares, Cornell Robertson, Schiffon Lola Wise.

Per-sprint task ownership is TBD — see `docs/sprints/` for the current sprint's assignments. Each collaborator maintains their own checklist subsection in the active `docs/sprints/sprint-NN.md` file.

## Branching and PRs

- Never commit directly to `main` (repo admins may bypass the review requirement only when necessary — see below — but CI must still pass).
- Branch names: `<type>/<short-description>`, e.g. `feat/ledger-sort`, `fix/due-date-leap-year`.
- Every PR requires at least one other collaborator's approving review before merge, and all required CI status checks must be green.
- Repo admins can bypass the _review_ requirement (e.g. for an urgent direct fix) but not the CI requirement — a direct push to `main` still has to pass `backend-ci`, `frontend-ci`, and the commit-lint check.
- Opening a PR auto-fills `.github/pull_request_template.md`; filing an issue picks between the bug report and task templates in `.github/ISSUE_TEMPLATE/`.

## Commit messages

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/), enforced by [commitizen](https://commitizen-tools.github.io/commitizen/) at the `commit-msg` git-hook stage. Use `cz commit` (or `uv run cz commit` from `backend/`) for a guided prompt if you don't want to hand-write the format.

Commit messages must never include an AI co-author trailer (e.g. `Co-Authored-By: Claude <...>`) — a local pre-commit hook rejects any commit message containing one.

## Sprint tracking

Work is tracked in one-week sprints (two of them cover the full MVP window) as version-controlled markdown files under `docs/sprints/`. At the start of each cycle, copy `docs/sprints/TEMPLATE.md` to `docs/sprints/sprint-NN.md` (incrementing NN), fill in the sprint goal and the PRD requirement IDs/priorities in scope (from `docs/prd/Riser-PRD.md` section 3), and have each collaborator maintain their own checklist subsection. The `/new-sprint` Claude Code skill automates the file-creation part of this. This is intentionally lightweight and lives in git, not an external tool.

Future upgrade path (not built now): once the team wants heavier project-management tooling, this could migrate to GitHub Projects/Issues/ Milestones.

## TDD workflow

All five Claude Code subagents (see `CLAUDE.md`) and all human contributors are expected to work test-first: write or adjust a failing test, confirm it fails, implement the minimal code to pass, then refactor with tests green. Coverage must stay at or above 90% on both `backend/` and `frontend/`.
