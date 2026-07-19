"""Models for the compliance app: Building and Elevator.

Due dates and compliance statuses are intentionally not stored on
:class:`Elevator` — they are always computed on read via
:mod:`apps.compliance.services` so that editing ``last_inspection_date``
is reflected instantly with no risk of stale cached values.
"""

from django.db import models


class Building(models.Model):
    """A commercial property containing one or more elevators."""

    name = models.CharField(max_length=255)
    address = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Model metadata for Building."""

        ordering = ["name"]

    def __str__(self) -> str:
        """Return the building's name."""
        return self.name


class InspectionType(models.TextChoices):
    """NYC DOB elevator inspection categories tracked by Riser."""

    CAT1 = "CAT1", "Category 1 (Annual)"
    CAT5 = "CAT5", "Category 5 (Five-Year)"


class Elevator(models.Model):
    """A single elevator device belonging to a Building.

    Tracks the device's identifier, which statutory inspection category
    applies to it, and the date it was last inspected. The next due date
    and current compliance status are derived, not stored — see
    :mod:`apps.compliance.services`.
    """

    building = models.ForeignKey(Building, related_name="elevators", on_delete=models.CASCADE)
    device_identifier = models.CharField(max_length=100)
    inspection_type = models.CharField(max_length=4, choices=InspectionType.choices)
    last_inspection_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Model metadata for Elevator."""

        ordering = ["device_identifier"]

    def __str__(self) -> str:
        """Return a human-readable identifier including the device ID and building."""
        return f"{self.device_identifier} ({self.building.name})"
