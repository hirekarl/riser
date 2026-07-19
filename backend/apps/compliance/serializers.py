"""DRF serializers for the compliance app."""

from rest_framework import serializers

from apps.compliance.models import Building, Elevator
from apps.compliance.services import calculate_due_date, calculate_status


class BuildingSerializer(serializers.ModelSerializer[Building]):
    """Serializer for CRUD operations on :class:`Building`."""

    class Meta:
        """Serializer configuration for BuildingSerializer."""

        model = Building
        fields = ["id", "name", "address", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class ElevatorSerializer(serializers.ModelSerializer[Elevator]):
    """Serializer for CRUD operations on :class:`Elevator`."""

    class Meta:
        """Serializer configuration for ElevatorSerializer."""

        model = Elevator
        fields = [
            "id",
            "building",
            "device_identifier",
            "inspection_type",
            "last_inspection_date",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class LedgerEntrySerializer(serializers.ModelSerializer[Elevator]):
    """Read-only serializer for the P0 risk-triage ledger.

    Annotates each elevator with its building's name and its computed
    due date and compliance status, derived on the fly via
    :mod:`apps.compliance.services` rather than read from stored fields.
    """

    building_name = serializers.CharField(source="building.name", read_only=True)
    due_date = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        """Serializer configuration for LedgerEntrySerializer."""

        model = Elevator
        fields = [
            "id",
            "device_identifier",
            "inspection_type",
            "last_inspection_date",
            "building_name",
            "due_date",
            "status",
        ]
        read_only_fields = fields

    def get_due_date(self, obj: Elevator) -> str:
        """Return the elevator's computed due date in ISO 8601 format.

        Args:
            obj: The elevator instance being serialized.

        Returns:
            The due date as an ISO 8601 (``YYYY-MM-DD``) string.
        """
        due_date = calculate_due_date(obj.inspection_type, obj.last_inspection_date)
        return due_date.isoformat()

    def get_status(self, obj: Elevator) -> str:
        """Return the elevator's computed compliance status label.

        Args:
            obj: The elevator instance being serialized.

        Returns:
            One of ``"Compliant"``, ``"Warning"``, or ``"Delinquent"``.
        """
        due_date = calculate_due_date(obj.inspection_type, obj.last_inspection_date)
        return calculate_status(due_date).value
