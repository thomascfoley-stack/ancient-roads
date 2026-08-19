#!/usr/bin/env bash
# Run the held-out eval and capture it WHOLE, into evidence, every time.
#
# WHY THIS EXISTS. On 2026-08-19 three eval runs were invoked ad-hoc and two lost their evidence:
# one through `| tail -12` (destroying all 120 per-query lines, so which queries regressed could
# not be diagnosed) and one through `| tail -60` (leaving a partial baseline, so only 41 of 120
# queries were ever comparable). A summary table survives truncation; the per-query detail that
# explains it does not. The comparison you want to make later is never the one you planned for.
#
#   scripts/run-eval.sh <label> [--v3|--v4|--frozen]
#
# Writes docs/evidence/evals/<label>-<set>-<stamp>.log — full, unpiped — and prints the summary.
set -uo pipefail

LABEL="${1:-}"
SET="${2:---v3}"
[ -n "$LABEL" ] || { echo "usage: scripts/run-eval.sh <label> [--v3|--v4|--frozen]"; exit 2; }
[ -n "${APP_DATABASE_URL:-}" ] || { echo "STOP: APP_DATABASE_URL unset. Point it at the database you mean to measure."; exit 2; }

STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
OUT="docs/evidence/evals/${LABEL}-${SET#--}-${STAMP}.log"
mkdir -p "$(dirname "$OUT")"

echo "eval: $SET -> $OUT"
# NOT piped. Redirection only, so nothing can truncate it.
( cd web && npx tsx --env-file=.env.local src/scripts/eval-heldout.mts "$SET" ) > "$OUT" 2>&1
rc=$?

LINES=$(wc -l < "$OUT" | tr -d ' ')
QUERIES=$(grep -cE "v3-[a-z]+-[0-9]+|v4-[a-z]+-[0-9]+" "$OUT" 2>/dev/null || echo 0)
echo "captured $LINES lines, $QUERIES per-query result(s)"
# A capture with a summary but no per-query lines is the exact failure this script exists to stop.
if [ "$QUERIES" -lt 50 ]; then
  echo "WARNING: only $QUERIES per-query lines captured — this log cannot support a per-query diff."
fi
echo
sed 's/\x1b\[[0-9;]*m//g' "$OUT" | sed -n '/^category/,$p'
exit $rc
