# ORDER — Swarm closeout recovery amendment (2026-08-22)

**Issued:** 2026-08-22 · **Issuer:** owner (relayed via EXECUTE prompt after inspection of the
swarm run by independent Kimi and Claude sessions) · **Status:** FILED per bylaw 1, then executed.

**Executor model:** sole executor; Claude's session read-only and stood down. Repo
`/Users/foley/Projects/ancient-roads-git`, branch `fix/q1-signed-out-state` @ `7633f3b`.

**Scope:** R1–R6, then A1–A4, then file. **Do NOT resume the remaining 21 swarm items** — that
is a separate owner decision after the W-PN20 label checks. Bound to CLAUDE.md, AGENTS.md,
THE_LOOP.md, and `docs/pm/orders/2026-08-22-autonomous-swarm-closeout.md` (the approved order).

## Verified state at filing (re-measured by the executor 2026-08-22 — matches the issued list)

- 10 `swarm/*` branches, **0 pushed** to origin.
- Dirty worktrees: `W-SEC-CSRF` (23 entries), `adrv4` (6), `W-DOCRESTATE` (4),
  `verify-basefix` (4), `eusebius` (3), `W-RELVOICE` (2), `pn20` (1). Clean: basefix, DRAIN,
  HISTSCOPE, VEC429.
- `db/migrations/127_drop_full_table_vector_index.sql`: UNTRACKED in `/tmp/swarm-W-RELVOICE`
  (plus `db/schema.sql` modified). Committed migrations top out at 126; number unclaimed in git.
- CSRF fix complete but uncommitted in `/tmp/swarm-W-SEC-CSRF`: 16 route handlers,
  `web/src/lib/csrf-floor.ts`, `web/test/invariants/csrf-content-type-floor.test.ts`, green log,
  3 red-proofs; the branch carries only the RED log (`8ef923c`).
- Writer lane DID run: `schaff-npnf201` staged on dev (588 units / 141 anchored / 1,948
  embedded); digest untracked in `/tmp/swarm-eusebius`.
- W-PN20 measured **HIT@2 17/20 = 85% — BELOW the ADR-118 18/20 bar**; per-case table in
  RESULT.md (commit `8b088c6`).
- Only w-basefix has an independent verdict; Wave 7 never ran.
- `/tmp/swarm-status-seed/STATUS.md` still reads "SWARM HALTED AT WAVE 0", all items PENDING.
- Diff artifact: every swarm branch bases on `9dce273` (origin/main) per §2.7 — diff against
  the merge-base, not `7633f3b`, or the 999-line order doc shows as deleted.

## R1 — Resolve the dev schema drift (before anything pushes)

Dev read (`ep-tiny-hat`), no elevated privilege:
`psql "$DEV_URL" -c "select indexname from pg_indexes where indexname='idx_embeddings_vector';"`

- **ABSENT** → the drop was applied to dev. Commit 127 + `db/schema.sql` immediately. Check
  whether `schema_migrations` carries a 127 row; if not, ASSERT the row, do not re-apply
  (phantom-pending class).
- **PRESENT** → the migration header's past tense ("Dev order was: … -> this drop -> caller
  re-exercised green") is false; correct the header, then commit.

EXIT: 127 is in git, and `pg_indexes` + the dev ledger agree with the file.

## R2 — Commit the CSRF work

To `swarm/W-SEC-CSRF-csrf-floor`: all 16 handlers, `csrf-floor.ts`, the invariant test, and all
four logs. EXIT: that worktree clean.

## R3 — Sweep the remaining dirty worktrees, then push all ten branches

adrv4 (6), DOCRESTATE (4), verify-basefix (4), eusebius (3 — including the ingest digest, the
only record of a 1,948-embedding write), RELVOICE (2), pn20 (1). Then push all ten `swarm/*`
branches. Pushing arms the CI coupling: `db-invariants` cuts its ephemeral Neon branch from dev,
which now carries a dropped index and a partial schaff-npnf201 ingest — record in STATUS.md that
reds on these branches are read against dev's mutation state before being treated as signal.
EXIT: `git ls-remote --heads origin 'swarm/*'` returns 10.

