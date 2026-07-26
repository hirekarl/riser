"""Tests for the compliance app's DRF API: buildings, elevators, and the ledger."""

import datetime
import logging

import pytest
import time_machine
from dateutil.relativedelta import relativedelta
from rest_framework import status
from rest_framework.test import APIClient

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

    def test_retrieve_elevator(self, api_client: APIClient, elevator: Elevator) -> None:
        """GET /api/elevators/<id>/ returns the requested elevator."""
        response = api_client.get(f"/api/elevators/{elevator.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["device_identifier"] == elevator.device_identifier

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
        )
        response = api_client.get("/api/ledger/")
        assert response.status_code == status.HTTP_200_OK
        row = next(r for r in response.data if r["device_identifier"] == "EL-100")
        assert row["building_name"] == building.name
        assert row["due_date"] == "2026-06-11"
        assert row["status"] == "Warning"

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

    Not yet implemented (no ``narration.py`` module, view, or URL route) —
    these tests are pre-written scaffolding per
    ``docs/architecture/integration-contracts.md`` §5 and are expected to
    fail (404, since no route exists) until the feature is built.

    The monkeypatches below target ``apps.compliance.narration.generate_narration``
    (module-qualified, not a ``from ... import`` binding). This requires the
    eventual view to call it as ``narration.generate_narration(...)`` rather
    than importing the name directly, matching the ``test_dob.py`` convention
    of monkeypatching the boundary on the module object.

    ``apps.compliance.narration`` doesn't exist yet, so the import is done
    locally inside each test that needs it (rather than at module scope) —
    that keeps the ``ImportError`` scoped to these new tests instead of
    breaking collection of this entire file and every pre-existing test in it.

    Marked ``xfail`` so the pre-push coverage gate stays green on this
    branch; remove ``pytestmark`` once the endpoint exists and these pass
    for real.
    """

    pytestmark = pytest.mark.xfail(
        reason="GET /api/ledger/narration/ not implemented yet — integration-contracts.md §5",
        strict=False,
    )

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
        from apps.compliance import narration  # type: ignore[attr-defined]  # not built yet

        canned = "3 elevators are Delinquent, 2 enter Warning this week."
        monkeypatch.setattr(narration, "generate_narration", lambda entries: canned)

        response = api_client.get("/api/ledger/narration/")

        assert response.status_code == status.HTTP_200_OK
        assert canned in response.data["narration"]
        datetime.datetime.fromisoformat(response.data["generated_at"])

    def test_claude_unavailable_returns_503(
        self,
        api_client: APIClient,
        elevator: Elevator,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A NarrationUnavailableError from generate_narration surfaces as a bespoke 503."""
        from apps.compliance import narration  # type: ignore[attr-defined]  # not built yet

        def boom(entries: object) -> str:
            raise narration.NarrationUnavailableError("Claude timed out")

        monkeypatch.setattr(narration, "generate_narration", boom)

        response = api_client.get("/api/ledger/narration/")

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response.data == {"error": "narration_unavailable"}

    def test_narration_is_read_only(self, api_client: APIClient) -> None:
        """POST /api/ledger/narration/ is not allowed."""
        response = api_client.post("/api/ledger/narration/", {}, format="json")
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
