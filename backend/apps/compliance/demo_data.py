"""Seed a realistic multi-building demo portfolio of elevators.

Shared by the ``seed_demo_data`` management command (local dev/demo
convenience, destructive-by-default) and the ``POST /api/demo-data/seed/``
HTTP endpoint (always additive — see :func:`seed_demo_portfolio`'s
docstring for why an unauthenticated network call must never wipe
existing data).
"""

import dataclasses
import datetime

from dateutil.relativedelta import relativedelta
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


@dataclasses.dataclass(frozen=True)
class SeedResult:
    """The outcome of a demo-data seeding run.

    Attributes:
        buildings_created: Number of :class:`~apps.compliance.models.Building`
            rows created by this run.
        elevators_created: Number of :class:`~apps.compliance.models.Elevator`
            rows created by this run.
    """

    buildings_created: int
    elevators_created: int


def seed_demo_portfolio(*, keep_existing: bool = True) -> SeedResult:
    """Seed buildings and elevators spanning every status/inspection-type combination.

    Args:
        keep_existing: When ``False``, all existing
            :class:`~apps.compliance.models.Elevator` and
            :class:`~apps.compliance.models.Building` rows are deleted
            before seeding. Defaults to ``True`` (additive) — callers that
            need the destructive local-dev convenience (the
            ``seed_demo_data`` management command) must opt in explicitly.
            HTTP callers must never be given a way to set this to
            ``False``: an unauthenticated network endpoint that can wipe a
            real portfolio is a hazard this MVP's "no auth" ADR
            (``docs/adr/0002-no-auth-for-mvp.md``) does not license.

    Returns:
        A :class:`SeedResult` with the number of buildings and elevators
        created by this call.
    """
    today = datetime.date.today()
    if not keep_existing:
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

    return SeedResult(buildings_created=len(_BUILDINGS), elevators_created=elevator_total)
