"""Proof-of-concept resolver for the address → BIN → DOB-devices lookup.

This module is the backend spine of the rev-2 "add a building by address"
feature (PRD Journey 1): a manager types a street address, and Riser
resolves it to a BIN server-side and pulls that building's known elevator
devices — with their latest CAT1/CAT5 filing dates — straight from NYC's
public Open Data feed. No manual re-entry, no key, no scraping.

Two external, keyless, no-auth sources are used:

* **NYC Planning GeoSearch v2** (``geosearch.planninglabs.nyc/v2/search``)
  turns an address string into ranked matches, each carrying a BIN in
  ``properties.addendum.pad.bin``. (v1 is retired — it returns HTTP 410;
  see ``docs/architecture/geocoding-reachability-findings.md``.)
* **DOB NOW: Elevator Safety Compliance** (Socrata resource
  ``e5aq-a4j2``) returns every device recorded against a BIN.

This module proves the chain end-to-end: it normalizes the raw payloads
into typed objects (:class:`AddressMatch`, :class:`DobDevice`) and maps
devices onto reviewable :class:`ElevatorDraft` rows shaped to match
``CreateElevatorPayload``. It deliberately stops short of a DRF endpoint —
that's composed in ``apps/compliance/views.py``'s
``BuildingViewSet.lookup`` action.
"""

import dataclasses
import datetime
import json
import urllib.parse
import urllib.request
from typing import Any

#: NYC Planning GeoSearch v2 search endpoint (keyless, no auth).
GEOSEARCH_V2_URL = "https://geosearch.planninglabs.nyc/v2/search"

#: NYC Open Data "DOB NOW: Elevator Safety Compliance" resource (Socrata).
DOB_ELEVATOR_URL = "https://data.cityofnewyork.us/resource/e5aq-a4j2.json"

#: How long to wait on either external service before giving up, in seconds.
HTTP_TIMEOUT_SECONDS = 15


class DobLookupError(RuntimeError):
    """Raised when an external DOB/GeoSearch lookup fails or times out."""


@dataclasses.dataclass(frozen=True)
class AddressMatch:
    """A single geocoder candidate for a typed address.

    Attributes:
        label: The human-readable matched address (for a disambiguation UI).
        borough: The borough name, e.g. ``"Manhattan"``.
        bin: The Building Identification Number for this match.
    """

    label: str
    borough: str
    bin: str


@dataclasses.dataclass(frozen=True)
class DobDevice:
    """A normalized elevator device record from the DOB feed.

    Attributes:
        device_number: The DOB device identifier, e.g. ``"1P766"``.
        device_type: e.g. ``"Elevator"``.
        device_status: e.g. ``"Active"``.
        cat1_latest_report_filed: Date the latest CAT1 (annual) report was
            filed, or ``None`` if the feed has none.
        cat5_latest_report_filed: Date the latest CAT5 (five-year) report
            was filed, or ``None`` if the feed has none.
        house_number: Street number, for building the address label.
        street_name: Street name, for building the address label.
        bin: The BIN this device belongs to.
    """

    device_number: str
    device_type: str
    device_status: str
    cat1_latest_report_filed: datetime.date | None
    cat5_latest_report_filed: datetime.date | None
    house_number: str
    street_name: str
    bin: str


@dataclasses.dataclass(frozen=True)
class ElevatorDraft:
    """One reviewable elevator row derived from a DOB device's filing dates.

    Shaped to match ``CreateElevatorPayload`` directly (see
    ``docs/architecture/integration-contracts.md`` §3/§4 Stage 3) so the
    frontend can post it straight to ``POST /api/elevators/`` once the
    user assigns/creates the building. A single :class:`DobDevice` can
    yield up to two drafts (one per populated CAT1/CAT5 date), both
    carrying the same ``dob_device_number``.

    Attributes:
        dob_device_number: The source device's DOB ``device_number``.
        device_status: The source device's status, e.g. ``"Active"``.
        inspection_type: Which statutory category this draft represents,
            ``"CAT1"`` or ``"CAT5"``.
        last_inspection_date: The filing date for ``inspection_type``.
    """

    dob_device_number: str
    device_status: str
    inspection_type: str
    last_inspection_date: datetime.date


def _http_get_json(url: str) -> Any:
    """Fetch ``url`` and parse the JSON body.

    Args:
        url: The fully-formed request URL.

    Returns:
        The decoded JSON (a ``list`` or ``dict``).

    Raises:
        DobLookupError: If the request fails, times out, or the body is
            not valid JSON.
    """
    try:
        with urllib.request.urlopen(url, timeout=HTTP_TIMEOUT_SECONDS) as response:  # noqa: S310
            return json.loads(response.read())
    except (OSError, ValueError) as exc:
        raise DobLookupError(f"DOB lookup failed for {url!r}: {exc}") from exc


