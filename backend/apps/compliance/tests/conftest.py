"""Shared pytest fixtures for the compliance app's test suite."""

import datetime

import pytest
from rest_framework.test import APIClient

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
