"""Tests for the compliance due-date and status calculation engine.

These tests drive the implementation of ``apps.compliance.services`` and
must be written and observed failing before the module exists, per the
project's TDD workflow.
"""

import datetime

import time_machine

from apps.compliance.services import Status, calculate_due_date, calculate_status


class TestCalculateDueDate:
    """Tests for :func:`apps.compliance.services.calculate_due_date`."""

    def test_cat1_adds_one_year(self) -> None:
        """CAT1 inspections are due exactly one year after the last inspection."""
        last_inspection = datetime.date(2025, 3, 15)
        assert calculate_due_date("CAT1", last_inspection) == datetime.date(2026, 3, 15)

    def test_cat5_adds_five_years(self) -> None:
        """CAT5 inspections are due exactly five years after the last inspection."""
        last_inspection = datetime.date(2025, 3, 15)
        assert calculate_due_date("CAT5", last_inspection) == datetime.date(2030, 3, 15)

    def test_cat1_handles_leap_year_feb_29(self) -> None:
        """A CAT1 inspection logged on Feb 29 rolls to Feb 28 the following (non-leap) year.

        ``relativedelta`` (unlike ``timedelta(days=365)``) correctly clamps
        Feb 29 forward by one calendar year to Feb 28 in a non-leap year.
        """
        last_inspection = datetime.date(2024, 2, 29)
        assert calculate_due_date("CAT1", last_inspection) == datetime.date(2025, 2, 28)

    def test_cat5_handles_leap_year_feb_29_lands_on_leap_year(self) -> None:
        """A CAT5 inspection logged on Feb 29 lands on Feb 29 five years later if that year is leap.

        2024 + 5 years = 2029, which is not a leap year, so this should
        clamp to Feb 28, 2029.
        """
        last_inspection = datetime.date(2024, 2, 29)
        assert calculate_due_date("CAT5", last_inspection) == datetime.date(2029, 2, 28)

    def test_invalid_inspection_type_raises(self) -> None:
        """An unrecognized inspection type raises a ValueError."""
        import pytest

        with pytest.raises(ValueError, match="inspection_type"):
            calculate_due_date("CAT3", datetime.date(2025, 1, 1))


class TestCalculateStatus:
    """Tests for :func:`apps.compliance.services.calculate_status`."""

    @time_machine.travel(datetime.date(2026, 1, 1))
    def test_31_days_out_is_compliant(self) -> None:
        """A due date 31 days in the future is Compliant."""
        due_date = datetime.date(2026, 1, 1) + datetime.timedelta(days=31)
        assert calculate_status(due_date) == Status.COMPLIANT

    @time_machine.travel(datetime.date(2026, 1, 1))
    def test_30_days_out_is_warning(self) -> None:
        """A due date exactly 30 days in the future is Warning."""
        due_date = datetime.date(2026, 1, 1) + datetime.timedelta(days=30)
        assert calculate_status(due_date) == Status.WARNING

    @time_machine.travel(datetime.date(2026, 1, 1))
    def test_due_today_is_warning(self) -> None:
        """A due date equal to today is still Warning, not Delinquent."""
        due_date = datetime.date(2026, 1, 1)
        assert calculate_status(due_date) == Status.WARNING

    @time_machine.travel(datetime.date(2026, 1, 1))
    def test_one_day_past_due_is_delinquent(self) -> None:
        """A due date one day in the past is Delinquent."""
        due_date = datetime.date(2026, 1, 1) - datetime.timedelta(days=1)
        assert calculate_status(due_date) == Status.DELINQUENT

    @time_machine.travel(datetime.date(2026, 1, 1))
    def test_far_past_due_is_delinquent(self) -> None:
        """A due date far in the past is Delinquent."""
        due_date = datetime.date(2026, 1, 1) - datetime.timedelta(days=400)
        assert calculate_status(due_date) == Status.DELINQUENT

    def test_explicit_today_argument_overrides_wall_clock(self) -> None:
        """Passing an explicit ``today`` argument is honored over real wall-clock time."""
        due_date = datetime.date(2030, 6, 1)
        today = datetime.date(2030, 6, 1)
        assert calculate_status(due_date, today=today) == Status.WARNING
