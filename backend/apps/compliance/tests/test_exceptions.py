"""Unit tests for the custom DRF exception handler."""

import logging

import pytest
from rest_framework.exceptions import NotFound

from apps.compliance.exceptions import riser_exception_handler


class _FakeView:
    """A stand-in view class, used only for its ``__name__`` in log output."""


class TestRiserExceptionHandler:
    """Tests for :func:`apps.compliance.exceptions.riser_exception_handler`."""

    def test_bare_exception_returns_clean_500_envelope(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """A bare, non-DRF exception produces a structured 500 response and is logged."""
        context = {"view": _FakeView()}

        with caplog.at_level(logging.ERROR):
            response = riser_exception_handler(ValueError("boom"), context)

        assert response is not None
        assert response.status_code == 500
        assert response.data == {
            "error": {
                "code": "internal_error",
                "message": "Something went wrong. Please try again.",
            }
        }

    def test_bare_exception_logs_with_exception_method(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """The handler logs via ``.exception(...)``, naming the offending view class."""
        context = {"view": _FakeView()}

        with caplog.at_level(logging.ERROR):
            riser_exception_handler(ValueError("boom"), context)

        assert any(record.levelno == logging.ERROR for record in caplog.records)
        assert "Unhandled exception in _FakeView" in caplog.text

    def test_api_exception_is_delegated_to_drf_default_handler(self) -> None:
        """A recognized DRF ``APIException`` passes through unchanged, not the 500 envelope."""
        context = {"view": _FakeView()}

        response = riser_exception_handler(NotFound("nope"), context)

        assert response is not None
        assert response.status_code == 404
        assert response.data == {"detail": "nope"}
