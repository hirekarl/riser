"""AI risk-narration generator for the compliance ledger.

Turns the already-computed ledger rows (status, due date, building name,
device identifier — see :mod:`apps.compliance.services` and
``LedgerEntrySerializer``) into a short, prioritized, human-readable
briefing via a single-turn call to the Anthropic Messages API. See
``docs/architecture/integration-contracts.md`` §5 for the full contract.

The actual network call is isolated behind :func:`_call_claude` so tests
can monkeypatch it and never hit the real Anthropic API, matching the
boundary-function convention already used for the DOB/GeoSearch lookups
in :mod:`apps.compliance.dob`.
"""

import os
from typing import Any

# Re-exported (rather than a plain `import anthropic`) so tests can
# monkeypatch `narration.anthropic.Anthropic` as the SDK client boundary.
import anthropic as anthropic

#: Model used for narration generation. Chosen for low latency/cost, since
#: this is called synchronously, on-demand, during a live demo.
NARRATION_MODEL = "claude-haiku-4-5-20251001"

#: Maximum tokens to generate. The narration is meant to be a short,
#: skimmable briefing, not an essay.
NARRATION_MAX_TOKENS = 300

#: Low temperature to reduce (not eliminate) output variance — this feeds
#: a live demo, where a consistent, predictable narration matters more
#: than creative phrasing.
NARRATION_TEMPERATURE = 0.2

#: How long to wait on the Anthropic API before giving up, in seconds.
NARRATION_TIMEOUT_SECONDS = 15.0

#: Fixed narration returned for an empty portfolio, without ever calling
#: the Claude API — there is nothing to narrate, so a model call would be
#: pure waste.
EMPTY_PORTFOLIO_NARRATION = "No elevators tracked yet."

_SYSTEM_PROMPT = (
    "You are a compliance risk briefing assistant for a commercial property "
    "manager overseeing elevator inspections in New York City. Given a list "
    "of elevators with their current compliance status, due date, building "
    "name, device identifier, and whether they have an open DOB safety "
    "violation on file (has_open_violation), write a short (2-4 sentence) "
    "prioritized briefing highlighting the most urgent items first. Call "
    "out elevators with has_open_violation true explicitly — an open "
    "violation on a Warning/Delinquent elevator carries real fine exposure "
    "and should be flagged with more urgency than a same-status elevator "
    "without one. You may also receive a separate list of buildings with "
    "their total outstanding DOB fine exposure in dollars and open "
    "violation count (building_fine_exposure) — when a building in that "
    "list has a nonzero total_exposure, cite the actual dollar figure for "
    "that building in the briefing rather than speaking only in general "
    "terms. Only cite a dollar figure for a building that appears in "
    "building_fine_exposure; never estimate or invent one. Be direct and "
    "specific, naming buildings and device identifiers where useful. Do "
    "not use markdown formatting."
)


class NarrationUnavailableError(RuntimeError):
    """Raised when the Claude API call underlying narration fails or times out."""


def _call_claude(
    entries: list[dict[str, Any]], building_fine_exposures: list[dict[str, Any]]
) -> str:
    """Call the Anthropic Messages API to narrate the given ledger entries.

    This is the sole network boundary for narration generation, isolated
    so tests can monkeypatch it instead of hitting the real API.

    Args:
        entries: Ledger rows (as produced by ``LedgerEntrySerializer``),
            each expected to carry ``device_identifier``, ``building_name``,
            ``due_date``, ``status``, and ``has_open_violation``.
        building_fine_exposures: Building-level dollar exposure rows (issue
            #120 follow-up), each expected to carry ``building_name``,
            ``total_exposure``, and ``open_violation_count``. May be empty.

    Returns:
        The generated narration text.

    Raises:
        anthropic.APIError: If the underlying SDK call fails.
        anthropic.APIConnectionError: If the request cannot be completed
            (including on timeout).
    """
    client = anthropic.Anthropic(
        api_key=os.environ.get("ANTHROPIC_API_KEY"),
        timeout=NARRATION_TIMEOUT_SECONDS,
    )
    payload = {"elevators": entries, "building_fine_exposure": building_fine_exposures}
    message = client.messages.create(
        model=NARRATION_MODEL,
        max_tokens=NARRATION_MAX_TOKENS,
        temperature=NARRATION_TEMPERATURE,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": str(payload)}],
    )
    return "".join(
        block.text for block in message.content if isinstance(block, anthropic.types.TextBlock)
    )


def generate_narration(
    entries: list[dict[str, Any]],
    building_fine_exposures: list[dict[str, Any]] | None = None,
) -> str:
    """Generate a prioritized risk narration for the given ledger entries.

    Args:
        entries: Ledger rows (as produced by ``LedgerEntrySerializer``).
            An empty list short-circuits locally and never calls Claude.
        building_fine_exposures: Building-level dollar exposure rows (issue
            #120 follow-up), for buildings represented in ``entries``.
            Defaults to an empty list when omitted.

    Returns:
        The narration text: a fixed string for an empty portfolio, or
        Claude's generated briefing otherwise.

    Raises:
        NarrationUnavailableError: If the underlying Claude API call fails
            or times out.
    """
    if not entries:
        return EMPTY_PORTFOLIO_NARRATION
    try:
        return _call_claude(entries, building_fine_exposures or [])
    except Exception as exc:
        raise NarrationUnavailableError(f"Claude narration call failed: {exc}") from exc
