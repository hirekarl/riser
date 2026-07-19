"""Production settings.

Uses Postgres via ``DATABASE_URL`` (parsed with ``django-environ``),
disables ``DEBUG``, serves static files through whitenoise, and restricts
CORS to origins listed in the ``CORS_ALLOWED_ORIGINS`` environment
variable.
"""

import environ

from .base import *  # noqa: F403

env = environ.Env()

SECRET_KEY = env.str("SECRET_KEY")

DEBUG = False

ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=[])

DATABASES = {
    "default": env.db("DATABASE_URL"),
}

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])

# Insert whitenoise directly after SecurityMiddleware, per whitenoise's docs.
MIDDLEWARE = [  # noqa: F405
    *MIDDLEWARE[:1],  # noqa: F405
    "whitenoise.middleware.WhiteNoiseMiddleware",
    *MIDDLEWARE[1:],  # noqa: F405
]

STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
