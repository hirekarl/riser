"""Tests for the DOB address→BIN→devices resolver (:mod:`apps.compliance.dob`).

No test hits the network: the thin :func:`_http_get_json` boundary is
monkeypatched to return canned payloads whose shapes were captured from
the live GeoSearch v2 and DOB ``e5aq-a4j2`` responses, so the parsing is
exercised against real-world data without flakiness.
"""

import datetime
from typing import Any

import pytest

from apps.compliance import dob

# Shape captured live from GeoSearch v2 for an ambiguous "200 Water St":
# two real matches (different boroughs → different BINs) plus a feature
# with no BIN, which must be filtered out.
_GEOSEARCH_PAYLOAD = {
    "features": [
        {
            "properties": {
                "label": "200 WATER STREET, New York, NY, USA",
                "borough": "Manhattan",
                "addendum": {"pad": {"bin": "1001163"}},
            }
        },
        {
            "properties": {
                "label": "200 WATER STREET, Brooklyn, NY, USA",
                "borough": "Brooklyn",
                "addendum": {"pad": {"bin": "3000094"}},
            }
        },
        {"properties": {"label": "NOWHERE, NY, USA", "borough": "Queens"}},
    ]
}

# Shape captured live from e5aq-a4j2 for BIN 1001026 (120 Broadway).
_DOB_ROWS = [
    {
        "device_number": "1P766",
        "device_type": "Elevator",
        "device_status": "Active",
        "cat1_latest_report_filed": "2026-02-04T00:00:00.000",
        "cat5_latest_report_filed": "2024-01-15T00:00:00.000",
        "house_number": "108",
        "street_name": "BROADWAY",
        "bin": "1001026",
    },
    {
        "device_number": "1P767",
        "device_type": "Elevator",
        "device_status": "Active",
        "cat1_latest_report_filed": "",  # missing filing date → None
        "house_number": "108",
        "street_name": "BROADWAY",
        "bin": "1001026",
    },
]


