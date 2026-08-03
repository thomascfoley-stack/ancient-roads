# STOP VERDICT — audit of the served cutover (commit 4f14f17 + the 2026-08-03 order)

**Filed** 2026-08-03, per bylaw 1. **Auditors:** 16 agents — 6 subsystem readers (governance,
retrieval, toolchain, migration, web read-paths, evals), 4 adversarial critics (deploy-ops,
licensing, eval-method, completeness), 6 independent verifiers. Bylaw 4 satisfied: none wrote
the work under audit. **Scope:** commit `4f14f17` (migration 039 + routing rewrite + verifier +
flip served-write + inverted guard) and the filed order
[2026-08-03-served-cutover-plan.md](2026-08-03-served-cutover-plan.md), against the tree and
both databases' recorded state.

## Verdicts

| Critic | Verdict |
|---|---|
| deploy-ops | **plan-materially-flawed** |
| licensing | **plan-materially-flawed** |
| eval-method | **plan-materially-flawed** |
| completeness | **plan-materially-flawed** |

44 findings; 6 CRITICAL/HIGH sent to adversarial verification; **6 CONFIRMED, 0 refuted**.

## The six confirmed findings

**F1 · The verifier was circular (CRITICAL).** `verify-served-backfill.mjs` derived its expected
set from the live `routing.ts`; the same commit rewrote `LEGAL_CORPUS_FILTER` to `(served)`.
Equality check: `served` diffed against `served` (tautology on prose rows). Licensing-cohort
check: `served AND NOT (served)` — unsatisfiable. Red-proof: counted ANY failure as "held", so a
standing false-red masked the blindness. Both of the order's gates (dev 1.1, prod step 2) hung on
a check that was red on correct data and blind on wrong data. *The transferable lesson, added to
the MASTER watchlist: a verifier whose expectation is derived from the artifact under test is not
a verifier — the derived-not-typed cure for artefact 1 becomes the disease when the derivation
source is the thing being verified.*

**F2 · The plan never scheduled its own objective, and the mechanism was irreversible
(CRITICAL).** No phase served the 76 published-but-unserved works. The only path — a forward
flip listing published slugs — ran silently ("the rest are already published"), served every
listed work's rows, and could not be reversed: `--reverse` narrows to was-staged slugs and dies
"nothing to reverse". Mixed batches were worse: reverse un-served only the was-staged subset,
stranding the rest.

**F3 · The deploy tree was undefined (CRITICAL).** `deploy.sh` uploads the working tree and
hard-blocks on dirt; the tree held the concurrent /plans slice (uncommitted app code + migrations
applied to dev+ci) and 11 modified files. Step 4 either force-committed /plans onto a prod
lacking its tables (STATE_OF_TRUTH 2f forbids exactly that) or was unexecutable. The branch had
no upstream — the irreversible-write tooling existed in one clone.

**F4 · Migration numbers were ambiguous on the critical path (HIGH).** Two files numbered 039;
the plan's proposed 040 collided with an existing 040. "Apply 039/040 to prod" meant different
files in two documents. During the fix the collision REPRODUCED: the served migration was
renumbered to 042 and the /plans session wrote `042_plan_day_readings.sql` five minutes later.

**F5 · The ~45-minute prod session was unevidenced, with no lock protection (HIGH).** Four
serial HNSW `CREATE INDEX CONCURRENTLY` builds over ~468k rows, never timed anywhere in this
repo; the runner set no `lock_timeout` (040_topical sets one; the served migration did not);
the ADD COLUMN queues behind any long reader and everything queues behind it.

**F6 · Phase 4's first command did not exist, and the touch arithmetic was false (HIGH).**
`build-sweep.mjs` appears nowhere in the repo (`corpus-copy-batches.mjs` is the real tool). "Six
production touches, two owner sessions" undercounts by an order of magnitude: every batch is two
TTY-gated writes; A8 took four owner sessions for 36 works.

## Confirmed by readers, not separately verified (acted on regardless)

- **Register-wall breach:** `diversityBackfillSql` kept the six-type list; post-backfill it
  would splice served sermon/theology rows into COMPOSED /ask answers (3 readers, independently).
- **`served` is not the single switch:** commentary_entries FTS, the static reader, and
  `today.ts` still gate on the frozen slug lists; routing.ts's "adding a slug serves nothing"
  was false in the fail-open direction for the FTS exclusion.
- **The flip had no serving gate:** no MUST_NOT_SERVE check, no manifest `serve:false` check.
- **The legacy work-less cohort has no off switch:** reverse moves status while /ask keeps
  serving (~125k rows unaddressable by slug). Known, now printed by the tool, still open as a
  design limit.
- **Eval protocol:** the filed order spent frozen v4 per batch (the exact process that demoted
  v3); v4 shares 26% of labels with v3; `DEEPINFRA_API_KEY` is recorded unavailable (ADR-044).
- **36,205 blocked entries world-readable** under `web/public/commentaries` incl. modern
  copyright-suspect authors — grown since A6, outside every lens of the plan's Phase 2.

## Found during the fix, by watching a check go red (neither audit nor author caught it)

**F1b · NULL-blindness.** `FALSE OR NULL = NULL`: for work-less rows the frozen predicate
evaluates NULL, and `WHERE served AND NOT frozen` silently drops them — so even the REPAIRED
equality and unreachability checks could not see a wrongly-served work-less row. A served CS
Lewis row (copyright suspect, NOT on the MUST_NOT_SERVE list) passed all seven checks. Fixed
with `coalesce(…, false)`; the Lewis mutant now trips two checks. This is why red-proofs run on
data shaped like production, not on convenient fixtures.

## Correction found while acting on this verdict

The findings say "the 76 published-but-unserved works" throughout: that number was the author's
sweep-local arithmetic (77 published minus keil) and the completeness refuter proved it wrong —
the cohort is **88** (124 published minus 30 slug-served minus 6 author-served), re-derived
independently from the committed pre-flip snapshot and committed as
`docs/evidence/corpus-copy/serve-88.json`. The findings are quoted as issued; read 76 as 88.
Also corrected on this pass: the "ledger pins filenames" claim in 851963d's message is false on
the real targets — no schema_migrations table exists on dev or ci (the runner warns NOT
RECORDED); git and the session records pin the filenames, nothing else does.

## Disposition

| What | Where |
|---|---|
| F1 + F1b, wall breach, F2 mechanism, serving gates, F4 split+renumber | fixed at `1ae0323`, renumbered at `68d9792`, all watched red then green on throwaway pg17 |
| /plans migrations filed (039-042), fencing the numbers | `851963d` |
| Full-tree backup ref (uncommitted /plans code) + branch pushed | `backup/tree-2026-08-03`, `origin/feat/served-column-derives-publish` |
| The plan itself | superseded in place — [2026-08-03-served-cutover-plan.md](2026-08-03-served-cutover-plan.md) v2 |
| FTS/static/today surfaces cutover; work-less cohort off-switch; static-assets exposure | OPEN — named in the v2 order as separate filed work |
