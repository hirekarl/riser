"""App configuration for the compliance app."""

from django.apps import AppConfig


class ComplianceConfig(AppConfig):
    """Configuration for the compliance app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.compliance"
    label = "compliance"
