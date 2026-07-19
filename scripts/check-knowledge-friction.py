#!/usr/bin/env python3
"""Stop hook: nudge Claude to capture tooling friction in .knowledge-base/.

Reads the Stop-hook JSON payload from stdin. If this turn's recent
transcript activity shows an error-like signal co-located with a mention of
one of this project's toolchain topics, emits the Stop-hook block protocol
so Claude continues once and records the learning in
`.knowledge-base/<topic>/overview.md` before actually stopping.

Critical safeguard: `stop_hook_active` is checked first and short-circuits
to a silent, always-allow exit — this is what prevents an infinite
stop-block loop. Never remove or reorder that check.

Uses only the standard library so it works even before `uv sync` has run.
"""

import json
import re
import sys

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


def extract_text(entry: dict) -> str:
    """Best-effort flatten of a transcript JSONL entry to plain text."""
    parts: list[str] = []
    message = entry.get("message", entry)
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, str):
        parts.append(content)
    elif isinstance(content, list):
        for block in content:
            if isinstance(block, dict):
                if isinstance(block.get("text"), str):
                    parts.append(block["text"])
                if isinstance(block.get("content"), str):
                    parts.append(block["content"])
    return " ".join(parts)


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

    for line in reversed(lines):
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        text = extract_text(entry)
        if not text or not ERROR_RE.search(text):
            continue
        match = TOPIC_RE.search(text)
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
