#!/usr/bin/env bash
# Stop hook: the full gate before handing work back.
# Typecheck + lint + tests must pass. This is /validate, enforced automatically —
# work can't be handed back green-looking while the gate is red.
set -uo pipefail

root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$root" || exit 0

[ -d node_modules ] || { echo "node_modules missing — run npm install" >&2; exit 0; }

fail=0
echo "▶ tsc --noEmit";       npx tsc --noEmit                || fail=1
echo "▶ biome check";        npx biome check .               || fail=1
echo "▶ vitest run";         npx vitest run --passWithNoTests || fail=1

if [ "$fail" -ne 0 ]; then
  echo "final-check failed — fix typecheck/lint/tests before handing back." >&2
  exit 2
fi
echo "✓ final-check passed"
exit 0
