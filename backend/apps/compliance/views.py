"""DRF views for the compliance app."""

import datetime
import logging
from collections.abc import Sequence
from typing import Any

from django.db.models import QuerySet
from rest_framework import generics, viewsets
from rest_framework import status as http_status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.compliance import dob, narration
from apps.compliance.demo_data import seed_demo_portfolio
from apps.compliance.models import Building, Elevator
from apps.compliance.serializers import (
    AddressLookupRequestSerializer,
    BuildingSerializer,
    ElevatorSerializer,
    LedgerEntrySerializer,
)
from apps.compliance.services import Status, calculate_due_date, calculate_status

logger = logging.getLogger(__name__)

#: Sort priority for each status, most urgent first. Used as the primary
#: sort key for the ledger endpoint.
_STATUS_RANK = {
    Status.DELINQUENT: 0,
    Status.WARNING: 1,
    Status.COMPLIANT: 2,
}


def _sort_by_urgency(elevators: Sequence[Elevator]) -> list[Elevator]:
    """Sort elevators by urgency (status), then by ascending due date.

    Args:
        elevators: The elevators to sort.

    Returns:
        Elevators ordered by status rank (Delinquent, then Warning, then
        Compliant) and, within each tier, by ascending computed due date.
    """

    def sort_key(elevator: Elevator) -> tuple[int, str]:
        due_date = calculate_due_date(elevator.inspection_type, elevator.last_inspection_date)
        rank = _STATUS_RANK[calculate_status(due_date)]
        return (rank, due_date.isoformat())

    return sorted(elevators, key=sort_key)


def _parse_building_id_param(request: Request) -> int | None:
    """Parse the ``?building=`` query parameter into an integer id.

    Args:
        request: The incoming DRF request.

    Returns:
        The parsed integer building id, or ``None`` if ``?building=`` was
        not supplied at all.

    Raises:
        ValidationError: If ``?building=`` was supplied but isn't a valid
            integer. DRF's default exception handler turns this into a
            clean 400 response with a ``{"building": [...]}`` error body.
    """
    raw = request.query_params.get("building")
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        logger.warning("Rejected non-integer building query param: %r", raw)
        raise ValidationError({"building": f"{raw!r} is not a valid integer id."}) from None


def _match_dict(match: dob.AddressMatch) -> dict[str, str]:
    """Shape an :class:`~apps.compliance.dob.AddressMatch` for the lookup response.

    Args:
        match: A resolved geocoder candidate.

    Returns:
        A dict with ``bin``, ``resolved_address`` (the match's ``label``),
        and ``borough``, per ``docs/architecture/integration-contracts.md`` §3.
    """
    return {"bin": match.bin, "resolved_address": match.label, "borough": match.borough}


def _draft_dict(draft: dob.ElevatorDraft) -> dict[str, str]:
    """Shape an :class:`~apps.compliance.dob.ElevatorDraft` for the lookup response.

    Args:
        draft: One reviewable elevator row derived from a DOB device.

    Returns:
        A dict matching ``CreateElevatorPayload``'s shape, with the date
        serialized to ISO 8601.
    """
    return {
        "dob_device_number": draft.dob_device_number,
        "device_status": draft.device_status,
        "inspection_type": draft.inspection_type,
        "last_inspection_date": draft.last_inspection_date.isoformat(),
    }


#: Canned response for the "an external service failed" outcome, reused by
#: both stages of the lookup pipeline (address geocoding and device fetch).
_UPSTREAM_UNAVAILABLE_RESPONSE: dict[str, Any] = {
    "match": None,
    "matches": None,
    "drafts": [],
    "reason": "upstream_unavailable",
}


