#!/usr/bin/env bash
# Final pass: the 7 embed-overflow failures (all predated the embed-layer fallback) + bede
# (verified staged in the foreground this time). Idempotent per work.
set -uo pipefail
DIR=docs/evidence/historian-phase2
WORKS=(schaff-hcc1 schaff-hcc2 schaff-hcc3 schaff-hcc4 schaff-hcc7 schaff-hcc8 bede-history)
PASS=(); FAIL=()
for W in "${WORKS[@]}"; do
  L="$DIR/$W.log"
  echo "=== FINAL $W  $(date -u +%H:%M:%SZ) ===" | tee -a "$L"
  if DATABASE_URL=$(cat ~/.neon_dev_owner_url) NEON_BRANCH=dev \
     npx tsx src/ingest/ingest-historian.ts --jsonl="data/raw/historians/$W.jsonl" --slug="$W" >> "$L" 2>&1; then
    PASS+=("$W"); grep "sections staged" "$L" | tail -1
  else FAIL+=("$W"); echo "  FAIL $W"; fi
done
echo "FINAL SUMMARY: ${#PASS[@]} ok, ${#FAIL[@]} failed"
[ ${#FAIL[@]} -gt 0 ] && printf '  FAIL %s\n' "${FAIL[@]}"
