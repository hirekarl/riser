"""Tests for the DOB/ECB violations lookups (:mod:`apps.compliance.violations`).

No test hits the network: the thin ``_http_get_json`` boundary is
monkeypatched to return canned payloads shaped like the real ``855j-jady``
and ``6bgk-3dad`` Socrata resources, mirroring the pattern in
``test_dob.py``.
"""

import decimal
from typing import Any

import pytest

from apps.compliance import violations


class TestFetchOpenDeviceNumbers:
    """Tests for :func:`apps.compliance.violations.fetch_open_device_numbers`."""

    def test_empty_input_short_circuits(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """No device numbers means no request and an empty result."""

        def boom(url: str) -> None:
            raise AssertionError("should not be called")

        monkeypatch.setattr(violations, "_http_get_json", boom)
        assert violations.fetch_open_device_numbers([]) == set()

    def test_returns_only_devices_with_active_violations(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Only device numbers present in the response are returned."""
        monkeypatch.setattr(
            violations,
            "_http_get_json",
            lambda url: [{"device_number": "1P766"}, {"device_number": "1P900"}],
        )
        result = violations.fetch_open_device_numbers(["1P766", "1P767", "1P900"])
        assert result == {"1P766", "1P900"}

    def test_filters_by_active_status_and_device_numbers(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The SoQL $where clause scopes by device number and Active status."""
        seen: dict[str, str] = {}

        def fake(url: str) -> list[Any]:
            seen["url"] = url
            return []

        monkeypatch.setattr(violations, "_http_get_json", fake)
        violations.fetch_open_device_numbers(["1P766", "1P767"])
        assert "device_number+in" in seen["url"] or "device_number in" in seen["url"].replace(
            "%20", " "
        )
        assert "violation_status" in seen["url"]
        assert "Active" in urllib_unquote(seen["url"])

    def test_rows_missing_device_number_are_skipped(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A malformed row with no device_number doesn't crash or appear in results."""
        monkeypatch.setattr(violations, "_http_get_json", lambda url: [{"device_number": ""}, {}])
        assert violations.fetch_open_device_numbers(["1P766"]) == set()


def urllib_unquote(url: str) -> str:
    """Small local helper to avoid importing urllib.parse.unquote at module scope twice."""
    import urllib.parse

    return urllib.parse.unquote_plus(url)


class TestSoqlStringList:
    """Tests for the internal SoQL literal-list renderer."""

    def test_renders_quoted_comma_separated_list(self) -> None:
        """Values are single-quoted and comma-joined."""
        assert violations._soql_string_list(["A", "B"]) == "'A','B'"

    def test_escapes_embedded_single_quotes(self) -> None:
        """An embedded single quote is doubled per SoQL string literal rules."""
        assert violations._soql_string_list(["O'Brien"]) == "'O''Brien'"


class TestParseBalanceDue:
    """Tests for the internal balance_due parser."""

    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            ("1500.00", decimal.Decimal("1500.00")),
            (None, decimal.Decimal("0")),
            ("", decimal.Decimal("0")),
            ("not-a-number", decimal.Decimal("0")),
        ],
    )
    def test_parse(self, value: str | None, expected: decimal.Decimal) -> None:
        """Numeric strings parse to Decimal; missing/garbage values become zero."""
        assert violations._parse_balance_due(value) == expected


class TestFetchBuildingFineExposures:
    """Tests for :func:`apps.compliance.violations.fetch_building_fine_exposures`."""

    def test_empty_input_short_circuits(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """No BINs means no request and an empty result."""

        def boom(url: str) -> None:
            raise AssertionError("should not be called")

        monkeypatch.setattr(violations, "_http_get_json", boom)
        assert violations.fetch_building_fine_exposures([]) == {}

    def test_sums_only_positive_balances_and_combines_safety_violations(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Safety violations from 855j-jady and positive-balance ECB violations are aggregated."""

        def fake_get_json(url: str) -> list[dict[str, Any]]:
            if violations.DOB_VIOLATIONS_URL in url:
                return [
                    {"bin": "1001026"},
                    {"bin": "1001026"},
                ]
            if violations.ECB_VIOLATIONS_URL in url:
                return [
                    {"bin": "1001026", "balance_due": "3000.00"},
                    {"bin": "1001026", "balance_due": "0.00"},
                    {"bin": "1001026", "balance_due": "150.50"},
                    {"bin": "2000094", "balance_due": "500.00"},
                ]
            return []

        monkeypatch.setattr(violations, "_http_get_json", fake_get_json)
        exposures = violations.fetch_building_fine_exposures(["1001026", "2000094"])

        assert exposures["1001026"].total_balance_due == decimal.Decimal("3150.50")
        assert exposures["1001026"].open_violation_count == 4  # 2 safety + 2 ECB positive balance
        assert exposures["2000094"].total_balance_due == decimal.Decimal("500.00")
        assert exposures["2000094"].open_violation_count == 1  # 0 safety + 1 ECB positive balance

    def test_bin_with_no_rows_gets_explicit_zero_entry(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A BIN with nothing in either response still gets a zero/zero entry, not an omission."""
        monkeypatch.setattr(violations, "_http_get_json", lambda url: [])
        exposures = violations.fetch_building_fine_exposures(["1001026"])

        assert exposures.keys() == {"1001026"}
        assert exposures["1001026"].total_balance_due == decimal.Decimal("0")
        assert exposures["1001026"].open_violation_count == 0

    def test_rows_for_unrequested_bins_are_ignored(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A row for a bin outside the requested set doesn't leak into the result."""

        def fake_get_json(url: str) -> list[dict[str, Any]]:
            if violations.ECB_VIOLATIONS_URL in url:
                return [{"bin": "9999999", "balance_due": "1000.00"}]
            if violations.DOB_VIOLATIONS_URL in url:
                return [{"bin": "9999999"}]
            return []

        monkeypatch.setattr(violations, "_http_get_json", fake_get_json)
        exposures = violations.fetch_building_fine_exposures(["1001026"])

        assert exposures.keys() == {"1001026"}
        assert exposures["1001026"].total_balance_due == decimal.Decimal("0")
        assert exposures["1001026"].open_violation_count == 0

    def test_duplicate_bins_are_deduped(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Passing the same BIN twice doesn't double-count or duplicate the request filter."""
        seen: list[str] = []

        def fake(url: str) -> list[Any]:
            seen.append(url)
            return []

        monkeypatch.setattr(violations, "_http_get_json", fake)
        exposures = violations.fetch_building_fine_exposures(["1001026", "1001026"])

        assert exposures.keys() == {"1001026"}
        assert len(seen) == 2  # one call per endpoint
        for url in seen:
            assert url.count("1001026") == 1

    def test_queries_with_bin_in_filter(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """The BINs are passed as a SoQL 'in (...)' filter to both endpoints."""
        seen: list[str] = []

        def fake(url: str) -> list[Any]:
            seen.append(url)
            return []

        monkeypatch.setattr(violations, "_http_get_json", fake)
        violations.fetch_building_fine_exposures(["1001026", "2000094"])
        assert len(seen) == 2
        for url in seen:
            assert "bin+in" in url or "bin in" in url.replace("%20", " ")

    def test_malformed_balance_is_ignored(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A row with an unparseable balance contributes zero, not a crash."""

        def fake_get_json(url: str) -> list[dict[str, Any]]:
            if violations.ECB_VIOLATIONS_URL in url:
                return [{"bin": "1001026", "balance_due": "garbage"}]
            return []

        monkeypatch.setattr(violations, "_http_get_json", fake_get_json)
        exposures = violations.fetch_building_fine_exposures(["1001026"])
        assert exposures["1001026"].total_balance_due == decimal.Decimal("0")
        assert exposures["1001026"].open_violation_count == 0


class _FakeResponse:
    """Minimal context-manager stand-in for an ``http.client`` response."""

    def __init__(self, body: bytes) -> None:
        self._body = body

    def read(self) -> bytes:
        """Return the canned body bytes."""
        return self._body

    def __enter__(self) -> "_FakeResponse":  # noqa: UP037
        """Enter the context, returning self."""
        return self

    def __exit__(self, *args: object) -> None:
        """Exit the context without suppressing exceptions."""
        return None


class TestHttpGetJson:
    """Tests for the network boundary :func:`apps.compliance.violations._http_get_json`."""

    def test_success(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A 200 with a JSON body is decoded."""
        monkeypatch.setattr(
            "urllib.request.urlopen",
            lambda url, timeout: _FakeResponse(b"[]"),
        )
        assert violations._http_get_json("https://example.test/x") == []

    def test_network_error_becomes_violations_lookup_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A transport failure is wrapped in ViolationsLookupError."""

        def boom(url: str, timeout: int) -> None:
            raise OSError("connection refused")

        monkeypatch.setattr("urllib.request.urlopen", boom)
        with pytest.raises(violations.ViolationsLookupError):
            violations._http_get_json("https://example.test/x")
