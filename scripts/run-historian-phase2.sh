#!/usr/bin/env bash
# Phase 2: the historian corpus, dev. Sequential convert->ingest->digest per work, in the plan's
# batch order. FAIL-CLOSED PER WORK, NEVER PER RUN: a work that refuses (bad ThML, thin tree,
# licensing) is recorded and skipped; the run continues. No silent caps: the summary prints every
# skip with its reason. josephus-works is EXCLUDED pending its duplicate adjudication.
set -uo pipefail
DIR=docs/evidence/historian-phase2
mkdir -p "$DIR"
WORKS=(
  schaff-hcc1 schaff-hcc2 schaff-hcc3 schaff-hcc4 schaff-hcc5 schaff-hcc6 schaff-hcc7 schaff-hcc8
  foxe-martyrs vanbraght-mirror
  bede-history robertson-history miller-history hort-ecclesia edersheim-lifetimes schaff-person
  baird-huguenots winkworth-tauler bangs-history1 bangs-history2 bangs-history3 bangs-history4
  bacon-lw-history wuttke-ethics1 chesterton-historyengland dickinson-musicchurch young-j-christ rutherford-triumph
)
PASS=(); SKIP=()
for W in "${WORKS[@]}"; do
  L="$DIR/$W.log"
  echo "=== $W  $(date -u +%H:%M:%SZ) ===" | tee "$L"
  if ! npx tsx src/ingest/ccel-to-historian-jsonl.ts --slug="$W" >> "$L" 2>&1; then
    SKIP+=("$W: converter refused (see log)"); echo "  SKIP (converter)"; continue
  fi
  if ! DATABASE_URL=$(cat ~/.neon_dev_owner_url) NEON_BRANCH=dev \
       npx tsx src/ingest/ingest-historian.ts --jsonl="data/raw/historians/$W.jsonl" --slug="$W" >> "$L" 2>&1; then
    SKIP+=("$W: ingest refused (see log)"); echo "  SKIP (ingest)"; continue
  fi
  DATABASE_URL=$(cat ~/.neon_dev_owner_url) node scripts/historian-digest.mjs --slug="$W" >> "$L" 2>&1 || true
  tail -8 "$L" | grep -E "sections|anchors|period-dated|FLAGS" | head -4
  PASS+=("$W")
done
echo
echo "PHASE 2 SUMMARY: ${#PASS[@]} ingested, ${#SKIP[@]} skipped"
printf '  ok   %s\n' "${PASS[@]}"
[ ${#SKIP[@]} -gt 0 ] && printf '  SKIP %s\n' "${SKIP[@]}"
echo "done $(date -u +%H:%M:%SZ)"