class TestResolveAddress:
    """Tests for :func:`apps.compliance.dob.resolve_address`."""

    def test_parses_matches_and_filters_binless(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Each BIN-bearing feature becomes a match; BIN-less features are dropped."""
        monkeypatch.setattr(dob, "_http_get_json", lambda url: _GEOSEARCH_PAYLOAD)
        matches = dob.resolve_address("200 Water St")
        assert [m.bin for m in matches] == ["1001163", "3000094"]
        assert matches[0].borough == "Manhattan"
        assert matches[0].label.startswith("200 WATER STREET")

    def test_sends_text_and_size(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """The typed address and size are passed through as query params."""
        seen: dict[str, str] = {}

        def fake(url: str) -> dict[str, Any]:
            seen["url"] = url
            return {"features": []}

        monkeypatch.setattr(dob, "_http_get_json", fake)
        dob.resolve_address("120 Broadway", size=3)
        assert "text=120+Broadway" in seen["url"]
        assert "size=3" in seen["url"]

    def test_empty_when_no_features(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """No features yields no matches, not an error."""
        monkeypatch.setattr(dob, "_http_get_json", lambda url: {"features": []})
        assert dob.resolve_address("nowhere at all") == []


class TestIsAmbiguous:
    """Tests for :func:`apps.compliance.dob.is_ambiguous`."""

    def test_multiple_distinct_bins_is_ambiguous(self) -> None:
        """Matches spanning more than one BIN require disambiguation."""
        matches = [
            dob.AddressMatch("A", "Manhattan", "1001163"),
            dob.AddressMatch("B", "Brooklyn", "3000094"),
        ]
        assert dob.is_ambiguous(matches) is True

    def test_single_bin_is_not_ambiguous(self) -> None:
        """A single distinct BIN (even across label variants) is unambiguous."""
        matches = [
            dob.AddressMatch("A", "Manhattan", "1001163"),
            dob.AddressMatch("A alt", "Manhattan", "1001163"),
        ]
        assert dob.is_ambiguous(matches) is False

    def test_empty_is_not_ambiguous(self) -> None:
        """No matches is not ambiguous."""
        assert dob.is_ambiguous([]) is False


class TestFetchDevices:
    """Tests for :func:`apps.compliance.dob.fetch_devices`."""

    def test_parses_devices_and_dates(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Device rows are normalized, with DOB timestamps parsed to dates."""
        monkeypatch.setattr(dob, "_http_get_json", lambda url: _DOB_ROWS)
        devices = dob.fetch_devices("1001026")
        assert len(devices) == 2
        first = devices[0]
        assert first.device_number == "1P766"
        assert first.device_status == "Active"
        assert first.cat1_latest_report_filed == datetime.date(2026, 2, 4)
        assert first.cat5_latest_report_filed == datetime.date(2024, 1, 15)
        # Second device is missing its CAT1 date and has no CAT5 key at all.
        assert devices[1].cat1_latest_report_filed is None
        assert devices[1].cat5_latest_report_filed is None

    def test_queries_by_bin(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """The BIN is passed as a Socrata filter."""
        seen: dict[str, str] = {}
        monkeypatch.setattr(dob, "_http_get_json", lambda url: seen.update(url=url) or [])
        dob.fetch_devices("1001026")
        assert "bin=1001026" in seen["url"]


class TestMapDobDevicesToDrafts:
    """Tests for :func:`apps.compliance.dob.map_dob_devices_to_drafts`."""

    def test_both_dates_populated_yields_two_drafts(self) -> None:
        """A device with both CAT1 and CAT5 dates yields one draft each."""
        device = dob.DobDevice(
            device_number="1P766",
            device_type="Elevator",
            device_status="Active",
            cat1_latest_report_filed=datetime.date(2026, 2, 4),
            cat5_latest_report_filed=datetime.date(2024, 1, 15),
            house_number="108",
            street_name="BROADWAY",
            bin="1001026",
        )
        drafts = dob.map_dob_devices_to_drafts([device])
        assert len(drafts) == 2
        assert drafts[0] == dob.ElevatorDraft(
            dob_device_number="1P766",
            device_status="Active",
            inspection_type="CAT1",
            last_inspection_date=datetime.date(2026, 2, 4),
        )
        assert drafts[1] == dob.ElevatorDraft(
            dob_device_number="1P766",
            device_status="Active",
            inspection_type="CAT5",
            last_inspection_date=datetime.date(2024, 1, 15),
        )

    def test_one_date_populated_yields_one_draft(self) -> None:
        """A device with only a CAT1 date yields a single CAT1 draft."""
        device = dob.DobDevice(
            device_number="1P767",
            device_type="Elevator",
            device_status="Active",
            cat1_latest_report_filed=datetime.date(2026, 2, 4),
            cat5_latest_report_filed=None,
            house_number="108",
            street_name="BROADWAY",
            bin="1001026",
        )
        drafts = dob.map_dob_devices_to_drafts([device])
        assert drafts == [
            dob.ElevatorDraft(
                dob_device_number="1P767",
                device_status="Active",
                inspection_type="CAT1",
                last_inspection_date=datetime.date(2026, 2, 4),
            )
        ]

    def test_neither_date_populated_yields_no_drafts(self) -> None:
        """A device with neither date populated yields no drafts."""
        device = dob.DobDevice(
            device_number="1P768",
            device_type="Elevator",
            device_status="Active",
            cat1_latest_report_filed=None,
            cat5_latest_report_filed=None,
            house_number="108",
            street_name="BROADWAY",
            bin="1001026",
        )
        assert dob.map_dob_devices_to_drafts([device]) == []

    def test_multiple_devices_flattened(self) -> None:
        """Drafts from multiple devices are flattened into a single list."""
        device_a = dob.DobDevice(
            device_number="A",
            device_type="Elevator",
            device_status="Active",
            cat1_latest_report_filed=datetime.date(2026, 1, 1),
            cat5_latest_report_filed=None,
            house_number="1",
            street_name="A ST",
            bin="1",
        )
        device_b = dob.DobDevice(
            device_number="B",
            device_type="Elevator",
            device_status="Active",
            cat1_latest_report_filed=None,
            cat5_latest_report_filed=datetime.date(2020, 1, 1),
            house_number="2",
            street_name="B ST",
            bin="1",
        )
        drafts = dob.map_dob_devices_to_drafts([device_a, device_b])
        assert [d.dob_device_number for d in drafts] == ["A", "B"]

    def test_inactive_devices_are_omitted(self) -> None:
        """Non-active devices (e.g. Inactive, Dismantled) produce no drafts."""
        inactive_device = dob.DobDevice(
            device_number="INACT1",
            device_type="Elevator",
            device_status="Inactive",
            cat1_latest_report_filed=datetime.date(2026, 1, 1),
            cat5_latest_report_filed=datetime.date(2020, 1, 1),
            house_number="1",
            street_name="MAIN ST",
            bin="1001026",
        )
        dismantled_device = dob.DobDevice(
            device_number="DISM1",
            device_type="Elevator",
            device_status="Dismantled",
            cat1_latest_report_filed=datetime.date(2025, 1, 1),
            cat5_latest_report_filed=None,
            house_number="1",
            street_name="MAIN ST",
            bin="1001026",
        )
        active_device = dob.DobDevice(
            device_number="ACT1",
            device_type="Elevator",
            device_status="Active",
            cat1_latest_report_filed=datetime.date(2026, 2, 1),
            cat5_latest_report_filed=None,
            house_number="1",
            street_name="MAIN ST",
            bin="1001026",
        )
        drafts = dob.map_dob_devices_to_drafts([inactive_device, dismantled_device, active_device])
        assert len(drafts) == 1
        assert drafts[0].dob_device_number == "ACT1"


class TestParseDobDate:
    """Tests for the internal date parser."""

    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            ("2026-02-04T00:00:00.000", datetime.date(2026, 2, 4)),
            ("2024-01-15", datetime.date(2024, 1, 15)),
            (None, None),
            ("", None),
        ],
    )
    def test_parse(self, value: str | None, expected: datetime.date | None) -> None:
        """DOB timestamps and empty values parse as expected."""
        assert dob._parse_dob_date(value) == expected


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
    """Tests for the network boundary :func:`apps.compliance.dob._http_get_json`."""

    def test_success(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A 200 with a JSON body is decoded."""
        monkeypatch.setattr(
            "urllib.request.urlopen",
            lambda url, timeout: _FakeResponse(b'{"ok": true}'),
        )
        assert dob._http_get_json("https://example.test/x") == {"ok": True}

    def test_network_error_becomes_dob_lookup_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A transport failure is wrapped in DobLookupError."""

        def boom(url: str, timeout: int) -> None:
            raise OSError("connection refused")

        monkeypatch.setattr("urllib.request.urlopen", boom)
        with pytest.raises(dob.DobLookupError):
            dob._http_get_json("https://example.test/x")
