"""Tests for the AI risk-narration generator (:mod:`apps.compliance.narration`).

Mirrors the pattern in ``test_dob.py``: a thin, monkeypatchable boundary
function (here, ``_call_claude``) isolates the actual Anthropic SDK call, so
no test ever hits the real network/API.

None of ``apps.compliance.narration`` exists yet (see
``docs/architecture/integration-contracts.md`` §5) — these tests are
pre-written scaffolding and are expected to fail with ``ModuleNotFoundError``
until the module is implemented.
"""

from typing import Any

import pytest

from apps.compliance import narration  # type: ignore[attr-defined]  # not built yet

# Canned ledger-row-shaped entries, matching the LedgerEntrySerializer output
# (id/inspection_type/last_inspection_date omitted here as unnecessary noise
# for these tests; only the fields the contract doc calls out are included).
_ENTRIES = [
    {
        "device_identifier": "EL-3",
        "building_name": "Tower A",
        "due_date": "2026-07-20",
        "status": "Delinquent",
    },
    {
        "device_identifier": "EL-7",
        "building_name": "Tower B",
        "due_date": "2026-08-01",
        "status": "Warning",
    },
]


class TestGenerateNarration:
    """Tests for :func:`apps.compliance.narration.generate_narration`."""

    def test_empty_entries_returns_fixed_string_without_calling_claude(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """An empty portfolio short-circuits locally and never calls Claude."""

        def boom(entries: list[dict[str, Any]]) -> str:
            raise AssertionError("_call_claude must not be called for an empty portfolio")

        monkeypatch.setattr(narration, "_call_claude", boom)
        assert narration.generate_narration([]) == "No elevators tracked yet."

    def test_non_empty_entries_calls_claude_and_returns_its_result(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Non-empty entries are passed to the Claude boundary, whose result passes through."""
        seen: dict[str, Any] = {}

        def fake(entries: list[dict[str, Any]]) -> str:
            seen["entries"] = entries
            return "3 elevators are Delinquent, 2 enter Warning this week."

        monkeypatch.setattr(narration, "_call_claude", fake)
        result = narration.generate_narration(_ENTRIES)

        assert result == "3 elevators are Delinquent, 2 enter Warning this week."
        assert seen["entries"] == _ENTRIES

    def test_claude_failure_raises_narration_unavailable_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A Claude timeout/API error is wrapped in NarrationUnavailableError, not raised raw."""

        def fake(entries: list[dict[str, Any]]) -> str:
            raise RuntimeError("timed out")

        monkeypatch.setattr(narration, "_call_claude", fake)

        with pytest.raises(narration.NarrationUnavailableError):
            narration.generate_narration(_ENTRIES)
