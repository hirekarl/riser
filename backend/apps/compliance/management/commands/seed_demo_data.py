"""Seed a realistic multi-building portfolio for local dev/demo use.

Not run automatically by any hook, CI step, or migration — a manual
convenience for the portfolio-scale UI checks and the "realistic
multi-building portfolio already seeded, not built live from zero" demo
prerequisite called out in ``docs/demo/week-1-demo-script.md``.

The actual seeding logic lives in :mod:`apps.compliance.demo_data` so it
can be shared with the ``POST /api/demo-data/seed/`` HTTP endpoint; this
command is a thin CLI wrapper around it.
"""

from typing import Any

from django.core.management.base import BaseCommand, CommandParser

from apps.compliance.demo_data import seed_demo_portfolio


class Command(BaseCommand):
    """Seed buildings and elevators spanning every status/inspection-type combination."""

    help = "Seed a realistic multi-building portfolio of elevators for local dev/demo use."

    def add_arguments(self, parser: CommandParser) -> None:
        """Add the ``--keep-existing`` flag."""
        parser.add_argument(
            "--keep-existing",
            action="store_true",
            help="Seed additional data without first deleting existing buildings/elevators.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        """Create the seed buildings and elevators."""
        result = seed_demo_portfolio(keep_existing=options["keep_existing"])
        message = (
            f"Seeded {result.buildings_created} buildings and {result.elevators_created} elevators."
        )
        self.stdout.write(self.style.SUCCESS(message))
