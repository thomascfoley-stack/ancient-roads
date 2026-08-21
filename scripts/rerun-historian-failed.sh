#!/usr/bin/env bash
# Re-run of the Phase-2 works that failed mid-embed on the 513-token overflow (chunk threshold
# now tightened to the measured 2.9 chars/token) plus bede (blocked by his own dev-publish).
# Idempotent: ingest-historian deletes and reinserts per work.
set -uo pipefail
DIR=docs/evidence/historian-phase2
WORKS=(schaff-hcc1 schaff-hcc2 schaff-hcc3 schaff-hcc4 schaff-hcc5 schaff-hcc6 schaff-hcc7 schaff-hcc8
       hort-ecclesia edersheim-lifetimes schaff-person wuttke-ethics1 young-j-christ bede-history)
PASS=(); FAIL=()
for W in "${WORKS[@]}"; do
  L="$DIR/$W.log"
  echo "=== RERUN $W  $(date -u +%H:%M:%SZ) ===" | tee -a "$L"
  if DATABASE_URL=$(cat ~/.neon_dev_owner_url) NEON_BRANCH=dev \
     npx tsx src/ingest/ingest-historian.ts --jsonl="data/raw/historians/$W.jsonl" --slug="$W" >> "$L" 2>&1; then
    PASS+=("$W"); grep "sections staged" "$L" | tail -1
  else
    FAIL+=("$W: see log"); echo "  FAIL $W"
  fi
done
echo "RERUN SUMMARY: ${#PASS[@]} ok, ${#FAIL[@]} failed"
[ ${#FAIL[@]} -gt 0 ] && printf '  FAIL %s\n' "${FAIL[@]}"
echo "done $(date -u +%H:%M:%SZ)"
