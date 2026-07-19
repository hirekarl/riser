#!/usr/bin/env bash
# PostToolUse hook (matcher: Edit|Write). Advisory format-on-save — never
# blocks, never fails loudly. pre-commit's ruff-format-check/prettier
# --check still enforce correctness at commit time regardless of whether
# this runs successfully.
set -uo pipefail

payload="$(cat)"
file_path="$(printf '%s' "$payload" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
print(data.get("tool_input", {}).get("file_path", ""))
' 2>/dev/null)"

[ -z "$file_path" ] && exit 0

case "$file_path" in
  */backend/*.py)
    if command -v uv >/dev/null 2>&1 && [ -f backend/pyproject.toml ]; then
      rel="${file_path#*/backend/}"
      (cd backend && uv run ruff format "$rel") >/dev/null 2>&1 || true
    fi
    ;;
  */frontend/*.ts | */frontend/*.tsx)
    if [ -f frontend/package.json ]; then
      rel="${file_path#*/frontend/}"
      (cd frontend && npx --no-install prettier --write "$rel") >/dev/null 2>&1 || true
    fi
    ;;
esac

exit 0
