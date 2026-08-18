#!/usr/bin/env bash
# P4.n copy runner — one human keystroke, then verify, then retry only if genuinely short.
#
# WHAT IT DOES NOT DO: it does not answer the consent gate. corpus-copy.mjs:212 refuses a
# non-TTY stdin ("a piped answer is not consent"), and that is the guard standing between an
# agent and an unattended production write. This script inherits your terminal so YOU type
# `copy`; it removes the watching, not the consent.
#
# CREDENTIALS ARE NEVER LOGGED. The 2026-08-16 leak (SEC-4) came from land-wave.sh tee-ing a
# spawned command line that carried a full connection string into docs/evidence/. This logs the
# script name and the slug file only — never the environment, never the argv of a child that
# reads URLs from env.
#
#   usage: scripts/p4n-run.sh <slugs.json> [max_attempts]
set -uo pipefail

SLUGS="${1:-}"
MAX="${2:-3}"
[ -n "$SLUGS" ] || { echo "usage: scripts/p4n-run.sh <slugs.json> [max_attempts]"; exit 2; }
[ -f "$SLUGS" ] || { echo "STOP: no such file: $SLUGS"; exit 2; }
for v in CORPUS_COPY_SOURCE_URL CORPUS_COPY_DEST_URL COPY_ALLOW COPY_EXPECT_HOST; do
  [ -n "${!v:-}" ] || { echo "STOP: $v is unset. Credentials come from the environment only."; exit 2; }
done

STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
LOG="docs/evidence/corpus-copy/p4n-run-${STAMP}.log"
mkdir -p "$(dirname "$LOG")"
N=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SLUGS','utf8')).slugs.length)")

{
  echo "P4.n run — $(basename "$SLUGS"), $N work(s)"
  echo "started : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} | tee "$LOG"

# Pre-flight: is there anything to do? Exit 0 here means already complete.
if node scripts/p4n-verify.mjs "$SLUGS" >/dev/null 2>&1; then
  echo "Already complete — nothing to copy. Verifying aloud:" | tee -a "$LOG"
  node scripts/p4n-verify.mjs "$SLUGS" 2>&1 | tee -a "$LOG"
  exit 0
fi

for attempt in $(seq 1 "$MAX"); do
  echo "" | tee -a "$LOG"
  echo "--- attempt $attempt of $MAX — $(date -u +%H:%M:%SZ) ---" | tee -a "$LOG"
  # NOT piped through tee, deliberately. The consent prompt ("Type 'copy' to proceed: ") ends
  # without a newline, so a pipe can hold it in a buffer and the terminal looks hung — you would
  # be waiting on a prompt you cannot see. The copy's durable evidence is its own receipt JSON in
  # docs/evidence/corpus-copy/, not this log, so nothing is lost by letting it own the terminal.
  node scripts/corpus-copy.mjs --slugs="$SLUGS"
  copy_rc=$?
  echo "copy exited $copy_rc at $(date -u +%H:%M:%SZ)" >> "$LOG"
  if [ "$copy_rc" -eq 2 ]; then
    echo "STOP: the copy refused before writing (gate, env or TTY). Nothing was written." | tee -a "$LOG"
    exit 2
  fi

  echo "" | tee -a "$LOG"
  echo "--- verifying independently (read-only, both databases) ---" | tee -a "$LOG"
  node scripts/p4n-verify.mjs "$SLUGS" 2>&1 | tee -a "$LOG"
  rc=${PIPESTATUS[0]}

  if [ "$rc" -eq 0 ]; then
    echo "" | tee -a "$LOG"
    echo "COMPLETE — $N work(s), finished $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$LOG"
    echo "log: $LOG"
    exit 0
  fi
  if [ "$rc" -eq 2 ]; then
    echo "STOP: the verifier could not run (exit 2). Not retrying a production write blind." | tee -a "$LOG"
    exit 2
  fi
  echo "SHORT — re-running is safe (ON CONFLICT DO NOTHING) and fills only the gaps." | tee -a "$LOG"
done

echo "" | tee -a "$LOG"
echo "GAVE UP after $MAX attempt(s), still short. Read $LOG and the verifier list above." | tee -a "$LOG"
exit 1
