# GitHub Actions

Official docs: https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions, https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches

## Syntax / Usage Cheatsheet

- Trigger events under `on:` — single (`on: push`), multiple (`on: [push, pull_request]`), or per-event filters (branches, tags, `paths`/`paths-ignore`) and activity types (`on.pull_request.types: [opened, synchronize]`).
- `jobs:` is a map of `job_id -> job config`; jobs run in parallel by default unless one declares `needs: [other_job_id]`. Each job has ordered `steps:` (shell commands or `uses: action@ref`).
- Workflow-level `paths:`/`paths-ignore:` filters skip triggering the _entire workflow_ when no changed file matches — `paths` and `paths-ignore` cannot both be set for the same event trigger; use `!pattern` inside a single `paths` list to mix include/exclude.
- Diff basis for path filters differs by event: a three-dot diff for pull requests (changes since the PR's merge-base), a two-dot diff for pushes (changes between before/after SHA).
- Monorepo pattern for scoping a workflow to one subtree: `on: pull_request: paths: ["backend/**"]`.
- `concurrency:` (job or workflow level) with a `group:` key plus `cancel-in-progress: true` cancels superseded runs on the same PR/branch — standard for avoiding redundant CI runs on rapid pushes.
- Reusable/composite patterns: `workflow_call` for callable workflows, `actions/checkout@v4` + `actions/setup-python`/`actions/setup-node` as the near-universal first two steps.

## Project-Specific Gotchas

- **The required-status-check + path-filter interaction gotcha** (well-known, confirmed directly in GitHub's own workflow-syntax docs): if a workflow has a trigger-level `paths:`/`paths-ignore:` filter and a given PR touches no matching file, the workflow **is skipped entirely** — but if that workflow's job is configured as a _required_ status check in branch protection, GitHub's docs state the check "will remain in a 'Pending' state," and a PR requiring it "will be blocked from merging" — indefinitely, since a skipped workflow never posts a completed status at all (not even a passing one). **The fix is to filter at the job/step level, not the workflow trigger level**: let the workflow trigger on every push/PR unconditionally, then add an early step (e.g. `dorny/paths-filter` or a manual `git diff` check) that sets a job output, and gate the rest of the job's steps on that output — this way the job still runs (and reports a real "success" status) even on unaffected PRs, just doing near-nothing.
- This repo is a `backend/` (Django/DRF, uv) + `frontend/` (Vite/React, npm) monorepo — the natural instinct is one workflow per side with a top-level `paths: ["backend/**"]` / `paths: ["frontend/**"]` filter each. Given the gotcha above, if either workflow's job is ever marked "required" in branch protection, that trigger-level filter must be converted to the job/step-level pattern first, or a frontend-only PR will be permanently blocked waiting on a backend CI check (and vice versa) that will never report.
- **No `.github/workflows/` directory exists yet** in this repo — when CI is added, decide the required-check strategy _before_ wiring branch protection rules, since retrofitting job-level filtering after a workflow is already marked required means every in-flight PR briefly sees a newly-"unblockable" required check until the fix merges.
- `concurrency` groups scoped by `github.workflow}-${{ github.ref }}` are worth adding from day one for this project's likely CI (ruff/mypy/ty/pytest on backend, oxlint/tsc/vitest/playwright on frontend) — these tool chains are not fast individually, and without concurrency cancellation, rapid-fire pushes to a PR branch queue up redundant full runs.

## Minimal Example

```yaml
# .github/workflows/backend-ci.yml
name: backend-ci
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: backend-ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: filter
        uses: dorny/paths-filter@v3
        with:
          filters: |
            backend:
              - 'backend/**'
      - if: steps.filter.outputs.backend == 'true'
        run: |
          uv sync --locked --project backend
          uv run --project backend pytest
```

## References

- https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