def _parse_dob_date(value: str | None) -> datetime.date | None:
    """Parse a DOB timestamp (``YYYY-MM-DDT00:00:00.000``) into a date.

    Args:
        value: The raw timestamp string, or ``None``/empty.

    Returns:
        The date portion, or ``None`` when ``value`` is missing.
    """
    if not value:
        return None
    return datetime.date.fromisoformat(value[:10])


def resolve_address(address: str, *, size: int = 5) -> list[AddressMatch]:
    """Resolve a street address to ranked BIN candidates via GeoSearch v2.

    Args:
        address: The address text a manager typed.
        size: Maximum number of candidates to request (for disambiguation).

    Returns:
        Matches in the geocoder's rank order, most confident first. Only
        candidates that carry a BIN are included; may be empty.
    """
    query = urllib.parse.urlencode({"text": address, "size": size})
    payload = _http_get_json(f"{GEOSEARCH_V2_URL}?{query}")
    matches: list[AddressMatch] = []
    for feature in payload.get("features", []):
        properties = feature.get("properties", {})
        pad = (properties.get("addendum") or {}).get("pad") or {}
        bin_value = pad.get("bin")
        if bin_value:
            matches.append(
                AddressMatch(
                    label=properties.get("label", ""),
                    borough=properties.get("borough", ""),
                    bin=str(bin_value),
                )
            )
    return matches


def is_ambiguous(matches: list[AddressMatch]) -> bool:
    """Return whether ``matches`` needs user disambiguation.

    A lookup is ambiguous when it resolves to more than one distinct BIN,
    in which case the UI should present a picker rather than silently
    onboarding the first match (which may even be in another borough).

    Args:
        matches: Candidates from :func:`resolve_address`.

    Returns:
        ``True`` if the matches span more than one distinct BIN.
    """
    return len({match.bin for match in matches}) > 1


def fetch_devices(bin_value: str, *, limit: int = 1000) -> list[DobDevice]:
    """Fetch every DOB elevator device recorded against a BIN.

    Args:
        bin_value: The Building Identification Number to query.
        limit: Maximum number of device rows to request.

    Returns:
        The building's devices, normalized; may be empty if DOB has none.
    """
    query = urllib.parse.urlencode({"bin": bin_value, "$limit": limit})
    rows = _http_get_json(f"{DOB_ELEVATOR_URL}?{query}")
    return [
        DobDevice(
            device_number=row.get("device_number", ""),
            device_type=row.get("device_type", ""),
            device_status=row.get("device_status", ""),
            cat1_latest_report_filed=_parse_dob_date(row.get("cat1_latest_report_filed")),
            cat5_latest_report_filed=_parse_dob_date(row.get("cat5_latest_report_filed")),
            house_number=row.get("house_number", ""),
            street_name=row.get("street_name", ""),
            bin=str(row.get("bin", bin_value)),
        )
        for row in rows
    ]


def map_dob_devices_to_drafts(devices: list[DobDevice]) -> list[ElevatorDraft]:
    """Map DOB devices to one reviewable :class:`ElevatorDraft` per filed date.

    Resolved 2026-07-24 (``docs/architecture/integration-contracts.md`` §4
    Stage 3): a :class:`DobDevice` can carry both a CAT1 and a CAT5 filing
    date, whereas an ``Elevator`` row has one ``inspection_type`` plus one
    ``last_inspection_date``. This function keeps that one-type-per-row
    model intact by emitting a separate draft per populated date field.

    Only devices with an active status (``device_status == "Active"``,
    case-insensitive) are converted to drafts. Inactive, decommissioned,
    or dismantled devices contribute no drafts.

    Args:
        devices: Normalized devices from :func:`fetch_devices`.

    Returns:
        One :class:`ElevatorDraft` per populated ``cat1_latest_report_filed``
        or ``cat5_latest_report_filed`` field for active devices, in device
        order (CAT1 before CAT5 for a given device). A non-active device or
        a device with neither date populated contributes no drafts.
    """
    drafts: list[ElevatorDraft] = []
    for device in devices:
        if device.device_status.strip().lower() != "active":
            continue
        if device.cat1_latest_report_filed is not None:
            drafts.append(
                ElevatorDraft(
                    dob_device_number=device.device_number,
                    device_status=device.device_status,
                    inspection_type="CAT1",
                    last_inspection_date=device.cat1_latest_report_filed,
                )
            )
        if device.cat5_latest_report_filed is not None:
            drafts.append(
                ElevatorDraft(
                    dob_device_number=device.device_number,
                    device_status=device.device_status,
                    inspection_type="CAT5",
                    last_inspection_date=device.cat5_latest_report_filed,
                )
            )
    return drafts