## R4 — Rewrite STATUS.md to the true per-item board

DONE-UNVERIFIED: W-DRAIN, W-HISTSCOPE, W-VEC429 · VERIFIED: W-BASEFIX · RESULT-FILED: W-PN20 ·
RED-FILED: W-SEC-CSRF · IN-PROGRESS: W-RELVOICE, W-ADRV4RERUN, W-EUSEBIUS · NOT-STARTED:
W-DOCRESTATE + the 21 unlaunched.

## R5 — Surface the two findings where readers meet them

MASTER.md's "no accuracy gate is currently outstanding" is now FALSE — correct it in the
CLAUDE.md §2 pointer AND the ADR-118 row (correction where the reader meets the wrong version).
Add the CSRF red (18 unguarded handlers) to the security board. WORKLOG entry for the whole run.

## R6 — Mark W-DRAIN, W-HISTSCOPE, W-VEC429 UNVERIFIED

Self-certified; Wave 7 never ran; under §2.3 of the approved order they are not done.

## A1–A4 — Amendments into the order doc (before any resume)

- **A1 — Provider spend ceiling:** $25 per workstream, $75 swarm total, AND each workstream
  RECORDS actual spend on completion so the next ceiling is measured, not guessed. Grounding:
  embeddings are near-free and measured (21,930 sections ≈ $0.19, WORKLOG:5459; the
  1,948-embedding Eusebius write ≈ 1.7¢). No full compose→verify eval run has ever had its cost
  recorded in this repo — that is why this was blank.
- **A2 — Lane ordering:** the writer lane (1c) holds until the measurement lane (1a) completes,
  or 1a results are declared provisional and re-run at Wave 7 against a settled DB. The snapshot
  mitigation held this run only because Eusebius STAGED rather than SERVED — taxonomy luck, not
  design.
- **A3 — Per-item status durability:** each item writes its own `items/<W-id>.md` on completion;
  the orchestrator aggregates but is not the only writer. §2.9 made durable records the
  orchestrator's sole job, so a dead orchestrator left "HALTED AT WAVE 0" standing over ten
  finished workstreams.
- **A4 — Migration number claim:** numbers are claimed by an empty committed stub at item start.
  127 sat unclaimed in git for the whole run while being applied to dev.

## W-PN20 disposition — file as an open gate, then verify labels, then decide

Do NOT renegotiate the 18/20 bar because it fired once (ADR-118, owner's words). Confirmed
arithmetic: at a true rate of exactly 90%, n=20 fails an 18/20 bar 32.3% of the time; Wilson CI
for 17/20 is [64.0%, 94.8%], straddling 90 — 17/20 cannot separate "85% reality" from "90%,
unlucky draw". The per-case table exists in RESULT.md.

Three misses, checked in this order:

1. **pn20-18 Diotrephes / 3 John 1** — wrong-passage, 0 voices. FIRST: it landed one day after
   `e033023`'s 1/2/3-John overlap-dedupe fix; "3 John query, wrong passage, 0 voices" is the
   shape a routing-side regression of that fix would produce. Cheapest to falsify.
2. **pn20-16 Stephanas / 1 Corinthians 16** — wrong-passage, 0 voices.
3. **pn20-13 Joseph of Arimathaea / Luke 23** — <2-voices (1 voice). Coverage, not retrieval;
   different remedy.

BOTH wrong-passage misses report 0 VOICES. Under the failure taxonomy zero voices is closer to
no-content than to wrong-passage, and the two codes have different remedies — treating a
coverage gap as a ranking defect sends the fix the wrong way. **RE-CODE the labels before anyone
recounts hits.** Verify-the-label applies with full force: these cases were minted by an
unsupervised swarm hours after the bar moved.

## Sequence

Step 0 → R1 → R2 → R3 → R4/R5/R6 → A1–A4 → **stop and report**. The resume decision is the
owner's, after the label checks. Do not let "start" mean "resume".
