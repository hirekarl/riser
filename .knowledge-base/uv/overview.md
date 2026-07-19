# uv

Official docs: https://docs.astral.sh/uv/concepts/projects/dependencies/, https://docs.astral.sh/uv/concepts/projects/sync/, https://docs.astral.sh/uv/guides/scripts/

## Syntax / Usage Cheatsheet

- Add a runtime dependency: `uv add httpx` or with a constraint `uv add "httpx>=0.20"`.
- Add a dev-only dependency (PEP 735 `dependency-groups`, the modern standard): `uv add --dev pytest` — writes to `[dependency-groups] dev = [...]` in `pyproject.toml`. The `dev` group is special: it syncs by default and has shorthand flags `--dev` / `--only-dev` / `--no-dev`.
- Add to a custom named group: `uv add --group lint ruff` → `[dependency-groups] lint = ["ruff"]`. Groups can nest via `{include-group = "name"}`, and all groups resolve together for compatibility — no per-group independent lock.
- Remove a dependency: `uv remove httpx`.
- Optional/extras dependencies (published, user-facing) go under `[project.optional-dependencies]`, added via `uv add httpx --optional network` — distinct from dev dependency groups, which are never published.
- `uv sync` installs exactly what's in the lockfile (removes anything not listed) — use `--locked` to error instead of silently updating the lockfile if `pyproject.toml` drifted, or `--frozen` to install from the existing lockfile as-is without even checking staleness.
- `uv sync --all-groups` includes every dependency group; `uv sync --no-dev` excludes just the special `dev` group; `--group <name>` / `--extra <name>` pull in specific ones.
- `uv run <script>` executes inside the project's managed venv, auto-syncing project dependencies first (skip with `--no-project`); `uv run --with rich script.py` adds an ad-hoc dependency for just that invocation.
- Inline PEP 723 script metadata (`# /// script ... dependencies = [...] ///` header) lets a standalone script declare its own deps; manage it with `uv add --script example.py package`.

## Project-Specific Gotchas

- This repo's `backend/pyproject.toml` already uses the modern `[dependency-groups] dev = [...]` form (django-stubs, mypy, pytest, pytest-cov, pytest-django, ruff, time-machine, ty) — there is no legacy `[tool.uv.dev-dependencies]` table present, so there's nothing to migrate, but any new contributor adding a dev tool should use `uv add --dev <pkg>` to keep landing in the same group rather than accidentally creating `[tool.uv.dev-dependencies]` by hand-editing.
- `uv sync --locked` vs `--frozen` matters for CI: `--locked` is the stricter, correctness-checking choice (fails the build if `pyproject.toml` and `uv.lock` disagree) and is the right default for a CI gate; `--frozen` is faster but will happily install a stale lock that no longer matches `pyproject.toml` — reserve `--frozen` for situations where you deliberately don't want network/resolution work (e.g. a Docker layer that already has a trusted lock baked in).
- `backend/uv.lock` is checked into the repo (implied by its presence at `backend/uv.lock`) — uv will not consider it "outdated" just because newer package versions were released; only `uv lock --upgrade` (or edits to `pyproject.toml` constraints) will move it forward. Don't expect `uv sync` alone to pick up a new patch release.
- `requires-python = ">=3.14"` in `backend/pyproject.toml` is unusually high — verify any new dependency actually publishes wheels for 3.14 before adding it, since uv's resolver will fail loudly (not silently downgrade) if no compatible wheel/sdist exists.
- `uv run` re-syncs the project environment on every invocation by default; in a hooks context (pre-commit `language: system` hooks that shell out to `uv run ruff ...`) this adds a small but real per-hook-run overhead compared to activating the venv once — acceptable for local dev, worth knowing when profiling slow pre-commit runs.

## Minimal Example

```bash
# add a new dev-only tool to the shared dev group
uv add --dev pytest-xdist

# CI-style strict, reproducible install
uv sync --locked --all-groups

# run a management command inside the project venv
uv run manage.py migrate
```

## References

- https://docs.astral.sh/uv/concepts/projects/dependencies/
- https://docs.astral.sh/uv/concepts/projects/sync/
- https://docs.astral.sh/uv/guides/scripts/
