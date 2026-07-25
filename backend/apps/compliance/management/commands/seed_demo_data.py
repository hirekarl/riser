"""Seed a realistic multi-building portfolio for local dev/demo use.

Not run automatically by any hook, CI step, or migration — a manual
convenience for the portfolio-scale UI checks and the "realistic
multi-building portfolio already seeded, not built live from zero" demo
prerequisite called out in ``docs/demo/week-1-demo-script.md``.
"""

import datetime
from typing import Any

from dateutil.relativedelta import relativedelta
from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.compliance.models import Building, Elevator, InspectionType

_BUILDINGS = [
    ("10 Riser Plaza", "10 Riser Plaza, New York, NY 10001"),
    ("Chelsea Court", "245 W 17th St, New York, NY 10011"),
    ("Battery Park Tower", "2 South End Ave, New York, NY 10280"),
    ("Flatiron Commons", "112 W 23rd St, New York, NY 10011"),
    ("Long Island City Yards", "27-01 Queens Plaza N, Long Island City, NY 11101"),
    ("Grand Concourse Lofts", "800 Grand Concourse, Bronx, NY 10451"),
    ("Bay Ridge Terrace", "8801 3rd Ave, Brooklyn, NY 11209"),
]

_INTERVAL_YEARS = {
    InspectionType.CAT1.value: 1,
    InspectionType.CAT5.value: 5,
}

_TIERS = ("delinquent", "warning", "compliant")


def _last_inspection_date(today: datetime.date, inspection_type: str, tier: str) -> datetime.date:
    """Pick a ``last_inspection_date`` that lands the elevator in the given status tier.

    Args:
        today: The date to seed relative to.
        inspection_type: ``"CAT1"`` or ``"CAT5"``.
        tier: One of ``"delinquent"``, ``"warning"``, ``"compliant"``.

    Returns:
        A ``last_inspection_date`` whose computed due date falls in ``tier``.
    """
    years = _INTERVAL_YEARS[inspection_type]
    if tier == "delinquent":
        return today - relativedelta(years=years, days=45)
    if tier == "warning":
        return today - relativedelta(years=years) + datetime.timedelta(days=15)
    return today - relativedelta(years=years) + relativedelta(months=6)


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
        today = datetime.date.today()
        if not options["keep_existing"]:
            Elevator.objects.all().delete()
            Building.objects.all().delete()

        combos = [(inspection_type, tier) for inspection_type in _INTERVAL_YEARS for tier in _TIERS]

        elevator_total = 0
        with transaction.atomic():
            for building_index, (name, address) in enumerate(_BUILDINGS):
                building = Building.objects.create(name=name, address=address)
                elevator_count = 3 + (building_index % 3)
                for elevator_index in range(elevator_count):
                    inspection_type, tier = combos[(building_index + elevator_index) % len(combos)]
                    Elevator.objects.create(
                        building=building,
                        device_identifier=f"EL-{building_index + 1:02d}{elevator_index + 1:02d}",
                        inspection_type=inspection_type,
                        last_inspection_date=_last_inspection_date(today, inspection_type, tier),
                    )
                    elevator_total += 1

        message = f"Seeded {len(_BUILDINGS)} buildings and {elevator_total} elevators."
        self.stdout.write(self.style.SUCCESS(message))
