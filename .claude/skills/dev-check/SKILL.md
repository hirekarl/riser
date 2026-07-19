---
name: dev-check
description: Manually re-run the repo's environment/opening-ceremony check (scripts/check-env.sh) on demand, outside of session start, and summarize any drift or missing setup steps. Use when the user wants to verify their dev environment mid-session, e.g. after installing something or before a demo.
---

# Dev Check

1. Run `bash scripts/check-env.sh` from the repo root. This is strictly read-only — it never installs, modifies, or deletes anything.
2. Summarize its `[ok]` / `[warn]` / `[fail]` lines in plain language for the user — don't just paste the raw output.
3. For each `[warn]`/`[fail]`, propose the exact remediation command it suggests.
4. Ask for explicit confirmation before running anything that mutates state (`uv sync`, `npm ci`/`install`, `pre-commit install`, `gh auth login`, `git checkout -b`, etc.). Read-only follow-up commands (`git status`, `git fetch`) don't need confirmation.

This is the same script the `SessionStart` hook runs automatically at the beginning of every session — this skill just lets the user (or an agent) trigger it again mid-session, e.g. after fixing something.
