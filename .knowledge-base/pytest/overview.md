# pytest (+ pytest-django, time-machine)

Official docs: https://docs.pytest.org/en/stable/how-to/fixtures.html, https://pytest-django.readthedocs.io/en/latest/, https://time-machine.readthedocs.io/en/latest/usage.html

Status: direct WebFetch to `docs.pytest.org` and `pytest-django.readthedocs.io` returned HTTP 429 (rate-limited) on every attempt during research. Content below is grounded via web search results that quote and link back to the same official pages (docs.pytest.org, pytest-django.readthedocs.io, time-machine.readthedocs.io) rather than a direct fetch — re-verify directly if anything looks stale.

## Syntax / Usage Cheatsheet

- Define a fixture: `@pytest.fixture def db_session(): ...` — request it by adding a same-named parameter to any test function.
- Fixture scopes: `@pytest.fixture(scope="function")` (default, one instance per test), `"class"`, `"module"`, `"session"` — 95% of real-world usage is `function` (isolation) or `session` (expensive shared setup like a DB connection pool).
- Teardown via `yield`: everything before `yield` is setup, the yielded value is what the test receives, everything after runs as teardown once the fixture goes out of scope: `@pytest.fixture def thing(): setup(); yield value; teardown()`.
- `conftest.py` fixtures are auto-discovered by pytest for every test file in the same directory and subdirectories — no import required, unlike a fixture defined in a regular test module.
- Parametrized fixtures: `@pytest.fixture(params=["a", "b"]) def value(request): return request.param` — runs every dependent test once per param value.
- **pytest-django** settings wiring — pyproject.toml form: `[tool.pytest.ini_options] DJANGO_SETTINGS_MODULE = "config.settings.local"` (or a `pytest.ini` with `[pytest] DJANGO_SETTINGS_MODULE = ...`, or the `--ds=` CLI flag / `DJANGO_SETTINGS_MODULE` env var as alternatives).
- Database access is opt-in: mark a test `@pytest.mark.django_db` or request the `db` fixture — without one of these, any DB query raises `"Database access not allowed"`. pytest-django calls `django.setup()` automatically; no manual bootstrapping needed.
- **time-machine** freezes/travels time in tests: `import time_machine; @time_machine.travel("2026-01-15")` as a decorator, context manager, or pytest fixture — it patches every stdlib time/date function at the C level (faster and more thorough than `freezegun`).

## Project-Specific Gotchas

- `backend/pyproject.toml` includes `[tool.pytest.ini_options]` with `DJANGO_SETTINGS_MODULE = "config.settings.local"`, `python_files = ["test_*.py"]`, and `addopts = "--reuse-db"`.
- This repo has three settings modules (`backend/config/settings/{base,local,production}.py`) — pytest's `DJANGO_SETTINGS_MODULE` points at `local` so test runs don't require production-only environment variables.
- `@pytest.mark.django_db` wraps each test in a transaction that's rolled back afterward (fast, isolated) — use `@pytest.mark.django_db(transaction=True)` only when a test genuinely needs real transaction/commit behavior (e.g. testing `on_commit` hooks), since it's markedly slower (real table truncation between tests instead of a rollback).
- `time-machine` is the chosen library here (not `freezegun`) specifically for its C-level patching speed — don't mix in `freezegun` for "just one test," since the two libraries patching the same stdlib functions differently in the same suite is a real source of flaky, hard-to-debug date test failures.
- Coverage enforcement is configured in `backend/pyproject.toml` under `[tool.coverage.report]` with `fail_under = 90` (and run via `pytest --cov --cov-fail-under=90`).

## Minimal Example

```python
import time_machine
import pytest

@pytest.mark.django_db
@time_machine.travel("2026-07-19")
def test_inspection_marked_overdue_after_due_date(elevator_unit):
    assert elevator_unit.is_overdue is True
```

```toml
# backend/pyproject.toml (to be added)
[tool.pytest.ini_options]
DJANGO_SETTINGS_MODULE = "config.settings.local"
```

## References

- https://docs.pytest.org/en/stable/how-to/fixtures.html
- https://pytest-django.readthedocs.io/en/latest/
- https://time-machine.readthedocs.io/en/latest/usage.html
