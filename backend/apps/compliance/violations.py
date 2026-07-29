"""NYC DOB fine/penalty exposure lookups (issue #120).

Surfaces whether a specific elevator has an open violation, and how much
a building owes in outstanding fines, by querying two more NYC Open Data
Socrata resources alongside the existing ``e5aq-a4j2`` device feed
(:mod:`apps.compliance.dob`):

* **DOB Safety Violations** (``855j-jady``) — device-level civil
  penalties, joinable by ``device_number`` (same identifier Riser already
  stores as ``Elevator.dob_device_number``). Has no dollar amount.
* **DOB ECB Violations** (``6bgk-3dad``) — OATH/ECB-adjudicated summonses
  with real dollar amounts (``balance_due``), but only joinable by
  ``bin`` — there is no per-device identifier in this feed.

Because no single dataset has both a dollar amount and a device-level
identifier, this module deliberately keeps the two lookups separate
rather than pretending to resolve an exact per-elevator dollar figure:
:func:`fetch_open_device_numbers` answers "does this elevator have an
open violation" (device-level, no dollars); :func:`fetch_building_fine_exposure`
answers "how much does this building owe in total" (dollars, building-level
only). See ``docs/architecture/integration-contracts.md`` for how callers
are expected to combine the two.
"""

import dataclasses
import decimal
import json
import urllib.parse
import urllib.request
from typing import Any

#: NYC Open Data "DOB Safety Violations" resource (Socrata). Device-level,
#: updated daily.
DOB_VIOLATIONS_URL = "https://data.cityofnewyork.us/resource/855j-jady.json"

#: NYC Open Data "DOB ECB Violations" resource (Socrata). Building-level
#: (BIN only, no device identifier), updated every weekday.
ECB_VIOLATIONS_URL = "https://data.cityofnewyork.us/resource/6bgk-3dad.json"

#: The ``violation_status`` value on ``855j-jady`` that means "still open" —
#: the other observed values (Dismissed, Disputed Successfully,
#: Waived-Pending Dismissal) all mean the violation is resolved.
_OPEN_VIOLATION_STATUS = "Active"

#: How long to wait on either external service before giving up, in seconds.
HTTP_TIMEOUT_SECONDS = 15


class ViolationsLookupError(RuntimeError):
    """Raised when an external violations lookup fails or times out."""


@dataclasses.dataclass(frozen=True)
class FineExposure:
    """A building's total outstanding ECB fine exposure.

    Attributes:
        bin: The Building Identification Number this exposure is for.
        total_balance_due: Sum of ``balance_due`` across every outstanding
            (balance greater than zero) ECB violation on file for this BIN.
        open_violation_count: How many violations contributed to that sum.
    """

    bin: str
    total_balance_due: decimal.Decimal
    open_violation_count: int


def _http_get_json(url: str) -> Any:
    """Fetch ``url`` and parse the JSON body.

    Args:
        url: The fully-formed request URL.

    Returns:
        The decoded JSON (a ``list`` or ``dict``).

    Raises:
        ViolationsLookupError: If the request fails, times out, or the body
            is not valid JSON.
    """
    try:
        with urllib.request.urlopen(url, timeout=HTTP_TIMEOUT_SECONDS) as response:  # noqa: S310
            return json.loads(response.read())
    except (OSError, ValueError) as exc:
        raise ViolationsLookupError(f"Violations lookup failed for {url!r}: {exc}") from exc


def _soql_string_list(values: list[str]) -> str:
    """Render ``values`` as a SoQL ``in (...)`` literal list.

    Args:
        values: The string values to render (e.g. device numbers).

    Returns:
        A comma-separated, single-quoted literal list, e.g. ``"'A','B'"``.
        Embedded single quotes are escaped by doubling, per SoQL string
        literal rules.
    """
    return ",".join("'" + value.replace("'", "''") + "'" for value in values)


