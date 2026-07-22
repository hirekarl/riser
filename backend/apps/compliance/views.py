"""DRF views for the compliance app."""

from collections.abc import Sequence
from typing import Any

from django.db.models import QuerySet
from rest_framework import generics, viewsets
from rest_framework.request import Request
from rest_framework.response import Response

from apps.compliance.models import Building, Elevator
from apps.compliance.serializers import (
    BuildingSerializer,
    ElevatorSerializer,
    LedgerEntrySerializer,
)
from apps.compliance.services import Status, calculate_due_date, calculate_status

#: Sort priority for each status, most urgent first. Used as the primary
#: sort key for the ledger endpoint.
_STATUS_RANK = {
    Status.DELINQUENT: 0,
    Status.WARNING: 1,
    Status.COMPLIANT: 2,
}


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
        building_id = self.request.query_params.get("building")
        if building_id is not None:
            queryset = queryset.filter(building_id=building_id)
        return queryset


class LedgerListView(generics.ListAPIView[Elevator]):
    """The P0 risk-triage ledger: every elevator, ranked by urgency.

    Read-only. Rows are sorted with the most urgent status first
    (Delinquent > Warning > Compliant), and within each status tier by
    ascending computed due date.

    The ordering depends on ``due_date`` and ``status``, which are
    computed rather than stored, so it cannot be expressed as a
    ``QuerySet.order_by(...)`` clause. Sorting is therefore done in
    Python within :meth:`list`, rather than via ``get_queryset``, so
    that this view's queryset-typed methods keep their normal DRF
    signatures.

    Supports filtering by building via the ``?building=<id>`` query
    parameter, the same way ``ElevatorViewSet`` does.
    """

    serializer_class = LedgerEntrySerializer

    def get_queryset(self) -> QuerySet[Elevator]:
        """Return elevators, optionally filtered by the ``building`` query parameter.

        Returns:
            All elevators, or only those belonging to the building whose
            id is given in ``?building=<id>`` if that parameter is present.
        """
        queryset = Elevator.objects.select_related("building").all()
        building_id = self.request.query_params.get("building")
        if building_id is not None:
            queryset = queryset.filter(building_id=building_id)
        return queryset

    def _sorted_elevators(self) -> Sequence[Elevator]:
        """Return all elevators sorted by urgency then due date.

        Returns:
            Elevators ordered by status rank (Delinquent, then Warning,
            then Compliant) and, within each tier, by ascending due date.
        """
        elevators = list(self.filter_queryset(self.get_queryset()))

        def sort_key(elevator: Elevator) -> tuple[int, str]:
            due_date = calculate_due_date(elevator.inspection_type, elevator.last_inspection_date)
            rank = _STATUS_RANK[calculate_status(due_date)]
            return (rank, due_date.isoformat())

        return sorted(elevators, key=sort_key)

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
