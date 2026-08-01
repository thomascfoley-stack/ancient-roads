#!/usr/bin/env bash
# Tranche 4 red-proof harness — run the four states of each seed against the REAL gate and the
# REAL corpus, and write what happened.
#
# Every seed is applied to real product code (or the real corpus on disk) and reverted with
# `git checkout --`, never to a test's copy of a predicate. Runs at DEPLOYING=1, because the
# property under test is about the deploy path specifically: that is where the artifact-skip
# exemption is not allowed to apply.
#
# Kept in the repo rather than run ad hoc so the next person can re-watch it rather than trust
# the log. It is not wired into audit: it deletes a corpus file and edits the gate, which is
# fine to watch deliberately and not fine to have running on a hook.
set -uo pipefail
cd "$(dirname "$0")/.."

LOG=docs/evidence/work-order-v2-tranche4/corpus-identity-redproof.log
mkdir -p "$(dirname "$LOG")"

run() { # run <label>
  printf '\n--- %s ---\n' "$1" >>"$LOG"
  DEPLOYING=1 npx tsx scripts/predeploy-gate.ts >>"$LOG" 2>&1
  local rc=$?
  printf 'exit=%s\n' "$rc" >>"$LOG"
  printf '%-58s exit=%s\n' "$1" "$rc"
}

restore() { git checkout -- scripts/predeploy-gate.ts web/test/helpers/corpus-scan.ts; }
trap restore EXIT

{
  echo "==============================================================================="
  echo "TRANCHE 4 — corpus identity red-proofs (Work Order v2 Stage 3.1)"
  echo "date: $(date -u +%FT%TZ)"
  echo "head: $(git rev-parse --short HEAD)"
  echo "corpus on disk: 66 books / 308 works / 1,212 files / 191,749 entries"
  echo "==============================================================================="
  echo
  echo "Every run is  DEPLOYING=1 npx tsx scripts/predeploy-gate.ts  — the deploy path."
  echo "Seeds are in the REAL corpus and REAL product code, reverted with git checkout."
  echo "Four states per seed: baseline green, seeded red, reverted, green again."
} >"$LOG"

echo "=== SEED A: delete a real commentary file ===" | tee -a "$LOG"
run "A0 BASELINE GREEN"
VICTIM=web/public/commentaries/jhn/1.json
cp "$VICTIM" /tmp/redproof-victim.json
echo "    (bytes of $VICTIM held in /tmp/redproof-victim.json)" >>"$LOG"
rm "$VICTIM"
run "A1 SEEDED RED — rm $VICTIM"
cp /tmp/redproof-victim.json "$VICTIM"
run "A2 REVERTED — file restored"

{
  echo
  echo "=== SEED B: point the corpus elsewhere, so every corpus check would SKIP ==="
  echo "Seeded in web/test/helpers/corpus-scan.ts COMMENTARIES_DIR — the ONE definition the"
  echo "licensing ratchet, the invariant suite and this gate all import. A moved or mistyped"
  echo "corpus path is exactly how the artifact-skip loophole occurs in practice."
} | tee -a "$LOG"
sed -i '' "s#public/commentaries'#public/commentaries-MOVED'#" web/test/helpers/corpus-scan.ts
git diff --unified=0 web/test/helpers/corpus-scan.ts | grep '^[+-]export const COMMENTARIES' >>"$LOG"
run "B1 SEEDED RED — corpus path moved"

# The licensing leg's own absent-corpus check fires first, so B1 does not yet show that the
# NEW legs refuse. Stack seeds to remove each preempting refusal in turn and reach them.
{
  echo
  echo "    B1 was refused by the pre-existing licensing leg, which fires first. To show the"
  echo "    NEW legs refuse on their own rather than riding on an older check, the seeds below"
  echo "    remove each preempting refusal in turn."
} | tee -a "$LOG"

# The seed swaps the refusal for a console.warn of the SAME message — a valid, minimal,
# entirely plausible edit ("downgrade this to a warning for now"). Wrapping the call instead
# would risk a syntax error, and a gate that exits non-zero because it failed to parse proves
# nothing about the gate.
seed() { python3 - "$1" "$2" <<'PY'
import sys
p = 'scripts/predeploy-gate.ts'
s = open(p).read()
old, new = sys.argv[1], sys.argv[2]
assert s.count(old) == 1, f'seed anchor matched {s.count(old)} times: {old!r}'
open(p, 'w').write(s.replace(old, new, 1))
PY
}

seed 'if (!existsSync(COMMENTARIES_DIR)) {
  FAIL(' 'if (!existsSync(COMMENTARIES_DIR)) {
  console.warn('
run "B2 SEEDED RED — + licensing leg's absent-corpus FAIL downgraded"

seed 'if (!ratchet.ok) {
  gateFail(' 'if (!ratchet.ok) {
  console.warn('
run "B3 SEEDED RED — + corpus-identity refusal downgraded"

restore
run "B4 REVERTED — all seeds out"

{
  echo
  echo "==============================================================================="
  echo "READING"
  echo "==============================================================================="
  echo "A1  the ratchet refused a ONE-FILE deletion and named it: book 'jhn' shrank 21 -> 20,"
  echo "    plus every author who lost entries in that file. A deploy carrying 649 fewer"
  echo "    entries than the last one is now a refusal instead of a quieter library."
  echo "B1  a moved corpus path is refused (by the pre-existing licensing leg, which is the"
  echo "    correct outcome and the reason B2/B3 exist)."
  echo "B2  with that leg downgraded, the corpus-identity leg refuses: corpus ABSENT."
  echo "B3  with BOTH downgraded, the verse-key leg refuses: 'the corpus is absent, so the"
  echo "    ADR-020 verse-key gate cannot run. At deploy time that is a refusal, not a skip.'"
  echo "    That is Stage 3.1's artifact-skip requirement, watched rather than asserted."
  echo
  echo "FINDING, not fixed here (out of tranche scope, recorded so it is not lost):"
  echo "In B2 the licensing ratchet — with only its absent-corpus guard removed — reported"
  echo "'forbidden-provenance entries: -1' and printed 'Debt reduced by 1' and 'Ratchet holds'."
  echo "countStaticForbiddenProvenanceEntries() returns -1 as an absence sentinel, and the"
  echo "comparison -1 <= 0 reads it as an improvement. The absent-corpus FAIL is the only"
  echo "thing standing between that sentinel and a green ratchet, so that guard is load-"
  echo "bearing in a way its own message does not say. A count that cannot be taken should"
  echo "not be returned as a number that compares favourably."
} >>"$LOG"

echo
echo "wrote $LOG"
