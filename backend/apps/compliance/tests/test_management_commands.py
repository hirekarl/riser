"""Tests for the compliance app's management commands."""

import datetime

import pytest
from django.core.management import call_command

from apps.compliance import dob
from apps.compliance.demo_data import SEED_ADDRESSES
from apps.compliance.models import Building, Elevator

pytestmark = pytest.mark.django_db


@pytest.mark.usefixtures("live_dob_seed_data")
class TestSeedDemoData:
    """Tests for the ``seed_demo_data`` command, against stubbed live DOB lookups."""

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

    def test_elevators_get_real_dob_device_numbers(self) -> None:
        """Seeded elevators carry non-null, DOB-format device numbers from the live lookup."""
        call_command("seed_demo_data")
        device_numbers = list(Elevator.objects.values_list("dob_device_number", flat=True))
        assert all(device_numbers)
        # DOB device numbers look like "1P766": digit, letter(s), digits.
        for device_number in device_numbers:
            assert device_number is not None
            assert device_number[0].isdigit()
            assert device_number[1].isalpha()

    def test_buildings_get_real_addresses_not_placeholders(self) -> None:
        """Seeded buildings use the curated real addresses, not old placeholders."""
        call_command("seed_demo_data")
        addresses = set(Building.objects.values_list("address", flat=True))
        assert "10 Riser Plaza, New York, NY 10001" not in addresses
        assert addresses <= {address for _, address in SEED_ADDRESSES}

    def test_elevators_carry_the_devices_real_last_inspection_date(self) -> None:
        """Elevators' last_inspection_date is the live draft's date, not a fabricated tier."""
        call_command("seed_demo_data")
        dates = set(Elevator.objects.values_list("last_inspection_date", flat=True))
        # The stubbed live lookup only ever files on these two exact dates.
        assert dates <= {datetime.date(2026, 1, 1), datetime.date(2022, 1, 1)}


class TestSeedDemoDataResilience:
    """Tests that a partial live-DOB outage degrades gracefully rather than failing the run."""

    def test_one_address_failing_to_resolve_does_not_abort_the_run(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """An address with no BIN match is skipped; the rest still seed."""
        first_name, _first_address = SEED_ADDRESSES[0]

        def fake_resolve_address(address: str, *, size: int = 5) -> list[dob.AddressMatch]:
            if address == SEED_ADDRESSES[0][1]:
                return []
            return [dob.AddressMatch(label=address, borough="Manhattan", bin="1000001")]

        def fake_fetch_devices(bin_value: str, *, limit: int = 1000) -> list[dob.DobDevice]:
            return [
                dob.DobDevice(
                    device_number="1P766",
                    device_type="Elevator",
                    device_status="Active",
                    cat1_latest_report_filed=datetime.date(2026, 1, 1),
                    cat5_latest_report_filed=None,
                    house_number="1",
                    street_name="TEST STREET",
                    bin=bin_value,
                )
            ]

        monkeypatch.setattr(dob, "resolve_address", fake_resolve_address)
        monkeypatch.setattr(dob, "fetch_devices", fake_fetch_devices)

        call_command("seed_demo_data")

        assert Building.objects.count() == len(SEED_ADDRESSES) - 1
        assert not Building.objects.filter(name=first_name).exists()

    def test_a_dob_lookup_error_resolving_an_address_does_not_abort_the_run(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A ``DobLookupError`` geocoding one address is skipped, not fatal."""
        first_name, first_address = SEED_ADDRESSES[0]

        def flaky_resolve_address(address: str, *, size: int = 5) -> list[dob.AddressMatch]:
            if address == first_address:
                raise dob.DobLookupError("geocoder timed out")
            return [dob.AddressMatch(label=address, borough="Manhattan", bin="1000001")]

        def fake_fetch_devices(bin_value: str, *, limit: int = 1000) -> list[dob.DobDevice]:
            return [
                dob.DobDevice(
                    device_number="1P766",
                    device_type="Elevator",
                    device_status="Active",
                    cat1_latest_report_filed=datetime.date(2026, 1, 1),
                    cat5_latest_report_filed=None,
                    house_number="1",
                    street_name="TEST STREET",
                    bin=bin_value,
                )
            ]

        monkeypatch.setattr(dob, "resolve_address", flaky_resolve_address)
        monkeypatch.setattr(dob, "fetch_devices", fake_fetch_devices)

        call_command("seed_demo_data")

        assert Building.objects.count() == len(SEED_ADDRESSES) - 1
        assert not Building.objects.filter(name=first_name).exists()

    def test_a_dob_lookup_error_fetching_devices_does_not_abort_the_run(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A ``DobLookupError`` fetching one building's devices is skipped, not fatal."""
        first_name, first_address = SEED_ADDRESSES[0]

        def fake_resolve_address(address: str, *, size: int = 5) -> list[dob.AddressMatch]:
            return [dob.AddressMatch(label=address, borough="Manhattan", bin="1000001")]

        calls = {"count": 0}

        def flaky_fetch_devices(bin_value: str, *, limit: int = 1000) -> list[dob.DobDevice]:
            # Only the very first call (the first curated address) fails.
            calls["count"] += 1
            if calls["count"] == 1:
                raise dob.DobLookupError("upstream timed out")
            return [
                dob.DobDevice(
                    device_number="1P766",
                    device_type="Elevator",
                    device_status="Active",
                    cat1_latest_report_filed=datetime.date(2026, 1, 1),
                    cat5_latest_report_filed=None,
                    house_number="1",
                    street_name="TEST STREET",
                    bin=bin_value,
                )
            ]

        monkeypatch.setattr(dob, "resolve_address", fake_resolve_address)
        monkeypatch.setattr(dob, "fetch_devices", flaky_fetch_devices)

        call_command("seed_demo_data")

        assert Building.objects.count() == len(SEED_ADDRESSES) - 1
        assert not Building.objects.filter(name=first_name, address=first_address).exists()

    def test_zero_drafts_for_a_resolved_building_skips_it_without_aborting(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A resolved BIN with no usable filed-date devices is skipped, not created empty."""
        first_name, _first_address = SEED_ADDRESSES[0]

        def fake_resolve_address(address: str, *, size: int = 5) -> list[dob.AddressMatch]:
            return [dob.AddressMatch(label=address, borough="Manhattan", bin="1000001")]

        def fake_fetch_devices(bin_value: str, *, limit: int = 1000) -> list[dob.DobDevice]:
            return []

        monkeypatch.setattr(dob, "resolve_address", fake_resolve_address)
        monkeypatch.setattr(dob, "fetch_devices", fake_fetch_devices)

        call_command("seed_demo_data")

        assert Building.objects.count() == 0
        assert not Building.objects.filter(name=first_name).exists()
