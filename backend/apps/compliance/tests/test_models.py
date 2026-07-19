"""Tests for the compliance app's models: Building and Elevator."""

import datetime

import pytest
from django.db import IntegrityError

from apps.compliance.models import Building, Elevator

pytestmark = pytest.mark.django_db


class TestBuilding:
    """Tests for the :class:`Building` model."""

    def test_create_and_str(self) -> None:
        """A Building can be created and its ``__str__`` returns its name."""
        building = Building.objects.create(
            name="10 Riser Plaza",
            address="10 Riser Plaza, New York, NY 10001",
        )
        assert str(building) == "10 Riser Plaza"
        assert building.created_at is not None
        assert building.updated_at is not None

    def test_updated_at_changes_on_save(self) -> None:
        """``updated_at`` advances on subsequent saves."""
        building = Building.objects.create(name="A", address="1 A St")
        first_updated_at = building.updated_at
        building.name = "B"
        building.save()
        building.refresh_from_db()
        assert building.updated_at >= first_updated_at

    def test_name_required(self) -> None:
        """A Building without a name cannot be persisted."""
        building = Building(name="", address="1 A St")
        with pytest.raises(Exception):  # noqa: B017, PT011
            building.full_clean()


class TestElevator:
    """Tests for the :class:`Elevator` model."""

    def test_create_and_str(self, building: Building) -> None:
        """An Elevator can be created and its ``__str__`` includes the device identifier."""
        elevator = Elevator.objects.create(
            building=building,
            device_identifier="EL-001",
            inspection_type="CAT1",
            last_inspection_date=datetime.date(2026, 1, 1),
        )
        assert "EL-001" in str(elevator)
        assert elevator.building == building

    def test_related_name_elevators(self, building: Building, elevator: Elevator) -> None:
        """Elevators are reachable from their Building via ``related_name='elevators'``."""
        assert list(building.elevators.all()) == [elevator]

    def test_cascade_delete(self, building: Building, elevator: Elevator) -> None:
        """Deleting a Building cascades to delete its Elevators."""
        building.delete()
        assert not Elevator.objects.filter(pk=elevator.pk).exists()

    def test_inspection_type_choices_enforced(self, building: Building) -> None:
        """An invalid inspection_type fails model validation."""
        elevator = Elevator(
            building=building,
            device_identifier="EL-002",
            inspection_type="CAT3",
            last_inspection_date=datetime.date(2026, 1, 1),
        )
        with pytest.raises(Exception):  # noqa: B017, PT011
            elevator.full_clean()

    def test_valid_inspection_types(self, building: Building) -> None:
        """Both CAT1 and CAT5 are valid inspection_type values."""
        for code in ("CAT1", "CAT5"):
            elevator = Elevator(
                building=building,
                device_identifier=f"EL-{code}",
                inspection_type=code,
                last_inspection_date=datetime.date(2026, 1, 1),
            )
            elevator.full_clean()  # should not raise

    def test_building_required(self) -> None:
        """An Elevator cannot be persisted without a Building foreign key."""
        with pytest.raises(IntegrityError):
            Elevator.objects.create(
                building=None,  # type: ignore[misc]  # intentionally invalid, to test the DB constraint
                device_identifier="EL-003",
                inspection_type="CAT1",
                last_inspection_date=datetime.date(2026, 1, 1),
            )
