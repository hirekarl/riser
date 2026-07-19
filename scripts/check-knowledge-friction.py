#!/usr/bin/env python3
"""Stop hook: nudge Claude to capture tooling friction in .knowledge-base/.

Reads the Stop-hook JSON payload from stdin. If this turn's recent
transcript activity shows an error-like signal co-located with a mention of
one of this project's toolchain topics, emits the Stop-hook block protocol
so Claude continues once and records the learning in
`.knowledge-base/<topic>/overview.md` before actually stopping.

Friction must come from *observed execution output* (a Bash tool result) or
a real user-typed message — not from Claude's own prose, thinking, or the
contents of a file it merely read (Read/Grep/Glob results). Source code
routinely contains both a package import like `from "react"` and an unrelated
`error` variable/comment; treating that co-occurrence as "friction" produces
false positives. The error and topic mentions must also fall within
PROXIMITY_CHARS of each other in the same blob, so an unrelated match deep in
a large command output doesn't count.

Critical safeguard: `stop_hook_active` is checked first and short-circuits
to a silent, always-allow exit — this is what prevents an infinite
stop-block loop. Never remove or reorder that check.

Uses only the standard library so it works even before `uv sync` has run.
"""

import json
import re
import sys
from typing import Any, Match

TOPIC_DIR = {
    "django": "django",
    "drf": "drf",
    "djangorestframework": "drf",
    "react": "react",
    "typescript": "typescript",
    "vite": "vite",
    "vitest": "vitest",
    "uv": "uv",
    "ruff": "ruff",
    "mypy": "mypy-and-ty",
    "ty": "mypy-and-ty",
    "pytest": "pytest",
    "eslint": "eslint",
    "playwright": "playwright",
    "pre-commit": "pre-commit",
    "commitizen": "commitizen",
    "render": "render",
    "github actions": "github-actions",
    "github-actions": "github-actions",
}

ERROR_RE = re.compile(
    r"\b(error|fail(ed|ure)?|traceback|exception|fatal|not found|"
    r"cannot find|denied|non-zero exit|exit code [1-9]|enoent|"
    r"cannot|unable to)\b",
    re.IGNORECASE,
)
TOPIC_RE = re.compile(
    r"\b(" + "|".join(re.escape(t) for t in TOPIC_DIR) + r")\b",
    re.IGNORECASE,
)

WINDOW = 200  # most recent transcript lines to inspect
PROXIMITY_CHARS = 200  # max distance between an error match and a topic match

#: Tool results only count as friction evidence when they come from one of
#: these tools — i.e. something that actually executes and can fail.
#: Read/Grep/Glob/Write/Edit results are file contents or search hits, not
#: pass/fail signals, so they're deliberately excluded.
EXECUTION_TOOLS = {"Bash"}


def _tool_use_names(entries: list[dict[str, Any]]) -> dict[str, str]:
    """Map each tool_use id in the window to the tool name that issued it."""
    names: dict[str, str] = {}
    for entry in entries:
        message = entry.get("message", entry)
        if not isinstance(message, dict) or message.get("role") != "assistant":
            continue
        content = message.get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if (
                isinstance(block, dict)
                and block.get("type") == "tool_use"
                and isinstance(block.get("id"), str)
                and isinstance(block.get("name"), str)
            ):
                names[block["id"]] = block["name"]
    return names


def extract_friction_text(entry: dict[str, Any], tool_names: dict[str, str]) -> str:
    """Flatten an entry to text, but only the parts that are valid friction
    evidence: real user-typed messages, or Bash tool results. Assistant
    prose/thinking and non-execution tool results (Read, Grep, ...) are
    excluded so they can't be mistaken for observed failures.
    """
    message = entry.get("message", entry)
    if not isinstance(message, dict) or message.get("role") != "user":
        return ""

    content = message.get("content")
    parts: list[str] = []

    if isinstance(content, str):
        # A plain user-typed message (e.g. pasting a real error) is valid signal.
        parts.append(content)
    elif isinstance(content, list):
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "tool_result":
                tool_use_id = block.get("tool_use_id")
                if (
                    isinstance(tool_use_id, str)
                    and tool_names.get(tool_use_id) not in EXECUTION_TOOLS
                ):
                    continue
                value = block.get("content")
                if isinstance(value, str):
                    parts.append(value)
                elif isinstance(value, list):
                    for sub in value:
                        if isinstance(sub, dict) and isinstance(sub.get("text"), str):
                            parts.append(sub["text"])
            elif block.get("type") == "text" and isinstance(block.get("text"), str):
                # Plain text block in a user-role message: real user input.
                parts.append(block["text"])

    return " ".join(parts)


def find_colocated_match(text: str) -> Match[str] | None:
    """Return the topic match if an error word and a topic word both appear
    within PROXIMITY_CHARS of each other in text, else None.
    """
    error_matches = list(ERROR_RE.finditer(text))
    if not error_matches:
        return None
    for topic_match in TOPIC_RE.finditer(text):
        for error_match in error_matches:
            if abs(topic_match.start() - error_match.start()) <= PROXIMITY_CHARS:
                return topic_match
    return None


def main() -> int:
    """Entry point: read stdin payload, decide whether to block once."""
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0

    # Critical one-shot safeguard: never block twice in a row on the same
    # stop. Must be checked before any transcript work.
    if payload.get("stop_hook_active"):
        return 0

    transcript_path = payload.get("transcript_path")
    if not transcript_path:
        return 0

    try:
        with open(transcript_path, encoding="utf-8") as fh:
            lines = fh.readlines()[-WINDOW:]
    except OSError:
        return 0

    entries: list[dict[str, Any]] = []
    for line in lines:
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            continue

    tool_names = _tool_use_names(entries)

    for entry in reversed(entries):
        text = extract_friction_text(entry, tool_names)
        if not text:
            continue
        match = find_colocated_match(text)
        if not match:
            continue
        topic = TOPIC_DIR[match.group(0).lower()]
        reason = (
            f"Before stopping: this turn appears to have hit friction "
            f"involving '{topic}'. Add or update "
            f".knowledge-base/{topic}/overview.md with the gotcha and how "
            f"it was resolved (or confirm it's already documented), "
            f"following the existing leaf-file template. Then stop."
        )
        print(json.dumps({"decision": "block", "reason": reason}))
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
