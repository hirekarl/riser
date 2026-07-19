# Commitizen

Official docs: https://commitizen-tools.github.io/commitizen/

## Syntax / Usage Cheatsheet

- Interactive commit creation following Conventional Commits: `cz commit` (or short alias `cz c`) — prompts for type (`feat`, `fix`, `chore`, ...), optional scope, and description, then assembles a properly formatted message.
- Sign off a commit through the same flow: `cz commit -- --signoff` (args after `--` pass through to the underlying `git commit`).
- Configure in `pyproject.toml` under `[tool.commitizen]`: `name = "cz_conventional_commits"` (the message-format plugin), `version = "0.1.0"` (Commitizen's own tracked version string), `update_changelog_on_bump = true`.
- `cz bump` does three things in one command: bumps the version (per Conventional Commits semantics — a `feat:` bumps minor, `fix:` bumps patch, a `BREAKING CHANGE:` footer bumps major), creates a matching git tag, and updates the changelog if `update_changelog_on_bump` is on.
- `version_files` keeps multiple version strings in sync across files during a bump: `version_files = ["pyproject.toml:version", "src/__init__.py", "docs/conf.py"]` — each entry is either `"path:pattern"` or bare `"path"` (Commitizen infers the version pattern in the file).
- Conventional Commits format itself: `type(scope): subject` — e.g. `feat(compliance): add elevator inspection overdue flag`; a blank line then body; a `BREAKING CHANGE:` footer for major-bump-triggering changes.

## Project-Specific Gotchas

- **No `[tool.commitizen]` block exists yet** in `backend/pyproject.toml` (not found among files inspected), and this is a monorepo with independently versioned-feeling `backend/` (uv-managed, currently `version = "0.1.0"`) and `frontend/` (npm-managed, currently `version = "0.0.0"`) trees — decide up front whether Commitizen manages one unified repo-level version, or whether `version_files` is configured to bump _both_ `backend/pyproject.toml:version` and `frontend/package.json`'s `"version"` field together on every `cz bump`, so they don't silently drift apart.
- Commitizen's changelog/bump logic depends entirely on commit messages already following Conventional Commits — pairing it with a pre-commit `commit-msg` stage hook (see pre-commit leaf) that rejects non-conforming messages _before_ they land is what actually enforces the format; installing Commitizen alone without that hook only helps commits made through `cz commit` itself, not commits made via plain `git commit`.
- `version_files` patterns must exactly match how the version string is written in each target file — a `package.json` entry needs the JSON-appropriate pattern (Commitizen supports common formats out of the box, but a custom version string layout, e.g. embedded in a Python `__version__ = "x.y.z"` with unusual quoting, can silently fail to update and only be caught by re-diffing after a bump).
- Given this repo's toolchain also includes ruff/mypy/ty pre-commit gates, sequence commit-msg validation (commitizen) as a separate, fast, independent hook stage — don't chain it after the linting hooks in a way where a linting failure prevents the commit-msg check from ever running and giving useful format feedback.

## Minimal Example

```toml
# pyproject.toml
[tool.commitizen]
name = "cz_conventional_commits"
version = "0.1.0"
version_files = [
    "backend/pyproject.toml:version",
    "frontend/package.json",
]
update_changelog_on_bump = true
```

## References

- https://commitizen-tools.github.io/commitizen/
