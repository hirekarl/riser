"""DRF serializers for the compliance app."""

from rest_framework import serializers

from apps.compliance.models import Building, Elevator
from apps.compliance.services import calculate_due_date, calculate_status


class AddressLookupRequestSerializer(serializers.Serializer[dict[str, str]]):
    """Validates the request body for ``POST /api/buildings/lookup/``.

    Exactly one of ``address``/``bin`` must be present: ``address`` for an
    initial lookup, ``bin`` to re-call after the user resolves an
    ``"ambiguous_match"`` response via the disambiguation picker.
    """

    address = serializers.CharField(required=False, allow_blank=False)
    bin = serializers.CharField(required=False, allow_blank=False)

    def validate(self, attrs: dict[str, str]) -> dict[str, str]:
        """Ensure exactly one of ``address``/``bin`` was supplied.

        Args:
            attrs: The field values that passed per-field validation.

        Returns:
            ``attrs`` unchanged, once the exactly-one-of check passes.

        Raises:
            serializers.ValidationError: If neither or both fields are
                present.
        """
        has_address = bool(attrs.get("address"))
        has_bin = bool(attrs.get("bin"))
        if has_address == has_bin:
            raise serializers.ValidationError("Exactly one of 'address' or 'bin' is required.")
        return attrs


class BuildingSerializer(serializers.ModelSerializer[Building]):
    """Serializer for CRUD operations on :class:`Building`."""

    class Meta:
        """Serializer configuration for BuildingSerializer."""

        model = Building
        fields = ["id", "name", "address", "bin", "created_at", "updated_at"]
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
            "dob_device_number",
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
    has_open_violation = serializers.SerializerMethodField()

    class Meta:
        """Serializer configuration for LedgerEntrySerializer."""

        model = Elevator
        fields = [
            "id",
            "device_identifier",
            "inspection_type",
            "last_inspection_date",
            "dob_device_number",
            "building_name",
            "due_date",
            "status",
            "has_open_violation",
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

    def get_has_open_violation(self, obj: Elevator) -> bool:
        """Return whether this elevator has an open DOB safety violation on file.

        Reads from the ``open_violation_device_numbers`` set the view
        passes in via serializer context (see
        ``apps.compliance.views.LedgerListView``), rather than issuing a
        lookup per row. An elevator with no ``dob_device_number`` (never
        matched to a DOB device) is always ``False`` — there is nothing to
        join against.

        Args:
            obj: The elevator instance being serialized.

        Returns:
            ``True`` if this elevator's ``dob_device_number`` is present in
            the context's ``open_violation_device_numbers`` set.
        """
        if not obj.dob_device_number:
            return False
        open_device_numbers = self.context.get("open_violation_device_numbers", set())
        return obj.dob_device_number in open_device_numbers
