#!/bin/bash
# Wave landing: disk-copy each staged work dev→prod, verify parity, then one publish flip.
# Usage: bash scripts/land-wave.sh <slug> [slug...]
# Owner gate override (2026-08-13/14, WORKLOG) covers the expect-answered publish-flip gate.
set -uo pipefail
cd /Users/foley/Projects/ancient-roads-corpus
mkdir -p docs/evidence/wave-landings
SLUGS=("$@")
echo "== wave landing for: ${SLUGS[*]}"
for slug in "${SLUGS[@]}"; do
  echo "== disk-copy $slug"
  node scripts/disk-copy-work.mjs --slug="$slug" --dump 2>&1 | grep -E "dumped|complete|ABORT" || exit 1
  node scripts/disk-copy-work.mjs --slug="$slug" --load 2>&1 | grep -E "LOADED|FAILED|ABORT|census" || exit 1
  node scripts/disk-copy-work.mjs --slug="$slug" --verify 2>&1 | grep -E "dev:|prod:"
done
SLUGFILE="docs/evidence/wave-landings/flip-slugs-$(date -u +%Y-%m-%dT%H-%M).json"
printf '{"slugs": [%s]}\n' "$(printf '"%s",' "${SLUGS[@]}" | sed 's/,$//')" > "$SLUGFILE"
echo "== publish flip ($SLUGFILE)"
CUTOVER_DATABASE_URL="$(cat ~/.neon_prod_url)" expect /tmp/flip-generic.expect "$SLUGFILE" 2>&1 | \
  tee "docs/evidence/wave-landings/flip-$(date -u +%Y-%m-%dT%H-%M).log" | \
  grep -E "OK — gate held|STOP|served|eligible|REFUSAL"
echo "== wave landing complete: ${SLUGS[*]}"
