"""Seed a realistic multi-building demo portfolio of elevators.

Shared by the ``seed_demo_data`` management command (local dev/demo
convenience, destructive-by-default) and the ``POST /api/demo-data/seed/``
HTTP endpoint (always additive — see :func:`seed_demo_portfolio`'s
docstring for why an unauthenticated network call must never wipe
existing data).

Unlike an earlier version of this module, seeding no longer reads a
static, checked-in fixture: every run resolves the curated addresses in
:data:`SEED_ADDRESSES` against the **live** NYC DOB integration
(:mod:`apps.compliance.dob`), so seeded elevators always carry real,
current ``dob_device_number``/``inspection_type``/``last_inspection_date``
values straight from NYC Open Data — no synthetic status-tier fabrication
needed, since real filing dates naturally vary in how overdue they are.
"""

import dataclasses
import logging

from django.db import transaction

from apps.compliance import dob
from apps.compliance.models import Building, Elevator

logger = logging.getLogger(__name__)

#: Curated real, well-known NYC commercial buildings, one per borough where
#: possible, each verified live against NYC Planning GeoSearch v2 + the DOB
#: NOW Elevator Safety Compliance feed to actually resolve to a BIN *and*
#: carry at least one elevator device with a filed CAT1/CAT5 date (DOB NOW
#: filings only go back to 2018, so not every real building has records —
#: "One World Trade Center" and "Bronx Terminal Market" were dropped from
#: an earlier version of this list for resolving to zero devices; "One
#: Court Square"'s address was corrected after failing to geocode).
SEED_ADDRESSES = [
    ("Empire State Building", "350 Fifth Avenue, New York, NY 10118"),
    ("Chrysler Building", "405 Lexington Avenue, New York, NY 10174"),
    ("Woolworth Building", "233 Broadway, New York, NY 10279"),
    ("MetroTech Center", "15 MetroTech Center, Brooklyn, NY 11201"),
    ("One Court Square", "1 Court Sq, Long Island City, NY 11101"),
    ("Bronx County Courthouse", "851 Grand Concourse, Bronx, NY 10451"),
    ("Staten Island Borough Hall", "10 Richmond Terrace, Staten Island, NY 10301"),
]


@dataclasses.dataclass(frozen=True)
class SeedResult:
    """The outcome of a demo-data seeding run.

    Attributes:
        buildings_created: Number of :class:`~apps.compliance.models.Building`
            rows created by this run.
        elevators_created: Number of :class:`~apps.compliance.models.Elevator`
            rows created by this run.
        skipped: Curated addresses that could not be seeded this run, e.g.
            because the live DOB lookup failed or returned nothing usable.
            Each entry is ``(name, reason)``. Never raises — a partial
            outage of NYC's public APIs degrades to a smaller portfolio
            rather than failing the whole seeding run.
    """

    buildings_created: int
    elevators_created: int
    skipped: list[tuple[str, str]] = dataclasses.field(default_factory=list)


@dataclasses.dataclass(frozen=True)
class ResetResult:
    """The outcome of a demo-portfolio reset run.

    Attributes:
        buildings_deleted: Number of :class:`~apps.compliance.models.Building`
            rows deleted by this run.
        elevators_deleted: Number of :class:`~apps.compliance.models.Elevator`
            rows deleted by this run.
    """

    buildings_deleted: int
    elevators_deleted: int


def reset_portfolio() -> ResetResult:
    """Unconditionally delete every building and elevator in the portfolio.

    The deliberately destructive counterpart to :func:`seed_demo_portfolio`,
    for resetting a demo environment back to empty. Elevators are deleted
    before buildings, matching the delete-order already used by
    :func:`seed_demo_portfolio`'s ``keep_existing=False`` branch and by the
    ``seed_demo_data`` management command.

    Returns:
        A :class:`ResetResult` with the number of buildings and elevators
        deleted by this call. Calling this on an already-empty portfolio
        is safe and returns zero counts.
    """
    with transaction.atomic():
        _elevators_total, elevator_deletions = Elevator.objects.all().delete()
        _buildings_total, building_deletions = Building.objects.all().delete()

    elevators_deleted = elevator_deletions.get("compliance.Elevator", 0)
    buildings_deleted = building_deletions.get("compliance.Building", 0)

    return ResetResult(
        buildings_deleted=buildings_deleted,
        elevators_deleted=elevators_deleted,
    )


def _seed_one_building(name: str, address: str) -> tuple[Building, int] | str:
    """Resolve and create one curated building with its real DOB elevators.

    Args:
        name: The curated building's display name.
        address: The curated building's street address, looked up live.

    Returns:
        A ``(building, elevator_count)`` tuple on success, or a ``str``
        explaining why this address was skipped. A resolved address with
        zero usable drafts (no devices on file, or none with a filed
        CAT1/CAT5 date) is treated as a skip rather than an empty
        building, so every seeded building is guaranteed to have at
        least one elevator.
    """
    try:
        matches = dob.resolve_address(address, size=1)
    except dob.DobLookupError as exc:
        return f"address geocoding failed: {exc}"
    if not matches:
        return "address did not resolve to a BIN"
    match = matches[0]

    try:
        devices = dob.fetch_devices(match.bin)
    except dob.DobLookupError as exc:
        return f"DOB device fetch failed: {exc}"

    drafts = dob.map_dob_devices_to_drafts(devices)
    if not drafts:
        return "no DOB elevator devices with a filed inspection date on file"

    building = Building.objects.create(name=name, address=address, bin=match.bin)
    for index, draft in enumerate(drafts):
        Elevator.objects.create(
            building=building,
            device_identifier=f"Elevator {index + 1}",
            inspection_type=draft.inspection_type,
            last_inspection_date=draft.last_inspection_date,
            dob_device_number=draft.dob_device_number,
        )
    return building, len(drafts)


def seed_demo_portfolio(*, keep_existing: bool = True) -> SeedResult:
    """Seed buildings and elevators from live NYC DOB data for curated real addresses.

    Each address in :data:`SEED_ADDRESSES` is resolved to a BIN and its
    elevator devices are fetched live (:func:`apps.compliance.dob.resolve_address`,
    :func:`apps.compliance.dob.fetch_devices`, and
    :func:`apps.compliance.dob.map_dob_devices_to_drafts`), so seeded
    elevators always carry real, current device numbers and filing dates.
    A per-address failure (a lookup error, an address that fails to
    resolve, or a resolved building with no usable devices) skips just
    that address — it never aborts the whole run, since this function is
    reachable from an unauthenticated HTTP endpoint that must not 500
    because one of NYC's public APIs is briefly unreachable.

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
        created by this call, plus any addresses that had to be skipped.
    """
    if not keep_existing:
        Elevator.objects.all().delete()
        Building.objects.all().delete()

    buildings_created = 0
    elevators_created = 0
    skipped: list[tuple[str, str]] = []

    with transaction.atomic():
        for name, address in SEED_ADDRESSES:
            outcome = _seed_one_building(name, address)
            if isinstance(outcome, str):
                logger.warning("Skipping demo-seed address %r (%s): %s", name, address, outcome)
                skipped.append((name, outcome))
                continue
            _building, elevator_count = outcome
            buildings_created += 1
            elevators_created += elevator_count

    return SeedResult(
        buildings_created=buildings_created,
        elevators_created=elevators_created,
        skipped=skipped,
    )
