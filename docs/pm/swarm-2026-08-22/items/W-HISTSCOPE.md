# W-HISTSCOPE — `history-scope-db` true positive

Status: **ALREADY-DONE (fix) + DONE (verification, population finding, doc corrections)** → pending Wave-7 verification, Wave-8 merge. Audit: all gates green except the vitest leg's single baseline-red test owned by W-BASEFIX (see AUDIT transition) — not this branch's defect, resolves when `swarm/w-basefix-thayers-guard` merges.
Branch: `swarm/W-HISTSCOPE-history-scope-db` · Worktree: `/tmp/swarm-W-HISTSCOPE`
Base: `9dce273ef09dffb03bc547cead0431f48fb71ffe` (origin/main, Wave-0 baseline)

## Transitions

- **CLAIMED** 2026-08-22 — worktree `/tmp/swarm-W-HISTSCOPE`, branch
  `swarm/W-HISTSCOPE-history-scope-db`, bootstrapped per §2.7 + Wave-0 addendum
  (`web/node_modules` cloned; both env files silently checked clean of `odd-fog|CUTOVER_`
  before copying — booleans only: root clean, web clean).
- **ALREADY-DONE (fix portion)** 2026-08-22, per §2.6 (precondition false). The brief's
  defect — "the test's probe draws from a join WITHOUT the `sources` legs" — is not present
  at the build base: `4baefe5` (2026-08-21, ancestor of `9dce273`) already restated the probe
  with the full shipped scope (`he.served AND src.status='published' AND
  src.source_type='historian'`, matching `history-search-db.ts:34` SCOPE), made it
  deterministic (`ORDER BY`), sourced the API key via `localEnv`, and added the
  leak-direction test. Its own commit message carries the red-proof (SCOPE weakened → 14
  staged works leaked for 'Ambrose' → restored → 3/3 green; before: 16/16 FAIL).
- **RED / measurement evidence** 2026-08-22 — the defect mechanism reproduced live on dev
  without modifying the repo's test: `seeded-probe-proof.mjs` seeds an out-of-scope SERVED
  sentinel label in a rolled-back transaction; the OLD pre-`4baefe5` served-only probe DRAWS
  it, the CORRECTED probe does NOT; rollback verified (dev untouched). Transcript:
  `docs/evidence/swarm-2026-08-22/W-HISTSCOPE/seeded-probe-proof.log` (5/5 PASS).
- **DONE-WHEN evidence** 2026-08-22 — suite green on dev with the probe provably scoped:
  `vitest run test/invariants/history-scope-db.test.ts` → 2/2 passed, neither skipped, leak
  direction exercised (no NOT-EXERCISED warning). Transcript:
  `docs/evidence/swarm-2026-08-22/W-HISTSCOPE/suite-run-dev.log`.
- **Population finding filed** 2026-08-22 — the out-of-scope served entity population
  enumerated on dev: 81 served anchored labels, 31 in scope, **50 out of scope, every one
  anchored only in `historian/staged` works**. Finding for the historians lane / owner
  packet (§11 names it): `docs/evidence/swarm-2026-08-22/W-HISTSCOPE/FINDING-historians-lane.md`
  + regenerable census `out-of-scope-population.mjs` / `.log`.
- **AUDIT** 2026-08-22 — full `npm run audit` in the worktree: every gate green EXCEPT the
  `tests + coverage — vitest` leg, which fails on exactly one test,
  `test/publish-flip-toolchain.test.ts:473` (thayers evidence gate, 1 failed / 847 passed).
  **This is the known baseline red owned by W-BASEFIX, not caused by this branch:** its
  trigger (`docs/evidence/thayers-source-verification.md` present at `abe5252`) is in the
  unmodified base `9dce273` (verified: `git cat-file -e 9dce273:…` succeeds; `abe5252` is an
  ancestor of base), W-BASEFIX's status file documents this exact failure as the Wave-0
  baseline red, and this branch's diff touches nothing in its path (docs + workflow comment +
  evidence scripts only). Not bootstrap-transient (reproduced standalone, same single
  failure); not fixed here — the repair lands via `swarm/w-basefix-thayers-guard` at Wave 8,
  after which this leg goes green. Evidence: `audit.log` (full run tail),
  `audit-vitest-leg.log` (standalone leg, 1/848).

## Order-vs-docs disagreement (filed per §2, not acted on)

The brief instructs: "Make the probe's predicate **import or reuse** the shipped scope legs
rather than retyping them." The shipped fix `4baefe5` deliberately RESTATES the predicate as
literal SQL, with the rationale in the test header: importing SCOPE from
`history-search-db.ts` would make the verifier's expectation derived from the artifact under
test — MASTER.md watchlist **instance fourteen** (`served` diffed against `served`; a SCOPE
regression would narrow the probe identically and stay green). §2: "Where this order and
those docs disagree, those docs win." The restatement stands; importing was NOT done. The
test header documents the seed that turns a real SCOPE regression red.

## Doc corrections (§2.9 third shape — discovered falsehoods fixed in place)

- `docs/pm/MASTER.md` Lane F4 row: claimed `history-scope-db` is red, "TRUE POSITIVE … probe
  draws an out-of-scope label ~62% of the time". False since `4baefe5`. Row rewritten: test
  half CLOSED with evidence; the 50-entity product signal preserved and pointed at the
  finding file (not buried).
- `.github/workflows/audit.yml` comment (~line 167): claimed two failures survive including
  `history-scope-db` as a true positive. Updated to record the closure and the finding
  pointer. No test asserts on this comment text (checked
  `test/invariants/ci-claims-match-reality.test.ts`, `ci-ephemeral-branch.test.ts`).

## Cost of not fixing (§2.5)

Without the doc corrections, the next reader of MASTER.md/audit.yml treats a closed suite as
the lane's standing red and re-opens settled work; without the finding, the 50-entity
served-vs-published drift (the signal F4 was opened to track) would be buried by the test
fix.

## No product code changed

Test fix: none needed (already at base). Diff is: 2 doc corrections + the W-HISTSCOPE
evidence directory (2 runnable scripts, 3 transcripts, 1 finding). No new dependencies,
config, or env vars. No DB writes persist (seeded proof rolls back; verified).

## Owner-packet entry (for §11 aggregation)

| Item | What is ready | Exact command to run | Rollback | Evidence |
|---|---|---|---|---|
| W-HISTSCOPE out-of-scope entity population (historians lane) | Census of 50 served-but-out-of-scope entities; candidate remedy is an owner call (publish-or-unserve per staged work, or accept drift behind the scope predicate) — nothing to execute | none (decision only; census regenerable via `node docs/evidence/swarm-2026-08-22/W-HISTSCOPE/out-of-scope-population.mjs`) | n/a (read-only) | `docs/evidence/swarm-2026-08-22/W-HISTSCOPE/FINDING-historians-lane.md` |

## R6 (2026-08-22, recovery order)

Status revised to **DONE-UNVERIFIED**: this work is self-certified; Wave 7 independent
verification never ran (provider quota kill). Under §2.3 of the approved order it is NOT done
until a verifier re-executes the red-proofs and the audit.