def fetch_open_device_numbers(device_numbers: list[str]) -> set[str]:
    """Return which of ``device_numbers`` have an open DOB safety violation.

    Args:
        device_numbers: DOB device numbers to check (e.g.
            ``Elevator.dob_device_number`` values). Duplicates are fine.

    Returns:
        The subset of ``device_numbers`` that have at least one
        ``855j-jady`` row with ``violation_status == "Active"``. Empty if
        ``device_numbers`` is empty (no request is made in that case).
    """
    if not device_numbers:
        return set()
    where = (
        f"device_number in ({_soql_string_list(device_numbers)}) "
        f"AND violation_status = '{_OPEN_VIOLATION_STATUS}'"
    )
    query = urllib.parse.urlencode({"$where": where, "$select": "device_number", "$limit": 10000})
    rows = _http_get_json(f"{DOB_VIOLATIONS_URL}?{query}")
    return {row["device_number"] for row in rows if row.get("device_number")}


def _parse_balance_due(value: str | None) -> decimal.Decimal:
    """Parse a raw ``balance_due`` string into a :class:`~decimal.Decimal`.

    Args:
        value: The raw field value, or ``None``/empty.

    Returns:
        The parsed amount, or ``Decimal("0")`` when missing/unparseable.
    """
    if not value:
        return decimal.Decimal("0")
    try:
        return decimal.Decimal(value)
    except decimal.InvalidOperation:
        return decimal.Decimal("0")


def fetch_building_fine_exposures(bins: list[str]) -> dict[str, FineExposure]:
    """Fetch outstanding fine exposure and open violation count for every BIN in ``bins``, batched.

    Aggregates open violation counts across both **DOB Safety Violations**
    (``855j-jady``, active safety civil penalties) and **DOB ECB Violations**
    (``6bgk-3dad``, positive-balance OATH/ECB monetary summonses). Total balance
    due is calculated from the ECB dataset.

    Args:
        bins: The Building Identification Numbers to query. Duplicates are
            fine. Empty input short-circuits to an empty result with no
            request made.

    Returns:
        A dict keyed by every distinct BIN in ``bins``, each mapped to its
        summed outstanding ECB balance and total open violation count
        across both datasets. A BIN with no violations on file still gets an
        explicit zero/zero entry — that's a normal outcome, not an omission.
    """
    if not bins:
        return {}
    unique_bins = sorted(set(bins))

    # 1. Fetch active DOB Safety Violations (855j-jady) by BIN
    safety_counts = dict.fromkeys(unique_bins, 0)
    safety_where = (
        f"bin in ({_soql_string_list(unique_bins)}) "
        f"AND violation_status = '{_OPEN_VIOLATION_STATUS}'"
    )
    safety_query = urllib.parse.urlencode(
        {"$where": safety_where, "$select": "bin", "$limit": 10000}
    )
    safety_rows = _http_get_json(f"{DOB_VIOLATIONS_URL}?{safety_query}")
    for row in safety_rows:
        bin_value = row.get("bin")
        if bin_value in safety_counts:
            safety_counts[bin_value] += 1

    # 2. Fetch DOB ECB Violations (6bgk-3dad) by BIN
    ecb_where = f"bin in ({_soql_string_list(unique_bins)})"
    ecb_query = urllib.parse.urlencode({"$where": ecb_where, "$limit": 10000})
    ecb_rows = _http_get_json(f"{ECB_VIOLATIONS_URL}?{ecb_query}")

    totals = {bin_value: decimal.Decimal("0") for bin_value in unique_bins}
    ecb_counts = dict.fromkeys(unique_bins, 0)
    for row in ecb_rows:
        bin_value = row.get("bin")
        if bin_value not in totals:
            continue
        balance = _parse_balance_due(row.get("balance_due"))
        if balance > 0:
            totals[bin_value] += balance
            ecb_counts[bin_value] += 1

    return {
        bin_value: FineExposure(
            bin=bin_value,
            total_balance_due=totals[bin_value],
            open_violation_count=safety_counts[bin_value] + ecb_counts[bin_value],
        )
        for bin_value in unique_bins
    }
