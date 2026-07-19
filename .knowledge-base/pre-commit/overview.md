# pre-commit

Official docs: https://pre-commit.com/

## Syntax / Usage Cheatsheet

- Root config file `.pre-commit-config.yaml`: top-level `repos:` list, each entry has `repo:` (a git URL, or the `local` / `meta` sentinels), `rev:` (an immutable tag/SHA — never a branch name), and `hooks:` (list of hook ids from that repo).
- Minimal hook entry: `- id: trailing-whitespace` (uses the repo's own default `entry`/`language`); customize per-hook with `args:`, `files:` (regex to scope which paths trigger it), `language_version:`.
- `language: python` / `node` / `golang` etc. → pre-commit builds and caches an **isolated** virtualenv/toolchain for that hook, downloaded/managed entirely by pre-commit itself, independent of your project's own venv.
- `language: system` → pre-commit does _not_ create an isolated environment; it shells out to whatever's already on `PATH` (or an explicit `entry:` command) — required when a hook needs to run inside your project's own managed environment (e.g. `uv run ruff check`).
- `local` repo hooks (`repo: local`) are how you wire your own project tooling (ruff, mypy, ty) into pre-commit without publishing a separate hook repo: `- repo: local hooks: [{ id: ruff, name: ruff, entry: uv run ruff check, language: system, types: [python] }]`.
- Multi-stage hooks: a hook's `stages:` list controls which git hook type triggers it — valid stages include `pre-commit`, `pre-push`, `pre-merge-commit`, `commit-msg`, `prepare-commit-msg`, `post-commit`, `post-checkout`, and the special `manual` (only runs via `pre-commit run --hook-stage manual`, never automatically).
- Install the git hook scripts: `pre-commit install` (defaults to the `pre-commit` stage only) — to also wire pre-push/commit-msg hooks, either pass multiple `--hook-type` flags (`pre-commit install --hook-type pre-commit --hook-type pre-push --hook-type commit-msg`) or set `default_install_hook_types: [pre-commit, pre-push, commit-msg]` in the config so a single `pre-commit install` picks up all three.
- `default_stages:` (top-level) sets which stages a hook runs on when it doesn't declare its own `stages:` key.

## Project-Specific Gotchas

- **No `.pre-commit-config.yaml` exists yet** in this repo (not found among files inspected). When it's added, given this project's dev tools (ruff, mypy, ty, oxlint) are all already managed by `uv`/`npm` inside their own project-local environments, most hooks here are strong candidates for `language: system` + `entry: uv run <tool>` (or `entry: npm run <script>`) rather than letting pre-commit spin up a second, separate isolated env for tools that already have a canonical project-managed one — avoids version drift between "what CI runs via `uv run`" and "what pre-commit's isolated env happens to have pinned."
- This project explicitly wants a fast/slow split for typecheckers (ty locally, mypy in CI, per the mypy-and-ty leaf) — that's a natural fit for pre-commit's `stages:`: put `ty` on the default `pre-commit` stage for instant local feedback, and either skip `mypy` from pre-commit entirely (run it only in CI) or put it on `pre-push`/`manual` so it doesn't slow down every single commit.
- **commit-msg stage** is where commitizen's Conventional Commits format check belongs (see commitizen leaf) — remember `commit-msg` hooks need `pre-commit install --hook-type commit-msg` (or the `default_install_hook_types` config) run at least once per clone, or the hook silently never fires even though it's correctly defined in `.pre-commit-config.yaml`.
- Mixing `language: system` hooks with pre-commit's normal isolated-env hooks (e.g. a standard `pre-commit-hooks` repo hook for `trailing-whitespace`) in the same config is fine and common — just don't assume a `system` hook's tool version is pinned by pre-commit's cache the way an isolated-env hook's `rev:`/`additional_dependencies:` would pin it; a `system` hook's actual version is whatever `uv sync`/`npm ci` currently has installed.

## Minimal Example

```yaml
# .pre-commit-config.yaml
default_install_hook_types: [pre-commit, commit-msg]

repos:
  - repo: local
    hooks:
      - id: ruff-check
        name: ruff check
        entry: uv run --project backend ruff check --fix
        language: system
        types: [python]
      - id: ty-check
        name: ty check
        entry: uv run --project backend ty check
        language: system
        types: [python]
        pass_filenames: false
  - repo: https://github.com/commitizen-tools/commitizen
    rev: v4.9.1
    hooks:
      - id: commitizen
        stages: [commit-msg]
```

## References

- https://pre-commit.com/