class BuildingViewSet(viewsets.ModelViewSet[Building]):
    """CRUD API for :class:`Building` records."""

    queryset = Building.objects.all()
    serializer_class = BuildingSerializer

    @action(detail=False, methods=["post"])
    def lookup(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Resolve a street address (or a picked BIN) to DOB elevator drafts.

        ``POST /api/buildings/lookup/`` — the P0 "add a building by
        address" feature (PRD Journey 1). Composes the three lookup
        stages in :mod:`apps.compliance.dob`: geocode an address to a
        BIN (:func:`dob.resolve_address`), fetch that BIN's known
        elevator devices (:func:`dob.fetch_devices`), then map those
        devices onto reviewable rows (:func:`dob.map_dob_devices_to_drafts`).

        This endpoint is read-only/preview — it does not persist
        anything. The caller reviews/overrides the returned drafts, then
        creates the building and elevators via the existing
        ``POST /api/buildings/`` and ``POST /api/elevators/`` endpoints.

        The request body must contain exactly one of ``address`` (an
        initial lookup) or ``bin`` (a re-call after the caller resolves
        an ``"ambiguous_match"`` response via a disambiguation picker,
        skipping geocoding entirely).

        Every outcome, including "no match", "no devices on file", and
        "upstream service unavailable", is returned as an HTTP 200 with
        a ``reason`` field the caller branches on — only a genuinely
        malformed request body (neither/both of ``address``/``bin``)
        produces a non-200 status. See
        ``docs/architecture/integration-contracts.md`` §3 for the full
        contract.

        Args:
            request: The incoming DRF request; its body is validated by
                :class:`~apps.compliance.serializers.AddressLookupRequestSerializer`.
            *args: Unused positional arguments from the URL dispatcher.
            **kwargs: Unused keyword arguments from the URL dispatcher.

        Returns:
            A ``Response`` with ``{"match", "matches", "drafts", "reason"}``,
            always HTTP 200 for well-formed requests (HTTP 400 for a
            malformed body).
        """
        request_serializer = AddressLookupRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)
        address = request_serializer.validated_data.get("address")
        bin_value = request_serializer.validated_data.get("bin")

        match: dob.AddressMatch | None = None
        if address:
            try:
                matches = dob.resolve_address(address)
            except dob.DobLookupError:
                logger.exception("Address geocoding failed")
                return Response(_UPSTREAM_UNAVAILABLE_RESPONSE)
            if not matches:
                return Response(
                    {"match": None, "matches": None, "drafts": [], "reason": "address_not_found"}
                )
            if dob.is_ambiguous(matches):
                return Response(
                    {
                        "match": None,
                        "matches": [_match_dict(candidate) for candidate in matches],
                        "drafts": [],
                        "reason": "ambiguous_match",
                    }
                )
            match = matches[0]
            bin_value = match.bin

        assert bin_value is not None  # noqa: S101 — guaranteed by the request serializer's XOR check

        try:
            devices = dob.fetch_devices(bin_value)
        except dob.DobLookupError:
            logger.exception("DOB device fetch failed")
            return Response(_UPSTREAM_UNAVAILABLE_RESPONSE)

        match_dict = (
            _match_dict(match)
            if match is not None
            else {"bin": bin_value, "resolved_address": None, "borough": None}
        )

        if not devices:
            return Response(
                {"match": match_dict, "matches": None, "drafts": [], "reason": "no_devices_on_file"}
            )

        drafts = dob.map_dob_devices_to_drafts(devices)
        return Response(
            {
                "match": match_dict,
                "matches": None,
                "drafts": [_draft_dict(draft) for draft in drafts],
                "reason": None,
            }
        )


class ElevatorViewSet(viewsets.ModelViewSet[Elevator]):
    """CRUD API for :class:`Elevator` records.

    Supports filtering the list endpoint by building via the
    ``?building=<id>`` query parameter.
    """

    serializer_class = ElevatorSerializer

    def get_queryset(self) -> QuerySet[Elevator]:
        """Return elevators, optionally filtered by the ``building`` query parameter.

        Returns:
            All elevators, or only those belonging to the building whose
            id is given in ``?building=<id>`` if that parameter is present.
        """
        queryset = Elevator.objects.select_related("building").all()
        building_id = _parse_building_id_param(self.request)
        if building_id is not None:
            queryset = queryset.filter(building_id=building_id)
        return queryset


class LedgerListView(generics.ListAPIView[Elevator]):
    """The P0 risk-triage ledger: every elevator, ranked by urgency.

    Read-only. Rows are sorted with the most urgent status first
    (Delinquent > Warning > Compliant), and within each status tier by
    ascending computed due date. The list can be scoped to a single
    building via the ``?building=<id>`` query parameter, mirroring
    :class:`ElevatorViewSet`.

    The ordering depends on ``due_date`` and ``status``, which are
    computed rather than stored, so it cannot be expressed as a
    ``QuerySet.order_by(...)`` clause. Sorting is therefore done in
    Python within :meth:`list`. Filtering, by contrast, is a plain
    queryset operation and lives in :meth:`get_queryset`.
    """

    queryset = Elevator.objects.select_related("building").all()
    serializer_class = LedgerEntrySerializer

    def get_queryset(self) -> QuerySet[Elevator]:
        """Return ledger elevators, optionally scoped to one building.

        Returns:
            All elevators, or only those belonging to the building whose
            id is given in ``?building=<id>`` if that parameter is present.
        """
        queryset = Elevator.objects.select_related("building").all()
        building_id = _parse_building_id_param(self.request)
        if building_id is not None:
            queryset = queryset.filter(building_id=building_id)
        return queryset

    def _sorted_elevators(self) -> Sequence[Elevator]:
        """Return all elevators sorted by urgency then due date.

        Returns:
            Elevators ordered by status rank (Delinquent, then Warning,
            then Compliant) and, within each tier, by ascending due date.
        """
        return _sort_by_urgency(list(self.filter_queryset(self.get_queryset())))

    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Return the ranked ledger as a plain (unpaginated) JSON list.

        Args:
            request: The incoming DRF request.
            *args: Unused positional arguments from the URL dispatcher.
            **kwargs: Unused keyword arguments from the URL dispatcher.

        Returns:
            A ``Response`` wrapping the serialized, urgency-sorted ledger.
        """
        serializer = self.get_serializer(self._sorted_elevators(), many=True)
        return Response(serializer.data)


class NarrationView(APIView):
    """The AI risk-narration briefing: ``GET /api/ledger/narration/``.

    Read-only and on-demand, over the whole portfolio (no ``?building=``
    scoping). Reuses the same urgency-sorted, serialized ledger rows that
    :class:`LedgerListView` produces as the structured input to
    :func:`apps.compliance.narration.generate_narration`, rather than
    recomputing due dates/statuses here.
    """

    def get(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Return a generated narration for the current ledger state.

        Args:
            request: The incoming DRF request.
            *args: Unused positional arguments from the URL dispatcher.
            **kwargs: Unused keyword arguments from the URL dispatcher.

        Returns:
            A ``Response`` with ``{"narration": ..., "generated_at": ...}``
            on success (200), or ``{"error": "narration_unavailable"}``
            (503) if the underlying Claude API call failed or timed out.
        """
        elevators = _sort_by_urgency(list(Elevator.objects.select_related("building").all()))
        entries = LedgerEntrySerializer(elevators, many=True).data
        try:
            text = narration.generate_narration(list(entries))
        except narration.NarrationUnavailableError:
            logger.exception("Narration generation failed")
            return Response(
                {"error": "narration_unavailable"},
                status=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        generated_at = datetime.datetime.now(tz=datetime.UTC).isoformat()
        return Response({"narration": text, "generated_at": generated_at})


class DemoDataSeedView(APIView):
    """Seed a realistic demo portfolio over HTTP: ``POST /api/demo-data/seed/``.

    A network-reachable wrapper around
    :func:`apps.compliance.demo_data.seed_demo_portfolio`, for demo
    environments where there's no shell access to run the
    ``seed_demo_data`` management command directly.

    Unlike that command, this endpoint always seeds additively
    (``keep_existing=True``) and never exposes a way to trigger the
    command's destructive wipe-first behavior. This MVP is unauthenticated
    (``docs/adr/0002-no-auth-for-mvp.md``), so any endpoint reachable
    without credentials must never be able to destroy a real portfolio.
    """

    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Seed the demo portfolio, adding to whatever data already exists.

        Args:
            request: The incoming DRF request. The body is ignored — there
                are no seeding options exposed over HTTP.
            *args: Unused positional arguments from the URL dispatcher.
            **kwargs: Unused keyword arguments from the URL dispatcher.

        Returns:
            A ``Response`` with ``{"buildings_created": int,
            "elevators_created": int}`` and HTTP 201 on success.
        """
        result = seed_demo_portfolio(keep_existing=True)
        return Response(
            {
                "buildings_created": result.buildings_created,
                "elevators_created": result.elevators_created,
            },
            status=http_status.HTTP_201_CREATED,
        )
