# Ruff

Official docs: https://docs.astral.sh/ruff/configuration/

## Syntax / Usage Cheatsheet

- Config lives in `pyproject.toml` under `[tool.ruff]` (or standalone `ruff.toml` / `.ruff.toml`, which use top-level sections instead of `[tool.ruff]`).
- Top-level settings: `line-length = 88` (matches Black's default), `indent-width = 4`, `target-version = "py312"` (set to match the actual Python floor, not necessarily the interpreter running Ruff).
- Lint rule selection lives under `[tool.ruff.lint]`: `select = ["E4", "E7", "E9", "F"]` enables specific rule code prefixes; Ruff enables Pyflakes (`F`) and a pycodestyle (`E`) subset by default even with no explicit `select`.
- `extend-select = ["B"]` adds rules on top of the default/selected set without replacing it (use this for adding e.g. `flake8-bugbear` codes without redefining the whole rule set); `ignore = ["E501"]` disables specific codes.
- `fixable = ["ALL"]` allows `--fix` to auto-fix every enabled rule that supports it; narrow this list to be conservative about what auto-fix is allowed to touch.
- Formatting config is separate, under `[tool.ruff.format]`: `quote-style = "double"`, `indent-style = "space"`, `skip-magic-trailing-comma = false`, `line-ending = "auto"`, `docstring-code-format = false`.
- Two distinct commands: `ruff check` (lint, optional `--fix`) and `ruff format` (formatting, Black-compatible by default) — they are not the same tool invoked two ways, both need to run in CI/pre-commit for full coverage.
- CLI flags override config file settings for one-off runs: `ruff check --line-length=90`.

## Project-Specific Gotchas

- `backend/pyproject.toml` configures `[tool.ruff]` with `line-length = 100`, `target-version = "py314"`, `select = ["E", "F", "I", "D", "UP", "B", "DJ"]`, and `pydocstyle.convention = "google"`. Per-file ignores disable docstring checks (`D`) for migrations and tests.
- Ruff formatting and lint checking (`ruff check --fix` and `ruff format`) run via pre-commit (`language: system`) and CI.
- `ruff format` and Black disagree on a few edge cases (magic trailing comma handling, some string-splitting decisions) even though Ruff aims for Black compatibility — don't run both formatters in the same pre-commit config, pick one (Ruff, given it's already a dev dependency here) to avoid the two fighting over the same lines.
- Ruff replaces both flake8 and Black-equivalent formatting in one binary — if pre-commit hooks are added later, prefer the official `ruff-pre-commit` mirror's two hook ids (`ruff check --fix` then `ruff format`) run in that order, since format-then-lint can reintroduce a lint violation that formatting just "fixed" stylistically.
- `mypy` and `ruff` both exist in the dev group; ruff does not do type checking (despite very fast static analysis) — don't expect `ruff check` to catch what mypy/ty catch, they are complementary, not overlapping, tools here.

## Minimal Example

```toml
[tool.ruff]
line-length = 88
target-version = "py314"

[tool.ruff.lint]
select = ["E", "F", "B", "DJ"]
ignore = ["E501"]

[tool.ruff.format]
quote-style = "double"
```

## References

- https://docs.astral.sh/ruff/configuration/
