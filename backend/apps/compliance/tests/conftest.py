"""Shared pytest fixtures for the compliance app's test suite."""

import datetime

import pytest
from rest_framework.test import APIClient

from apps.compliance import dob
from apps.compliance.demo_data import SEED_ADDRESSES
from apps.compliance.models import Building, Elevator


@pytest.fixture
def api_client() -> APIClient:
    """Return a DRF :class:`APIClient` for exercising the API in tests."""
    return APIClient()


@pytest.fixture
def building(db: None) -> Building:
    """Create and return a persisted :class:`Building`."""
    return Building.objects.create(
        name="10 Riser Plaza",
        address="10 Riser Plaza, New York, NY 10001",
    )


@pytest.fixture
def elevator(db: None, building: Building) -> Elevator:
    """Create and return a persisted :class:`Elevator` belonging to ``building``."""
    return Elevator.objects.create(
        building=building,
        device_identifier="EL-001",
        inspection_type="CAT1",
        last_inspection_date=datetime.date(2026, 1, 1),
    )


@pytest.fixture
def live_dob_seed_data(monkeypatch: pytest.MonkeyPatch) -> None:
    """Stub the live DOB lookups used by ``seed_demo_portfolio`` with fake data.

    Patches :func:`apps.compliance.dob.resolve_address` and
    :func:`apps.compliance.dob.fetch_devices` so demo-seeding tests never
    hit the network. Each curated address in
    :data:`apps.compliance.demo_data.SEED_ADDRESSES` resolves to a
    distinct BIN with a handful of devices, each carrying exactly one
    filed CAT1 or CAT5 date (alternating, so both inspection types are
    represented), for a total of 27 elevators across the 7 buildings —
    matching the "realistic multi-building portfolio" size the seeding
    tests expect.
    """
    bins_by_address = {
        address: f"100{index:04d}" for index, (_, address) in enumerate(SEED_ADDRESSES)
    }
    device_counts = {address: 3 + (index % 3) for index, (_, address) in enumerate(SEED_ADDRESSES)}

    def fake_resolve_address(address: str, *, size: int = 5) -> list[dob.AddressMatch]:
        bin_value = bins_by_address.get(address)
        if bin_value is None:
            return []
        return [dob.AddressMatch(label=address, borough="Manhattan", bin=bin_value)]

    def fake_fetch_devices(bin_value: str, *, limit: int = 1000) -> list[dob.DobDevice]:
        count = next(
            (device_counts[addr] for addr, bin_ in bins_by_address.items() if bin_ == bin_value),
            0,
        )
        devices = []
        for i in range(count):
            is_cat1 = i % 2 == 0
            devices.append(
                dob.DobDevice(
                    device_number=f"{i + 1}P{100 + i}",
                    device_type="Elevator",
                    device_status="Active",
                    cat1_latest_report_filed=datetime.date(2026, 1, 1) if is_cat1 else None,
                    cat5_latest_report_filed=None if is_cat1 else datetime.date(2022, 1, 1),
                    house_number="1",
                    street_name="TEST STREET",
                    bin=bin_value,
                )
            )
        return devices

    monkeypatch.setattr(dob, "resolve_address", fake_resolve_address)
    monkeypatch.setattr(dob, "fetch_devices", fake_fetch_devices)
