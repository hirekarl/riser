"""Core compliance-risk calculation engine.

This module is the deterministic heart of Riser's value proposition: it
turns an elevator's last inspection date and inspection type into a
statutory due date, and turns that due date (compared against "today")
into a triage :class:`Status`. Due dates and statuses are always computed
on the fly from stored data rather than persisted, so an edit to a last
inspection date is reflected immediately with no staleness.
"""

import datetime
import enum

from dateutil.relativedelta import relativedelta

#: Number of days before (and including) the due date during which an
#: elevator is considered "Warning" rather than "Compliant".
WARNING_WINDOW_DAYS = 30

#: Mapping of inspection type code to the number of years after the last
#: inspection date at which the next inspection of that type is due.
_INTERVAL_YEARS = {
    "CAT1": 1,
    "CAT5": 5,
}


class Status(enum.Enum):
    """Compliance risk tier for an elevator, ranked from most to least urgent."""

    DELINQUENT = "Delinquent"
    WARNING = "Warning"
    COMPLIANT = "Compliant"


def calculate_due_date(inspection_type: str, last_inspection_date: datetime.date) -> datetime.date:
    """Calculate the next statutory inspection due date.

    Args:
        inspection_type: The NYC DOB inspection category code, either
            ``"CAT1"`` (annual) or ``"CAT5"`` (five-year).
        last_inspection_date: The date the most recent inspection of this
            type was performed.

    Returns:
        The date by which the next inspection of this type is due.

    Raises:
        ValueError: If ``inspection_type`` is not a recognized code.
    """
    try:
        years = _INTERVAL_YEARS[inspection_type]
    except KeyError:
        valid = ", ".join(sorted(_INTERVAL_YEARS))
        raise ValueError(
            f"Unrecognized inspection_type {inspection_type!r}; expected one of: {valid}"
        ) from None
    return last_inspection_date + relativedelta(years=years)


def calculate_status(due_date: datetime.date, today: datetime.date | None = None) -> Status:
    """Calculate the compliance status for a given due date.

    Args:
        due_date: The calculated statutory inspection due date.
        today: The date to treat as "now". Defaults to the real current
            date (``datetime.date.today()``) when omitted; tests should
            pass this explicitly (or freeze time with ``time-machine``)
            rather than relying on wall-clock time.

    Returns:
        ``Status.DELINQUENT`` if ``due_date`` has already passed,
        ``Status.WARNING`` if it falls today or within the next
        :data:`WARNING_WINDOW_DAYS` days (inclusive), otherwise
        ``Status.COMPLIANT``.
    """
    if today is None:
        today = datetime.date.today()
    days_until_due = (due_date - today).days
    if days_until_due < 0:
        return Status.DELINQUENT
    if days_until_due <= WARNING_WINDOW_DAYS:
        return Status.WARNING
    return Status.COMPLIANT
