#!/usr/bin/env bash
# PostToolUse(Edit|Write): fast feedback loop.
# Formats + lints the workspace with Biome on every edit. The heavier gate
# (typecheck + tests) runs at Stop via final-check.sh, so per-edit latency stays low.
set -uo pipefail

root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$root" || exit 0

# No toolchain yet (fresh clone before `npm install`) — skip quietly.
[ -d node_modules/@biomejs ] || exit 0

if ! npx biome check --write . >/tmp/vouch-biome.log 2>&1; then
  echo "Biome reported issues that need attention:" >&2
  tail -20 /tmp/vouch-biome.log >&2
  exit 2
fi
exit 0
