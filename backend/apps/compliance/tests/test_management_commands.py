"""Tests for the compliance app's management commands."""

import pytest
from django.core.management import call_command

from apps.compliance.models import Building, Elevator

pytestmark = pytest.mark.django_db


class TestSeedDemoData:
    """Tests for the ``seed_demo_data`` command."""

    def test_seeds_a_realistic_portfolio_size(self) -> None:
        """Seeding creates several buildings and 25-30 elevators total."""
        call_command("seed_demo_data")
        assert Building.objects.count() >= 6
        assert 25 <= Elevator.objects.count() <= 30

    def test_every_building_has_elevators(self) -> None:
        """Every seeded building has at least one elevator."""
        call_command("seed_demo_data")
        for building in Building.objects.all():
            assert building.elevators.exists()

    def test_seeds_a_mix_of_inspection_types(self) -> None:
        """Both CAT1 and CAT5 inspection types are represented."""
        call_command("seed_demo_data")
        types = set(Elevator.objects.values_list("inspection_type", flat=True))
        assert types == {"CAT1", "CAT5"}

    def test_default_clears_existing_data_first(self, building: Building) -> None:
        """Running without flags replaces any existing buildings/elevators."""
        call_command("seed_demo_data")
        assert not Building.objects.filter(pk=building.pk).exists()

    def test_keep_existing_flag_preserves_prior_data(self, building: Building) -> None:
        """``--keep-existing`` seeds additional data without deleting what's there."""
        call_command("seed_demo_data", keep_existing=True)
        assert Building.objects.filter(pk=building.pk).exists()
