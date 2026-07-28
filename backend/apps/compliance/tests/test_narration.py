"""Tests for the AI risk-narration generator (:mod:`apps.compliance.narration`).

Mirrors the pattern in ``test_dob.py``: a thin, monkeypatchable boundary
function (here, ``_call_claude``) isolates the actual Anthropic SDK call, so
no test ever hits the real network/API.
"""

import dataclasses
from typing import Any

import pytest

from apps.compliance import narration

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

        def boom(
            entries: list[dict[str, Any]], building_fine_exposures: list[dict[str, Any]]
        ) -> str:
            raise AssertionError("_call_claude must not be called for an empty portfolio")

        monkeypatch.setattr(narration, "_call_claude", boom)
        assert narration.generate_narration([]) == "No elevators tracked yet."

    def test_non_empty_entries_calls_claude_and_returns_its_result(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Non-empty entries are passed to the Claude boundary, whose result passes through."""
        seen: dict[str, Any] = {}

        def fake(
            entries: list[dict[str, Any]], building_fine_exposures: list[dict[str, Any]]
        ) -> str:
            seen["entries"] = entries
            seen["building_fine_exposures"] = building_fine_exposures
            return "3 elevators are Delinquent, 2 enter Warning this week."

        monkeypatch.setattr(narration, "_call_claude", fake)
        result = narration.generate_narration(_ENTRIES)

        assert result == "3 elevators are Delinquent, 2 enter Warning this week."
        assert seen["entries"] == _ENTRIES
        # Omitting building_fine_exposures defaults to an empty list, not None.
        assert seen["building_fine_exposures"] == []

    def test_building_fine_exposures_are_passed_through(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A supplied building_fine_exposures list reaches the Claude boundary unchanged."""
        exposures = [
            {"building_name": "Tower A", "total_exposure": "3150.50", "open_violation_count": 2}
        ]
        seen: dict[str, Any] = {}

        def fake(
            entries: list[dict[str, Any]], building_fine_exposures: list[dict[str, Any]]
        ) -> str:
            seen["building_fine_exposures"] = building_fine_exposures
            return "briefing"

        monkeypatch.setattr(narration, "_call_claude", fake)
        narration.generate_narration(_ENTRIES, exposures)

        assert seen["building_fine_exposures"] == exposures

    def test_claude_failure_raises_narration_unavailable_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A Claude timeout/API error is wrapped in NarrationUnavailableError, not raised raw."""

        def fake(
            entries: list[dict[str, Any]], building_fine_exposures: list[dict[str, Any]]
        ) -> str:
            raise RuntimeError("timed out")

        monkeypatch.setattr(narration, "_call_claude", fake)

        with pytest.raises(narration.NarrationUnavailableError):
            narration.generate_narration(_ENTRIES)


@dataclasses.dataclass
class _FakeMessage:
    """A minimal stand-in for an Anthropic SDK ``Message`` response."""

    content: list[Any]


class TestCallClaude:
    """Tests for the Anthropic SDK boundary :func:`apps.compliance.narration._call_claude`.

    Mirrors ``test_dob.py``'s ``TestHttpGetJson``: mocks the SDK client
    itself (``anthropic.Anthropic``) so the request-building and
    response-parsing logic is exercised without ever hitting the network.
    Real ``anthropic.types`` content-block instances are used (rather than
    hand-rolled fakes) so the ``isinstance(..., TextBlock)`` filtering in
    ``_call_claude`` is exercised against the real discriminated union.
    """

    def test_builds_request_and_extracts_text(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """The client is called with the tuned model params, and text blocks are joined."""
        captured: dict[str, Any] = {}

        class FakeMessages:
            def create(self, **kwargs: Any) -> _FakeMessage:
                captured["create_kwargs"] = kwargs
                return _FakeMessage(
                    content=[
                        narration.anthropic.types.TextBlock(
                            type="text", text="3 elevators are Delinquent, "
                        ),
                        narration.anthropic.types.TextBlock(
                            type="text", text="2 enter Warning this week."
                        ),
                    ]
                )

        class FakeAnthropic:
            def __init__(self, **kwargs: Any) -> None:
                captured["client_kwargs"] = kwargs
                self.messages = FakeMessages()

        monkeypatch.setattr(narration.anthropic, "Anthropic", FakeAnthropic)

        result = narration._call_claude(_ENTRIES, [])

        assert result == "3 elevators are Delinquent, 2 enter Warning this week."
        assert captured["create_kwargs"]["model"] == narration.NARRATION_MODEL
        assert captured["create_kwargs"]["temperature"] == narration.NARRATION_TEMPERATURE
        assert captured["create_kwargs"]["max_tokens"] == narration.NARRATION_MAX_TOKENS
        assert captured["client_kwargs"]["timeout"] == narration.NARRATION_TIMEOUT_SECONDS

    def test_includes_building_fine_exposure_in_the_prompt_content(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The building-level exposure payload reaches the Messages API content."""
        captured: dict[str, Any] = {}

        class FakeMessages:
            def create(self, **kwargs: Any) -> _FakeMessage:
                captured["create_kwargs"] = kwargs
                return _FakeMessage(
                    content=[narration.anthropic.types.TextBlock(type="text", text="briefing")]
                )

        class FakeAnthropic:
            def __init__(self, **kwargs: Any) -> None:
                self.messages = FakeMessages()

        monkeypatch.setattr(narration.anthropic, "Anthropic", FakeAnthropic)

        exposures = [
            {"building_name": "Tower A", "total_exposure": "3150.50", "open_violation_count": 2}
        ]
        narration._call_claude(_ENTRIES, exposures)

        content = captured["create_kwargs"]["messages"][0]["content"]
        assert "3150.50" in content
        assert "Tower A" in content

    def test_ignores_non_text_blocks(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Non-text content blocks (if any) are skipped rather than erroring."""

        class FakeMessages:
            def create(self, **kwargs: Any) -> _FakeMessage:
                return _FakeMessage(
                    content=[
                        narration.anthropic.types.ToolUseBlock(
                            id="toolu_1", input={}, name="ignored", type="tool_use"
                        ),
                        narration.anthropic.types.TextBlock(type="text", text="only this counts"),
                    ]
                )

        class FakeAnthropic:
            def __init__(self, **kwargs: Any) -> None:
                self.messages = FakeMessages()

        monkeypatch.setattr(narration.anthropic, "Anthropic", FakeAnthropic)

        assert narration._call_claude(_ENTRIES, []) == "only this counts"
