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

CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    # Vite falls back to the next free port when 5173 is taken by another
    # project's dev server; allow it too so local CORS doesn't break.
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]
