# Slice B — the cutover orchestrator (2026-07-24)

`scripts/cutover.mjs`. Thin and boring: STEP ZERO + E1-E6, each `assert precondition ->
one dull action -> assert postcondition -> checkpoint`. Credential comes ONLY from
`CUTOVER_DATABASE_URL` (explicit env), never `.env.local`, so the dev gates never scan a
live prod string. Prod is PARKED (§4.1): the first prod write and E5 (deploy.sh) each
require an interactive owner "yes".

## The check that could have failed, and the reds I watched (abort-coverage)

Measured by abort-coverage, not features. STEP ZERO exercised against DEV endpoints
(never prod). True exit codes (harness pipe artifact corrected):

| scenario | target | expect | result |
|---|---|---|---|
| no target (parked rehearsal) | `--dry-run` no env | plan + parked, exit 0 | ✓ exit 0 |
| wrong endpoint | dev owner, EXPECT=ep-odd-fog | ABORT, exit 1 | ✓ "wrong target", exit 1 |
| wrong role | dev app_runtime, EXPECT=ep-tiny-hat | ABORT, exit 1 | ✓ "current_user app_runtime", exit 1 |
| bad/lapsed credential | dev host, bad password | ABORT, exit 1 | ✓ "cannot connect", exit 1 |
| green preflight | dev owner, EXPECT=ep-tiny-hat | PASS, exit 0 | ✓ endpoint+role+write+control (Gill 28,843) |

So the preflight refuses to start on: not-prod, not-owner, can't-connect, can't-write, or
empty target. That converts "dies mid-migration" into "refuses to start."

## Hazards handled in-script

- **Hazard 2 (024 ordinal renumber):** E1 refuses if a section-annotation table exists
  before 024 renumbers ordinals. On a fresh pre-016 BUILD none does, and prod's live 34
  highlights / 2 notes are verse-offset (pre-025), unaffected. Detect-and-refuse, not hope.
- **Hazard 1 (two-store 1:1):** E4's contract is `sections == flat-pool count FOR THAT
  WORK`, asserted per work.
- **Hazard 4 (no dev literals):** every precondition/postcondition count is re-measured
  from the live target at runtime (`q1(sql, ...)`); the census numbers appear only in the
  printed plan as expectations, never as assertions.
- **E3 ratchet:** asserts forbidden-provenance = 0 after cleanup, else abort + restore-from-backup.

## Correctness fix found in self-review

`runner()` originally passed `"apply-migration.mjs <file>"` as one argv element (node would
treat it as a single bad path). Fixed to `runNode([script, sqlFile], url)` before any commit,
even though the real-run path is parked. All 15 migration files (016-030) referenced exist.

## PARKED (honest, not faked)

- **End-to-end rehearsal against the census clone (ep-young-hat):** the connection string
  does NOT exist anywhere in the repo or env (`grep young-hat` = empty). Per §0/§1, PARKED:
  owner supplies `CUTOVER_DATABASE_URL=<ep-young-hat owner>` and runs
  `node scripts/cutover.mjs --dry-run` then `--preflight`, and (with `CUTOVER_EXPECT_HOST=ep-young-hat`)
  a full rehearsal E1-E6 against the clone. That rehearsal is what turns the D2 runtime
  projection from an estimate into a measured number.
- **E2/E4/E6 real actions are stubs that `die("PARKED")`** rather than half-do a prod write:
  the register-label sweep (E2), the per-work slice loop (E4), and the smoke battery (E6)
  must be wired and proven on the census clone before a real run. The refusal is deliberate
  abort-coverage: the script cannot silently do the wrong thing.

## Dry-run plan (for owner review)

Emitted by `node scripts/cutover.mjs --dry-run` (STEP ZERO / E1-E6 with the hazard guards
and the re-measure discipline; full text in the script's `printPlan()`).
