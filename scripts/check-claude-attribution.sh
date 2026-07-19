#!/usr/bin/env bash
# pre-commit commit-msg stage hook. pre-commit passes the path to the
# temporary commit-message file as $1.
#
# Rejects any commit whose message contains a Co-Authored-By trailer that
# references Claude or Anthropic, in any case/spacing/hyphenation variant
# (e.g. "Co-Authored-By: Claude <noreply@anthropic.com>",
# "co-authored-by: Claude Sonnet 5", "Coauthored By: claude.ai").
set -euo pipefail

msg_file="${1:?usage: check-claude-attribution.sh <commit-msg-file>}"
normalized="$(tr '[:upper:]' '[:lower:]' < "$msg_file")"

if printf '%s\n' "$normalized" | \
  grep -E -q '^[[:space:]]*co-?authored-?by[[:space:]]*:.*(claude|anthropic)'; then
  echo "ERROR: commit message contains a Co-Authored-By trailer referencing" >&2
  echo "Claude or Anthropic. Remove it before committing." >&2
  echo "Offending line(s):" >&2
  grep -E -in '^[[:space:]]*co-?authored-?by[[:space:]]*:.*(claude|anthropic)' "$msg_file" >&2 || true
  exit 1
fi

exit 0
