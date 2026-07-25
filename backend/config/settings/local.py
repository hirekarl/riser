"""Local development settings.

Uses SQLite, enables ``DEBUG``, and allows the default Vite dev server
origin for CORS so the frontend can talk to the API without extra setup.
"""

from .base import *  # noqa: F403
from .base import BASE_DIR

SECRET_KEY = "django-insecure-local-development-only-do-not-use-in-production"  # noqa: S105

DEBUG = True

ALLOWED_HOSTS = ["*"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

CORS_ALLOWED_ORIGIN_REGEXES = [
    # Vite falls back to the next free port (5174, 5175, ...) when 5173 is
    # taken by another project's dev server; match the whole fallback range
    # instead of hardcoding each port as we hit it.
    r"^http://(localhost|127\.0\.0\.1):517\d$",
]
