"""Tests for the compliance app's DRF API: buildings, elevators, and the ledger."""

import datetime
import decimal
import logging

import pytest
import time_machine
from dateutil.relativedelta import relativedelta
from rest_framework import status
from rest_framework.test import APIClient

from apps.compliance import dob, narration, violations
from apps.compliance.models import Building, Elevator

pytestmark = pytest.mark.django_db


class TestBuildingAPI:
    """CRUD tests for ``/api/buildings/``."""

    def test_list_buildings(self, api_client: APIClient, building: Building) -> None:
        """GET /api/buildings/ returns all buildings."""
        response = api_client.get("/api/buildings/")
        assert response.status_code == status.HTTP_200_OK
        names = [b["name"] for b in response.data]
        assert building.name in names

    def test_create_building(self, api_client: APIClient) -> None:
        """POST /api/buildings/ creates a new building."""
        payload = {"name": "20 Riser Ave", "address": "20 Riser Ave, New York, NY"}
        response = api_client.post("/api/buildings/", payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert Building.objects.filter(name="20 Riser Ave").exists()

    def test_retrieve_building(self, api_client: APIClient, building: Building) -> None:
        """GET /api/buildings/<id>/ returns the requested building."""
        response = api_client.get(f"/api/buildings/{building.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == building.name

    def test_update_building(self, api_client: APIClient, building: Building) -> None:
        """PATCH /api/buildings/<id>/ updates the building."""
        response = api_client.patch(
            f"/api/buildings/{building.pk}/", {"name": "Renamed"}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        building.refresh_from_db()
        assert building.name == "Renamed"

    def test_delete_building(self, api_client: APIClient, building: Building) -> None:
        """DELETE /api/buildings/<id>/ removes the building."""
        response = api_client.delete(f"/api/buildings/{building.pk}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Building.objects.filter(pk=building.pk).exists()

    def test_delete_building_cascades_to_its_elevators(
        self, api_client: APIClient, building: Building, elevator: Elevator
    ) -> None:
        """DELETE /api/buildings/<id>/ via the API also removes its elevators.

        The model layer already asserts cascade delete directly
        (``test_models.py::test_cascade_delete``); this closes the gap at the
        API layer, where the request goes through the viewset/router rather
        than calling ``building.delete()`` directly.
        """
        response = api_client.delete(f"/api/buildings/{building.pk}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Elevator.objects.filter(pk=elevator.pk).exists()


class TestElevatorAPI:
    """CRUD tests for ``/api/elevators/``."""

    def test_list_elevators(self, api_client: APIClient, elevator: Elevator) -> None:
        """GET /api/elevators/ returns all elevators."""
        response = api_client.get("/api/elevators/")
        assert response.status_code == status.HTTP_200_OK
        ids = [e["id"] for e in response.data]
        assert elevator.pk in ids

    def test_filter_elevators_by_building(
        self, api_client: APIClient, building: Building, elevator: Elevator
    ) -> None:
        """GET /api/elevators/?building=<id> returns only that building's elevators."""
        other_building = Building.objects.create(name="Other", address="Other Ave")
        Elevator.objects.create(
            building=other_building,
            device_identifier="EL-OTHER",
            inspection_type="CAT1",
            last_inspection_date=datetime.date(2026, 1, 1),
        )
        response = api_client.get(f"/api/elevators/?building={building.pk}")
        assert response.status_code == status.HTTP_200_OK
        ids = [e["id"] for e in response.data]
        assert ids == [elevator.pk]

    def test_create_elevator(self, api_client: APIClient, building: Building) -> None:
        """POST /api/elevators/ creates a new elevator."""
        payload = {
            "building": building.pk,
            "device_identifier": "EL-999",
            "inspection_type": "CAT5",
            "last_inspection_date": "2025-06-01",
        }
        response = api_client.post("/api/elevators/", payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert Elevator.objects.filter(device_identifier="EL-999").exists()

    def test_create_elevator_with_dob_device_number(
        self, api_client: APIClient, building: Building
    ) -> None:
        """POST /api/elevators/ accepts and persists an optional dob_device_number."""
        payload = {
            "building": building.pk,
            "device_identifier": "EL-1000",
            "inspection_type": "CAT1",
            "last_inspection_date": "2025-06-01",
            "dob_device_number": "1P766",
        }
        response = api_client.post("/api/elevators/", payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["dob_device_number"] == "1P766"
        created = Elevator.objects.get(device_identifier="EL-1000")
        assert created.dob_device_number == "1P766"

    def test_create_elevator_without_dob_device_number_is_null(
        self, api_client: APIClient, building: Building
    ) -> None:
        """POST /api/elevators/ without dob_device_number leaves it null (manual entry)."""
        payload = {
            "building": building.pk,
            "device_identifier": "EL-1001",
            "inspection_type": "CAT1",
            "last_inspection_date": "2025-06-01",
        }
        response = api_client.post("/api/elevators/", payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["dob_device_number"] is None
        created = Elevator.objects.get(device_identifier="EL-1001")
        assert created.dob_device_number is None

    def test_retrieve_elevator(self, api_client: APIClient, elevator: Elevator) -> None:
        """GET /api/elevators/<id>/ returns the requested elevator."""
        response = api_client.get(f"/api/elevators/{elevator.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["device_identifier"] == elevator.device_identifier
        assert "dob_device_number" in response.data

    def test_update_elevator(self, api_client: APIClient, elevator: Elevator) -> None:
        """PATCH /api/elevators/<id>/ updates the elevator's last inspection date."""
        response = api_client.patch(
            f"/api/elevators/{elevator.pk}/",
            {"last_inspection_date": "2026-05-01"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        elevator.refresh_from_db()
        assert elevator.last_inspection_date == datetime.date(2026, 5, 1)

    def test_delete_elevator(self, api_client: APIClient, elevator: Elevator) -> None:
        """DELETE /api/elevators/<id>/ removes the elevator."""
        response = api_client.delete(f"/api/elevators/{elevator.pk}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Elevator.objects.filter(pk=elevator.pk).exists()

    def test_elevator_list_invalid_building_id_returns_400(self, api_client: APIClient) -> None:
        """GET /api/elevators/?building=abc returns a clean 400, not a raw 500."""
        response = api_client.get("/api/elevators/?building=abc")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "building" in response.data


class TestLedgerAPI:
    """Tests for the P0 ``/api/ledger/`` risk-triage endpoint."""

    def test_ledger_is_read_only(self, api_client: APIClient) -> None:
        """POST /api/ledger/ is not allowed; the ledger is a derived, read-only view."""
        response = api_client.post("/api/ledger/", {}, format="json")
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    def test_ledger_list_invalid_building_id_returns_400(self, api_client: APIClient) -> None:
        """GET /api/ledger/?building=abc returns a clean 400, not a raw 500."""
        response = api_client.get("/api/ledger/?building=abc")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "building" in response.data

    def test_ledger_with_invalid_inspection_type_returns_clean_500(
        self, api_client: APIClient, elevator: Elevator, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Legacy bad data that bypasses serializer validation yields a clean 500, not a crash.

        Simulates a direct DB edit (e.g. a manual data fix) that sets
        ``inspection_type`` to a value outside the ``CAT1``/``CAT5`` choices.
        Since Django's ``choices`` option isn't a database constraint, this
        is possible in production, and :func:`calculate_due_date` raises a
        bare ``ValueError`` for it. The custom exception handler should
        convert that into a structured JSON 500 response rather than a raw
        Django debug page or unhandled traceback.
        """
        Elevator.objects.filter(pk=elevator.pk).update(inspection_type="BOGUS")

        with caplog.at_level(logging.ERROR):
            response = api_client.get("/api/ledger/")

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert response.data == {
            "error": {
                "code": "internal_error",
                "message": "Something went wrong. Please try again.",
            }
        }
        assert "Unhandled exception" in caplog.text

    def test_ledger_filtered_by_building(self, api_client: APIClient, building: Building) -> None:
        """GET /api/ledger/?building=<id> returns only that building's elevators, still ranked."""
        other_building = Building.objects.create(name="Other", address="Other Ave")
        mine = Elevator.objects.create(
            building=building,
            device_identifier="MINE-1",
            inspection_type="CAT1",
            last_inspection_date=datetime.date(2024, 1, 1),
        )
        Elevator.objects.create(
            building=other_building,
            device_identifier="THEIRS-1",
            inspection_type="CAT1",
            last_inspection_date=datetime.date(2024, 1, 1),
        )

        response = api_client.get(f"/api/ledger/?building={building.pk}")

        assert response.status_code == status.HTTP_200_OK
        device_ids = [row["device_identifier"] for row in response.data]
        assert device_ids == [mine.device_identifier]

    def test_ledger_unfiltered_returns_all_buildings(
        self, api_client: APIClient, building: Building
    ) -> None:
        """Without a building param, the ledger spans every building."""
        other_building = Building.objects.create(name="Other", address="Other Ave")
        Elevator.objects.create(
            building=building,
            device_identifier="MINE-1",
            inspection_type="CAT1",
            last_inspection_date=datetime.date(2024, 1, 1),
        )
        Elevator.objects.create(
            building=other_building,
            device_identifier="THEIRS-1",
            inspection_type="CAT1",
            last_inspection_date=datetime.date(2024, 1, 1),
        )

        response = api_client.get("/api/ledger/")

        assert response.status_code == status.HTTP_200_OK
        device_ids = {row["device_identifier"] for row in response.data}
        assert {"MINE-1", "THEIRS-1"} <= device_ids

    @time_machine.travel(datetime.date(2026, 6, 1))
    def test_ledger_includes_computed_fields(
        self, api_client: APIClient, building: Building
    ) -> None:
        """Each ledger row includes building_name, computed due_date, and computed status."""
        last_inspection = (
            datetime.date(2026, 6, 1) - relativedelta(years=1) + datetime.timedelta(days=10)
        )
        Elevator.objects.create(
            building=building,
            device_identifier="EL-100",
            inspection_type="CAT1",
            last_inspection_date=last_inspection,
            dob_device_number="1P766",
        )
        response = api_client.get("/api/ledger/")
        assert response.status_code == status.HTTP_200_OK
        row = next(r for r in response.data if r["device_identifier"] == "EL-100")
        assert row["building_name"] == building.name
        assert row["due_date"] == "2026-06-11"
        assert row["status"] == "Warning"
        assert row["dob_device_number"] == "1P766"

    def test_ledger_flags_open_violation_by_device_number(
        self, api_client: APIClient, building: Building, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A row whose dob_device_number has an open DOB violation is flagged True."""
        with_violation = Elevator.objects.create(
            building=building,
            device_identifier="HAS-VIOLATION",
            inspection_type="CAT1",
            last_inspection_date=datetime.date(2024, 1, 1),
            dob_device_number="1P766",
        )
        without_violation = Elevator.objects.create(
            building=building,
            device_identifier="NO-VIOLATION",
            inspection_type="CAT1",
            last_inspection_date=datetime.date(2024, 1, 1),
            dob_device_number="1P767",
        )
        no_dob_number = Elevator.objects.create(
            building=building,
            device_identifier="NO-DOB-NUMBER",
            inspection_type="CAT1",
            last_inspection_date=datetime.date(2024, 1, 1),
        )
        monkeypatch.setattr(
            violations, "fetch_open_device_numbers", lambda device_numbers: {"1P766"}
        )

        response = api_client.get("/api/ledger/")

        rows_by_id = {row["id"]: row for row in response.data}
        assert rows_by_id[with_violation.pk]["has_open_violation"] is True
        assert rows_by_id[without_violation.pk]["has_open_violation"] is False
        assert rows_by_id[no_dob_number.pk]["has_open_violation"] is False

    def test_ledger_violations_upstream_failure_degrades_to_false(
        self, api_client: APIClient, building: Building, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A failed violations lookup still returns 200, with has_open_violation=False."""
        Elevator.objects.create(
            building=building,
            device_identifier="EL-100",
            inspection_type="CAT1",
            last_inspection_date=datetime.date(2024, 1, 1),
            dob_device_number="1P766",
        )

        def boom(device_numbers: list[str]) -> set[str]:
            raise violations.ViolationsLookupError("Socrata timed out")

        monkeypatch.setattr(violations, "fetch_open_device_numbers", boom)

        response = api_client.get("/api/ledger/")

        assert response.status_code == status.HTTP_200_OK
        assert all(row["has_open_violation"] is False for row in response.data)

    @time_machine.travel(datetime.date(2026, 6, 1))
    def test_ledger_sort_order_delinquent_warning_compliant(
        self, api_client: APIClient, building: Building
    ) -> None:
        """Ledger rows are sorted Delinquent > Warning > Compliant, then due_date ascending."""
        today = datetime.date(2026, 6, 1)

        def make(device_identifier: str, due_date: datetime.date) -> Elevator:
            last_inspection = due_date - relativedelta(years=1)
            return Elevator.objects.create(
                building=building,
                device_identifier=device_identifier,
                inspection_type="CAT1",
                last_inspection_date=last_inspection,
            )

        # Intentionally created out of expected final order.
        compliant = make("COMPLIANT-1", today + datetime.timedelta(days=100))
        warning_later = make("WARNING-LATER", today + datetime.timedelta(days=20))
        delinquent_less_overdue = make("DELINQUENT-LESS", today - datetime.timedelta(days=10))
        warning_sooner = make("WARNING-SOONER", today + datetime.timedelta(days=5))
        delinquent_more_overdue = make("DELINQUENT-MORE", today - datetime.timedelta(days=50))

        response = api_client.get("/api/ledger/")
        assert response.status_code == status.HTTP_200_OK

        device_ids = [row["device_identifier"] for row in response.data]
        expected_order = [
            delinquent_more_overdue.device_identifier,
            delinquent_less_overdue.device_identifier,
            warning_sooner.device_identifier,
            warning_later.device_identifier,
            compliant.device_identifier,
        ]
        assert device_ids == expected_order

        statuses = [row["status"] for row in response.data]
        assert statuses == ["Delinquent", "Delinquent", "Warning", "Warning", "Compliant"]


class TestNarrationAPI:
    """Tests for the AI risk-narration endpoint ``GET /api/ledger/narration/``.

    The monkeypatches below target ``apps.compliance.narration.generate_narration``
    (module-qualified, not a ``from ... import`` binding). This requires the
    view to call it as ``narration.generate_narration(...)`` rather than
    importing the name directly, matching the ``test_dob.py`` convention of
    monkeypatching the boundary on the module object.
    """

    def test_empty_ledger_returns_fixed_narration_without_calling_claude(
        self, api_client: APIClient
    ) -> None:
        """No elevators at all yields the fixed empty-portfolio narration, still 200."""
        response = api_client.get("/api/ledger/narration/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["narration"] == "No elevators tracked yet."
        # generated_at must be present and parse as an ISO 8601 datetime.
        datetime.datetime.fromisoformat(response.data["generated_at"])

    def test_non_empty_ledger_returns_generated_narration(
        self,
        api_client: APIClient,
        elevator: Elevator,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A non-empty ledger's narration comes from generate_narration's return value."""
        canned = "3 elevators are Delinquent, 2 enter Warning this week."
        monkeypatch.setattr(
            narration, "generate_narration", lambda entries, building_fine_exposures=None: canned
        )

        response = api_client.get("/api/ledger/narration/")

        assert response.status_code == status.HTTP_200_OK
        assert canned in response.data["narration"]
        datetime.datetime.fromisoformat(response.data["generated_at"])

    def test_narration_input_carries_has_open_violation(
        self,
        api_client: APIClient,
        elevator: Elevator,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """The entries passed to generate_narration flag open violations (issue #120)."""
        elevator.dob_device_number = "1P766"
        elevator.save(update_fields=["dob_device_number"])
        monkeypatch.setattr(
            violations, "fetch_open_device_numbers", lambda device_numbers: {"1P766"}
        )
        seen_entries: list[dict[str, object]] = []

        def fake_generate_narration(
            entries: list[dict[str, object]],
            building_fine_exposures: list[dict[str, object]] | None = None,
        ) -> str:
            seen_entries.extend(entries)
            return "briefing"

        monkeypatch.setattr(narration, "generate_narration", fake_generate_narration)

        response = api_client.get("/api/ledger/narration/")

        assert response.status_code == status.HTTP_200_OK
        row = next(e for e in seen_entries if e.get("id") == elevator.pk)
        assert row["has_open_violation"] is True

    def test_narration_input_carries_building_fine_exposure(
        self,
        api_client: APIClient,
        building: Building,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """generate_narration receives building-level fine exposure for binned buildings."""
        building.bin = "1001026"
        building.save(update_fields=["bin"])
        Elevator.objects.create(
            building=building,
            device_identifier="EL-100",
            inspection_type="CAT1",
            last_inspection_date=datetime.date(2024, 1, 1),
        )
        monkeypatch.setattr(
            violations,
            "fetch_building_fine_exposures",
            lambda bins: {
                "1001026": violations.FineExposure(
                    bin="1001026",
                    total_balance_due=decimal.Decimal("3150.50"),
                    open_violation_count=2,
                )
            },
        )
        seen: dict[str, object] = {}

        def fake_generate_narration(
            entries: list[dict[str, object]],
            building_fine_exposures: list[dict[str, object]] | None = None,
        ) -> str:
            seen["building_fine_exposures"] = building_fine_exposures
            return "briefing"

        monkeypatch.setattr(narration, "generate_narration", fake_generate_narration)

        response = api_client.get("/api/ledger/narration/")

        assert response.status_code == status.HTTP_200_OK
        assert seen["building_fine_exposures"] == [
            {
                "building_name": building.name,
                "total_exposure": "3150.50",
                "open_violation_count": 2,
            }
        ]

    def test_narration_omits_fine_exposure_for_buildings_without_a_bin(
        self,
        api_client: APIClient,
        elevator: Elevator,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A building with no BIN contributes nothing to building_fine_exposures."""

        def boom(bins: list[str]) -> dict[str, violations.FineExposure]:
            raise AssertionError("should not be called when no building has a bin")

        monkeypatch.setattr(violations, "fetch_building_fine_exposures", boom)
        seen: dict[str, object] = {}

        def fake_generate_narration(
            entries: list[dict[str, object]],
            building_fine_exposures: list[dict[str, object]] | None = None,
        ) -> str:
            seen["building_fine_exposures"] = building_fine_exposures
            return "briefing"

        monkeypatch.setattr(narration, "generate_narration", fake_generate_narration)

        response = api_client.get("/api/ledger/narration/")

        assert response.status_code == status.HTTP_200_OK
        assert seen["building_fine_exposures"] == []

    def test_narration_fine_exposure_upstream_failure_degrades_to_empty(
        self,
        api_client: APIClient,
        building: Building,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A failed batched fine-exposure lookup doesn't break narration generation."""
        building.bin = "1001026"
        building.save(update_fields=["bin"])
        Elevator.objects.create(
            building=building,
            device_identifier="EL-100",
            inspection_type="CAT1",
            last_inspection_date=datetime.date(2024, 1, 1),
        )

        def boom(bins: list[str]) -> dict[str, violations.FineExposure]:
            raise violations.ViolationsLookupError("Socrata timed out")

        monkeypatch.setattr(violations, "fetch_building_fine_exposures", boom)
        seen: dict[str, object] = {}

        def fake_generate_narration(
            entries: list[dict[str, object]],
            building_fine_exposures: list[dict[str, object]] | None = None,
        ) -> str:
            seen["building_fine_exposures"] = building_fine_exposures
            return "briefing"

        monkeypatch.setattr(narration, "generate_narration", fake_generate_narration)

        response = api_client.get("/api/ledger/narration/")

        assert response.status_code == status.HTTP_200_OK
        assert seen["building_fine_exposures"] == []

    def test_claude_unavailable_returns_503(
        self,
        api_client: APIClient,
        elevator: Elevator,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A NarrationUnavailableError from generate_narration surfaces as a bespoke 503."""

        def boom(entries: object, building_fine_exposures: object = None) -> str:
            raise narration.NarrationUnavailableError("Claude timed out")

        monkeypatch.setattr(narration, "generate_narration", boom)

        response = api_client.get("/api/ledger/narration/")

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response.data == {"error": "narration_unavailable"}

    def test_narration_is_read_only(self, api_client: APIClient) -> None:
        """POST /api/ledger/narration/ is not allowed."""
        response = api_client.post("/api/ledger/narration/", {}, format="json")
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED


class TestBuildingLookupAPI:
    """Tests for ``POST /api/buildings/lookup/``.

    The monkeypatches below target ``apps.compliance.dob.resolve_address``
    and ``apps.compliance.dob.fetch_devices`` (module-qualified), matching
    ``test_dob.py``'s convention of mocking the external boundary rather
    than hitting the network.
    """

    def test_malformed_body_neither_field_returns_400(self, api_client: APIClient) -> None:
        """A body with neither ``address`` nor ``bin`` is a 400."""
        response = api_client.post("/api/buildings/lookup/", {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_malformed_body_both_fields_returns_400(self, api_client: APIClient) -> None:
        """A body with both ``address`` and ``bin`` is a 400."""
        response = api_client.post(
            "/api/buildings/lookup/",
            {"address": "350 Fifth Avenue", "bin": "1001686"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_address_not_found(
        self, api_client: APIClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """An address with no geocoder matches yields the not-found reason."""
        monkeypatch.setattr(dob, "resolve_address", lambda address: [])

        response = api_client.post(
            "/api/buildings/lookup/", {"address": "nowhere at all"}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {
            "match": None,
            "matches": None,
            "drafts": [],
            "reason": "address_not_found",
        }

    def test_ambiguous_match(self, api_client: APIClient, monkeypatch: pytest.MonkeyPatch) -> None:
        """An address spanning more than one BIN yields the ambiguous reason and candidates."""
        matches = [
            dob.AddressMatch("200 WATER STREET, New York, NY", "Manhattan", "1001163"),
            dob.AddressMatch("200 WATER STREET, Brooklyn, NY", "Brooklyn", "3000094"),
        ]
        monkeypatch.setattr(dob, "resolve_address", lambda address: matches)

        response = api_client.post(
            "/api/buildings/lookup/", {"address": "200 Water St"}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {
            "match": None,
            "matches": [
                {
                    "bin": "1001163",
                    "resolved_address": "200 WATER STREET, New York, NY",
                    "borough": "Manhattan",
                },
                {
                    "bin": "3000094",
                    "resolved_address": "200 WATER STREET, Brooklyn, NY",
                    "borough": "Brooklyn",
                },
            ],
            "drafts": [],
            "reason": "ambiguous_match",
        }

    def test_no_devices_on_file(
        self, api_client: APIClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A resolved BIN with no DOB devices yields the no-devices reason."""
        matches = [dob.AddressMatch("350 5 AVENUE", "Manhattan", "1001686")]
        monkeypatch.setattr(dob, "resolve_address", lambda address: matches)
        monkeypatch.setattr(dob, "fetch_devices", lambda bin_value, **kwargs: [])

        response = api_client.post(
            "/api/buildings/lookup/", {"address": "350 Fifth Avenue"}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {
            "match": {
                "bin": "1001686",
                "resolved_address": "350 5 AVENUE",
                "borough": "Manhattan",
            },
            "matches": None,
            "drafts": [],
            "reason": "no_devices_on_file",
        }

    def test_successful_lookup_by_address_returns_drafts(
        self, api_client: APIClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A single unambiguous match with devices returns match + drafts."""
        matches = [dob.AddressMatch("350 5 AVENUE", "Manhattan", "1001686")]
        devices = [
            dob.DobDevice(
                device_number="1P766",
                device_type="Elevator",
                device_status="Active",
                cat1_latest_report_filed=datetime.date(2026, 3, 1),
                cat5_latest_report_filed=None,
                house_number="350",
                street_name="5 AVENUE",
                bin="1001686",
            )
        ]
        monkeypatch.setattr(dob, "resolve_address", lambda address: matches)
        monkeypatch.setattr(dob, "fetch_devices", lambda bin_value, **kwargs: devices)

        response = api_client.post(
            "/api/buildings/lookup/", {"address": "350 Fifth Avenue"}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {
            "match": {
                "bin": "1001686",
                "resolved_address": "350 5 AVENUE",
                "borough": "Manhattan",
            },
            "matches": None,
            "drafts": [
                {
                    "dob_device_number": "1P766",
                    "device_status": "Active",
                    "inspection_type": "CAT1",
                    "last_inspection_date": "2026-03-01",
                }
            ],
            "reason": None,
        }

    def test_successful_lookup_by_bin_skips_geocoding(
        self, api_client: APIClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A re-call with ``bin`` goes straight to the device fetch stage."""

        def boom(address: str) -> list[dob.AddressMatch]:
            raise AssertionError("resolve_address should not be called for a bin re-call")

        monkeypatch.setattr(dob, "resolve_address", boom)
        devices = [
            dob.DobDevice(
                device_number="1P767",
                device_type="Elevator",
                device_status="Active",
                cat1_latest_report_filed=None,
                cat5_latest_report_filed=datetime.date(2020, 5, 15),
                house_number="200",
                street_name="WATER STREET",
                bin="1001163",
            )
        ]
        monkeypatch.setattr(dob, "fetch_devices", lambda bin_value, **kwargs: devices)

        response = api_client.post("/api/buildings/lookup/", {"bin": "1001163"}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["reason"] is None
        assert response.data["match"] == {
            "bin": "1001163",
            "resolved_address": None,
            "borough": None,
        }
        assert response.data["drafts"] == [
            {
                "dob_device_number": "1P767",
                "device_status": "Active",
                "inspection_type": "CAT5",
                "last_inspection_date": "2020-05-15",
            }
        ]

    def test_resolve_address_upstream_failure_returns_200_with_reason(
        self, api_client: APIClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A ``DobLookupError`` from resolve_address is caught, not a 500."""

        def boom(address: str) -> list[dob.AddressMatch]:
            raise dob.DobLookupError("geocoder timed out")

        monkeypatch.setattr(dob, "resolve_address", boom)

        response = api_client.post(
            "/api/buildings/lookup/", {"address": "350 Fifth Avenue"}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {
            "match": None,
            "matches": None,
            "drafts": [],
            "reason": "upstream_unavailable",
        }

    def test_fetch_devices_upstream_failure_returns_200_with_reason(
        self, api_client: APIClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A ``DobLookupError`` from fetch_devices is caught, not a 500."""

        def boom(bin_value: str, **kwargs: object) -> list[dob.DobDevice]:
            raise dob.DobLookupError("Socrata timed out")

        monkeypatch.setattr(dob, "fetch_devices", boom)

        response = api_client.post("/api/buildings/lookup/", {"bin": "1001686"}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {
            "match": None,
            "matches": None,
            "drafts": [],
            "reason": "upstream_unavailable",
        }

    def test_lookup_get_not_allowed(self, api_client: APIClient) -> None:
        """GET /api/buildings/lookup/ is not allowed; this is a POST-only action."""
        response = api_client.get("/api/buildings/lookup/")
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED


class TestBuildingFineExposureAPI:
    """Tests for ``GET /api/buildings/fine-exposure/`` (issue #120, batched)."""

    def test_empty_portfolio_returns_empty_list(self, api_client: APIClient) -> None:
        """No buildings at all yields an empty list, no lookup attempted."""
        response = api_client.get("/api/buildings/fine-exposure/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    def test_building_with_no_bin_gets_reason(
        self, api_client: APIClient, building: Building
    ) -> None:
        """A building that's never been DOB-matched has no BIN to query by."""
        response = api_client.get("/api/buildings/fine-exposure/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data == [
            {
                "building": building.pk,
                "bin": None,
                "total_exposure": None,
                "open_violation_count": None,
                "reason": "no_bin_on_file",
            }
        ]

    def test_one_batched_call_covers_every_building_with_a_bin(
        self, api_client: APIClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Multiple buildings' exposure is resolved via a single batched lookup."""
        with_bin_a = Building.objects.create(name="Tower A", address="1 A St", bin="1001026")
        with_bin_b = Building.objects.create(name="Tower B", address="2 B St", bin="2000094")
        no_bin = Building.objects.create(name="Tower C", address="3 C St")

        seen: dict[str, list[str]] = {}

        def fake(bins: list[str]) -> dict[str, violations.FineExposure]:
            seen["bins"] = bins
            return {
                "1001026": violations.FineExposure(
                    bin="1001026",
                    total_balance_due=decimal.Decimal("3150.50"),
                    open_violation_count=2,
                ),
                "2000094": violations.FineExposure(
                    bin="2000094", total_balance_due=decimal.Decimal("0"), open_violation_count=0
                ),
            }

        monkeypatch.setattr(violations, "fetch_building_fine_exposures", fake)

        response = api_client.get("/api/buildings/fine-exposure/")

        assert response.status_code == status.HTTP_200_OK
        assert sorted(seen["bins"]) == ["1001026", "2000094"]
        rows_by_building = {row["building"]: row for row in response.data}
        assert rows_by_building[with_bin_a.pk] == {
            "building": with_bin_a.pk,
            "bin": "1001026",
            "total_exposure": "3150.50",
            "open_violation_count": 2,
            "reason": None,
        }
        assert rows_by_building[with_bin_b.pk]["total_exposure"] == "0"
        assert rows_by_building[no_bin.pk]["reason"] == "no_bin_on_file"

    def test_upstream_failure_returns_200_with_reason_for_binned_buildings(
        self, api_client: APIClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A failed batched ECB lookup is a clean 200/reason outcome, not a 500."""
        with_bin = Building.objects.create(name="Tower A", address="1 A St", bin="1001026")
        no_bin = Building.objects.create(name="Tower C", address="3 C St")

        def boom(bins: list[str]) -> dict[str, violations.FineExposure]:
            raise violations.ViolationsLookupError("Socrata timed out")

        monkeypatch.setattr(violations, "fetch_building_fine_exposures", boom)

        response = api_client.get("/api/buildings/fine-exposure/")

        assert response.status_code == status.HTTP_200_OK
        rows_by_building = {row["building"]: row for row in response.data}
        assert rows_by_building[with_bin.pk] == {
            "building": with_bin.pk,
            "bin": "1001026",
            "total_exposure": None,
            "open_violation_count": None,
            "reason": "upstream_unavailable",
        }
        # A no-bin building was never looked up, so it keeps its own reason
        # rather than being conflated with the upstream failure.
        assert rows_by_building[no_bin.pk]["reason"] == "no_bin_on_file"

    def test_fine_exposure_post_not_allowed(self, api_client: APIClient) -> None:
        """POST is not allowed; this is a GET-only action."""
        response = api_client.post("/api/buildings/fine-exposure/", {}, format="json")
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED


@pytest.mark.usefixtures("live_dob_seed_data")
class TestDemoDataSeedAPI:
    """Tests for ``POST /api/demo-data/seed/``, against stubbed live DOB lookups."""

    def test_seed_returns_201_with_counts(self, api_client: APIClient) -> None:
        """A successful seed returns 201 with buildings/elevators created counts."""
        response = api_client.post("/api/demo-data/seed/", {}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["buildings_created"] >= 6
        assert 25 <= response.data["elevators_created"] <= 30

    def test_seed_actually_creates_buildings_and_elevators(self, api_client: APIClient) -> None:
        """Calling the endpoint persists buildings and elevators to the database."""
        assert Building.objects.count() == 0
        assert Elevator.objects.count() == 0

        api_client.post("/api/demo-data/seed/", {}, format="json")

        assert Building.objects.count() >= 6
        assert Elevator.objects.count() >= 25

    def test_seed_is_additive_and_never_destroys_existing_data(
        self, api_client: APIClient, building: Building, elevator: Elevator
    ) -> None:
        """Calling the endpoint with existing data preserves it (never wipes on HTTP)."""
        response = api_client.post("/api/demo-data/seed/", {}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert Building.objects.filter(pk=building.pk).exists()
        assert Elevator.objects.filter(pk=elevator.pk).exists()

    def test_seed_get_not_allowed(self, api_client: APIClient) -> None:
        """GET /api/demo-data/seed/ is not allowed; this is a POST-only endpoint."""
        response = api_client.get("/api/demo-data/seed/")
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED


@pytest.mark.usefixtures("live_dob_seed_data")
class TestDemoDataResetAPI:
    """Tests for ``POST /api/demo-data/reset/``, the deliberately destructive companion."""

    def test_reset_deletes_all_buildings_and_elevators(self, api_client: APIClient) -> None:
        """Calling the endpoint wipes every building and elevator in the portfolio."""
        api_client.post("/api/demo-data/seed/", {}, format="json")
        assert Building.objects.count() > 0
        assert Elevator.objects.count() > 0

        response = api_client.post("/api/demo-data/reset/", {}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert Building.objects.count() == 0
        assert Elevator.objects.count() == 0

    def test_reset_returns_counts_of_deleted_rows(self, api_client: APIClient) -> None:
        """The response reports how many buildings/elevators were deleted."""
        api_client.post("/api/demo-data/seed/", {}, format="json")
        expected_buildings = Building.objects.count()
        expected_elevators = Elevator.objects.count()

        response = api_client.post("/api/demo-data/reset/", {}, format="json")

        assert response.data == {
            "buildings_deleted": expected_buildings,
            "elevators_deleted": expected_elevators,
        }

    def test_reset_is_idempotent_on_empty_portfolio(self, api_client: APIClient) -> None:
        """Calling reset again on an already-empty portfolio errors nothing, returns zeros."""
        assert Building.objects.count() == 0
        assert Elevator.objects.count() == 0

        response = api_client.post("/api/demo-data/reset/", {}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"buildings_deleted": 0, "elevators_deleted": 0}

    def test_reset_get_not_allowed(self, api_client: APIClient) -> None:
        """GET /api/demo-data/reset/ is not allowed; this is a POST-only endpoint."""
        response = api_client.get("/api/demo-data/reset/")
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
