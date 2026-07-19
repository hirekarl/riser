# Django

Official docs: https://docs.djangoproject.com/en/6.0/ref/models/fields/, https://docs.djangoproject.com/en/6.0/topics/migrations/, https://docs.djangoproject.com/en/6.0/releases/6.0/

## Syntax / Usage Cheatsheet

- Model definition: `class Foo(models.Model): name = models.CharField(max_length=255)`.
- Required `ForeignKey` option: `on_delete=` — one of `CASCADE`, `PROTECT`, `RESTRICT`, `SET_NULL` (needs `null=True`), `SET_DEFAULT`, `SET(value)`, `DO_NOTHING`.
- Timestamps: `created_at = models.DateTimeField(auto_now_add=True)`, `updated_at = models.DateTimeField(auto_now=True)`.
- Enum-style choices: `class Status(models.TextChoices): DRAFT = "DR", "Draft"` then `status = models.CharField(max_length=2, choices=Status.choices)`.
- `null=True` is a database concern (column may store NULL); `blank=True` is a validation/form concern — for `CharField`/`TextField` prefer `blank=True` alone and use `""` for "no value", not `null=True`.
- Migrations workflow: `python manage.py makemigrations` → review with `python manage.py sqlmigrate <app> <num>` → `python manage.py migrate`. Commit the migration file alongside the model change in the same commit.
- Data migrations: `python manage.py makemigrations --empty <app>`, then use `RunPython` with `apps.get_model("app", "Model")` — never import the model directly inside a migration.
- Inspect migration state: `python manage.py showmigrations`; compress history with `python manage.py squashmigrations <app> <num>`.
- Django 6 sets `DEFAULT_AUTO_FIELD` to `BigAutoField` by default — explicit `AutoField` pks from older Django 4/5 projects still work but new apps get `BigAutoField` unless configured otherwise.
- New in 6.0: `GeneratedField` for DB-computed columns, `CompositePrimaryKey`, background tasks framework (`@task` + `.enqueue()`), CSP middleware via `SECURE_CSP` settings.

## Project-Specific Gotchas

- Django 6 dropped support for Python < 3.12; this repo pins `requires-python = ">=3.14"` in `backend/pyproject.toml`, well above the floor, so no compatibility concern there — but double-check any third-party package's Python ceiling before upgrading.
- Custom ORM expressions: `as_sql()` must now return params as a `tuple`, not a `list` — a silent breaking change if any hand-rolled `Func`/`Expression` subclasses exist.
- `django-stubs` (pinned `>=6.0.7` in this repo's dev group) must track the installed Django minor version closely — a mismatch is the most common source of spurious mypy errors in Django projects (see mypy-and-ty leaf).
- Migrations are per-app; an app with a `ForeignKey` to another app's model must declare that app as a migration `dependencies` entry, and apps without a `migrations/` package cannot be the target of a FK from an app that does.
- Avoid hand-editing generated migrations except for intentional data migrations — Django's migration autodetector re-diffs models against the last migration state, and manual edits can desync that state silently.

## Minimal Example

```python
from django.db import models

class ElevatorUnit(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "AC", "Active"
        RETIRED = "RT", "Retired"

    serial_number = models.CharField(max_length=64, unique=True)
    status = models.CharField(max_length=2, choices=Status.choices, default=Status.ACTIVE)
    installed_at = models.DateTimeField(auto_now_add=True)
    building = models.ForeignKey("buildings.Building", on_delete=models.CASCADE, related_name="elevators")
```

## References

- https://docs.djangoproject.com/en/6.0/ref/models/fields/
- https://docs.djangoproject.com/en/6.0/topics/migrations/
- https://docs.djangoproject.com/en/6.0/releases/6.0/
