"""DRF views for the compliance app."""

import datetime
import logging
from collections.abc import Sequence
from typing import Any

from django.db.models import QuerySet
from rest_framework import generics, viewsets
from rest_framework import status as http_status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.compliance import narration
from apps.compliance.models import Building, Elevator
from apps.compliance.serializers import (
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


class BuildingViewSet(viewsets.ModelViewSet[Building]):
    """CRUD API for :class:`Building` records."""

    queryset = Building.objects.all()
    serializer_class = BuildingSerializer


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
