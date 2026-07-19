# mypy and ty

Official docs: https://mypy.readthedocs.io/en/stable/config_file.html, https://docs.astral.sh/ty/, https://docs.astral.sh/ty/reference/configuration/

Status: mypy's own config-file docs page returned HTTP 429 (rate-limited) on every direct WebFetch attempt during research; the mypy section below is grounded via web search results that quote and link back to `mypy.readthedocs.io` and `github.com/typeddjango/django-stubs`, not a direct fetch. Re-verify against `mypy.readthedocs.io/en/stable/config_file.html` directly if anything here looks off. The `ty` section was fetched directly and successfully.

## Syntax / Usage Cheatsheet

- **mypy**: config in `pyproject.toml` under `[tool.mypy]`: `strict = true`, `plugins = ["mypy_django_plugin.main"]` — enable the Django plugin whenever `django-stubs` is installed, or model field types resolve incorrectly.
- **mypy + django-stubs**: the plugin needs a second table pointing at your settings module: `[tool.django-stubs] django_settings_module = "config.settings.local"`.
- **django-stubs** extra flags: `strict_settings = false` if using dynamic/computed settings; `strict_model_abstract_attrs = false` to keep `.objects`, `.DoesNotExist`, `.MultipleObjectsReturned` visible on the base `models.Model` type.
- **mypy** per-module overrides: `[[tool.mypy.overrides]] module = "legacy.*" ignore_errors = true` (repeatable `[[...]]` array-of-tables for multiple override blocks).
- **ty**: config in `pyproject.toml` under `[tool.ty]` (or a standalone `ty.toml`); rule severities under `[tool.ty.rules]`, three levels only: `"ignore"`, `"warn"`, `"error"` — e.g. `possibly-unresolved-reference = "warn"`; `"all"` as a key sets the default for every rule.
- **ty** environment/paths: `[tool.ty.environment] python-version = "3.14"`, `root = ["./src"]`, `extra-paths = [...]` for non-standard first-party module locations.
- **ty** source scoping: `[tool.ty.src] include = [...] exclude = [...]` — glob syntax supports `!pattern` negation to re-include a path under a broader exclude.
- **ty** per-file rule overrides: `[[tool.ty.overrides]] include = ["tests/**"]` followed by `[tool.ty.overrides.rules]` — later `[[overrides]]` blocks win over earlier ones for overlapping globs.
- **ty** CLI/CI output: `[tool.ty.terminal] output-format = "github"` (also `full`, `concise`, `gitlab`, `junit`) — pick `"github"` for annotations in GitHub Actions logs.
- Run mypy via `uv run mypy .`; run ty via `uv run ty check` (or `uvx ty check` outside the project venv).

## Project-Specific Gotchas

- **This repo intentionally runs both tools** — pinned in `backend/pyproject.toml`'s dev group as `mypy>=2.3.0` and `ty>=0.0.61`, alongside `django-stubs>=6.0.7`. The intent (per the project brief) is ty for fast pre-commit-time feedback and mypy as the slower, authoritative CI gate — don't let the two configs drift into contradicting rule sets, since a "ty passed, mypy failed" or vice versa result is exactly the confusing state this split is meant to avoid.
- **ty's version is still `0.0.x`-style** (`ty>=0.0.61` pinned here) even though its fetched docs page (dated mid-2026) shows no explicit beta/stability disclaimer — treat ty's config surface and rule set as still capable of breaking changes between releases; pin more tightly than mypy if CI breakage from a ty upgrade becomes a recurring problem.
- **django-stubs version coupling**: `django-stubs` must track the installed Django minor version (this repo has `django>=6.0.7`, `django-stubs>=6.0.7`) — a stubs/Django version mismatch is the most common source of spurious mypy errors on otherwise-correct Django code; check this pairing first when mypy errors look nonsensical after a Django bump.
- **ty does not yet have an equivalent to django-stubs' Django plugin** as far as its fetched config reference shows (no `[tool.ty.django]`-style table) — ty's fast pre-commit pass is likely to be weaker at Django-specific inference (queryset/manager types, model field descriptors) than mypy's plugin-augmented pass; don't be surprised if ty is silent on something mypy correctly flags in Django model code, and don't treat a clean ty run as equivalent to a clean mypy run for Django-heavy files.
- **Computed serializer fields** (DRF `SerializerMethodField`, see drf/overview.md) commonly need an explicit return type annotation on the `get_<field>` method for either checker to infer the field's value type correctly — without it, both tools often widen to `Any`.

## Minimal Example

```toml
# backend/pyproject.toml
[tool.mypy]
strict = true
plugins = ["mypy_django_plugin.main"]

[tool.django-stubs]
django_settings_module = "config.settings.local"

[tool.ty.environment]
python-version = "3.14"

[tool.ty.rules]
possibly-unresolved-reference = "warn"
```

## References

- https://mypy.readthedocs.io/en/stable/config_file.html
- https://docs.astral.sh/ty/
- https://docs.astral.sh/ty/reference/configuration/
- https://github.com/typeddjango/django-stubs
