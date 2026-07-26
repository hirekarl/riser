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

- **`gh pr merge --rebase` fails if the PR branch contains a merge commit** (confirmed directly against this repo, 2026-07-25): this repo's branch protection only allows "Rebase and merge" (`squashMergeAllowed`/`mergeCommitAllowed` are both `false`, `rebaseMergeAllowed` is `true` — check with `gh repo view --json mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed`). Rebase-merge requires a linear history it can replay commit-by-commit onto the target branch; if the PR branch has an actual merge commit in it (e.g. from running `git merge origin/main` locally to resolve a conflict against another PR that landed first), `gh pr merge <n> --rebase` fails with `GraphQL: This branch can't be rebased (mergePullRequest)`. **Fix:** locally `git rebase origin/main` on the PR branch instead of `git merge` (re-resolving the same conflict(s) as part of the rebase), then `git push --force-with-lease`, then retry the merge. `--admin` (this repo's documented bypass for the required-review check, per `CONTRIBUTING.md`) does **not** fix this — it only bypasses missing approvals, not the structural linear-history requirement.
- **`--admin` bypasses required reviews, not required CI** — `gh pr merge <n> --admin --rebase` merges without another collaborator's approval (useful when solo/no other reviewer is available) but GitHub still enforces all required status checks; a red check blocks the merge exactly the same as without `--admin`.
- **`deleteBranchOnMerge` is a repo-level setting, not a merge-time flag** — if it's `false` (check via `gh repo view --json deleteBranchOnMerge`), every merged PR's branch lingers on the remote indefinitely (`git branch -r` accumulates stale branches over a project's lifetime). Enable it once with `gh repo edit --delete-branch-on-merge` rather than manually deleting branches after every merge (`git push origin --delete <branch>` for a batch cleanup, or `gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/{branch}` for one at a time).
- **The required-status-check + path-filter interaction gotcha** (well-known, confirmed directly in GitHub's own workflow-syntax docs): if a workflow has a trigger-level `paths:`/`paths-ignore:` filter and a given PR touches no matching file, the workflow **is skipped entirely** — but if that workflow's job is configured as a _required_ status check in branch protection, GitHub's docs state the check "will remain in a 'Pending' state," and a PR requiring it "will be blocked from merging" — indefinitely, since a skipped workflow never posts a completed status at all (not even a passing one). **The fix is to filter at the job/step level, not the workflow trigger level**: let the workflow trigger on every push/PR unconditionally, then add an early step (e.g. `dorny/paths-filter` or a manual `git diff` check) that sets a job output, and gate the rest of the job's steps on that output — this way the job still runs (and reports a real "success" status) even on unaffected PRs, just doing near-nothing.
- This repo is a `backend/` (Django/DRF, uv) + `frontend/` (Vite/React, npm) monorepo — the natural instinct is one workflow per side with a top-level `paths: ["backend/**"]` / `paths: ["frontend/**"]` filter each. Given the gotcha above, if either workflow's job is ever marked "required" in branch protection, that trigger-level filter must be converted to the job/step-level pattern first, or a frontend-only PR will be permanently blocked waiting on a backend CI check (and vice versa) that will never report.
- **This repo has active workflows configured in `.github/workflows/`.** Workflows include `backend-ci.yml` (ruff, mypy, ty, pytest with coverage gate), `frontend-ci.yml` (eslint, tsc, vitest with coverage gate, playwright e2e), `commitlint.yml`, `release.yml`, and `slack-notify.yml`.
- `concurrency` groups scoped by `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true` are enabled across CI workflows to avoid redundant pipeline runs on rapid pushes.
- **Required checks can sit in `action_required` instead of running** — confirmed on this repo's `release/next` PR (opened by `github-actions[bot]`, 2026-07-26): `gh run list --branch <branch>` showed Backend CI / Frontend CI / Commit Lint all `completed`/`action_required` with `0s` duration — i.e. GitHub created the runs but is holding them for manual approval before executing any steps, so they never produce a real pass/fail. Branch protection blocks the merge on these exactly like a red check (`gh pr merge --admin` does **not** help — same as the red-check case above, admin only bypasses missing approvals, not missing/unapproved required checks). Approve and run them either via the PR's checks UI ("Approve and run workflows") or `gh api --method POST repos/{owner}/{repo}/actions/runs/<run_id>/approve` per run id from `gh run list`, then retry the merge.

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
