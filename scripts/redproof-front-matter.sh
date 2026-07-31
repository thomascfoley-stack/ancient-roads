#!/usr/bin/env bash
# Tranche 5 red-proof — four states against REAL front-matter-detector.mjs rules.
#
# Seed: lower MAX_TITLE_CHARS so "Preface to the Gospel of John" no longer matches as a title.
# The named work-order seed is exercised by vitest against the same module the scan imports.
set -uo pipefail
cd "$(dirname "$0")/.."

LOG=docs/evidence/work-order-v2-tranche5/front-matter-redproof.log
DET=scripts/lib/front-matter-detector.mjs
mkdir -p "$(dirname "$LOG")"

run_test() { # run_test <label> [expect_fail=1]
  local expect_fail="${2:-0}"
  printf '\n--- %s ---\n' "$1" >>"$LOG"
  if npx vitest run test/front-matter-detector.test.ts -t 'Preface to the Gospel of John' >>"$LOG" 2>&1; then
    local rc=0
  else
    local rc=1
  fi
  if [ "$expect_fail" = 1 ]; then
    if [ "$rc" -eq 1 ]; then
      printf 'result=RED (expected)\n' >>"$LOG"
      printf '%-58s RED\n' "$1"
      return 0
    fi
    printf 'result=GREEN (seed failed to bite)\n' >>"$LOG"
    printf '%-58s FAIL — seed did not bite\n' "$1"
    return 1
  fi
  if [ "$rc" -eq 0 ]; then
    printf 'result=GREEN\n' >>"$LOG"
    printf '%-58s GREEN\n' "$1"
    return 0
  fi
  printf 'result=RED\n' >>"$LOG"
  printf '%-58s RED\n' "$1"
  return 1
}

restore() { cp /tmp/redproof-front-matter-detector.mjs.bak "$DET" 2>/dev/null || true; }
trap restore EXIT

{
  echo "==============================================================================="
  echo "TRANCHE 5 — front-matter detector red-proofs (Work Order v2 Stage 3.2)"
  echo "date: $(date -u +%FT%TZ)"
  echo "head: $(git rev-parse --short HEAD)"
  echo "seed: MAX_TITLE_CHARS 70 -> 10 in $DET"
  echo "watch: vitest -t 'Preface to the Gospel of John'"
  echo "==============================================================================="
} >"$LOG"

echo "=== SEED: apparatus title no longer detected ===" | tee -a "$LOG"
run_test "0 BASELINE GREEN — preface at John 1:1 is apparatus"
cp "$DET" /tmp/redproof-front-matter-detector.mjs.bak
python3 - "$DET" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "const MAX_TITLE_CHARS = 70;"
new = "const MAX_TITLE_CHARS = 10;"
if old not in s:
    raise SystemExit(f"anchor not found in {p}: {old!r}")
open(p, "w").write(s.replace(old, new, 1))
PY
run_test "1 SEEDED RED — preface title too long for bound" 1
cp /tmp/redproof-front-matter-detector.mjs.bak "$DET"
run_test "2 REVERTED GREEN — rule restored"

echo | tee -a "$LOG"
echo "Done. Log: $LOG"
