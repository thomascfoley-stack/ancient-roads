# W-REGDURABLE — Register flip durability

**Status:** RED-PROVEN → DONE (tooling + design; dev flip MOOT — preconditions no longer hold; prod flip → owner packet)
**Branch:** `swarm/w-regdurable-flips` (worktree `/tmp/swarm-regdurable`, base `9dce273`)
**Lane:** DB-writer position 5 (sole writer; W-EUSEBIUS, W-HISTBACKLOG, W-THAYER, W-STRONGS complete)

## What the 08-19 entry asked

WORKLOG 2026-08-19 (P4.n Phase B), NOT-DONE: *"sermon and theology are unflipped, and want a
durability story better than a 7-hour transaction before they run."* Read in full. Measured
there: `served=true` costs 20–36 rows/sec (six indexes carry `served` in their predicate; HNSW
re-insertion over Neon's pageserver), so sermon ≈ 4.5 h and theology ≈ 7.5 h in one
transaction, and three single-transaction runs died mid-flight leaving nothing written.

## Preconditions re-measured against live dev (ep-tiny-hat, 2026-08-23)

Evidence: `docs/evidence/swarm-2026-08-22/w-regdurable/preconditions-dev-probe.txt`.

- **Zero** corpus embeddings carry `register='sermon'` or `register='theology'` on dev. The
  register landscape moved: the prose-register convention puts that content under
  `register='prose'`, and the 08-22 prose→lexicon relabel landed (lexicon 80,405 rows now
  carry `register='lexicon'`).
- All **published** sermon/theology works on dev are already **fully served**:
  sermon 162,507/162,507 (6 works), theology 28,726/28,726 (3 works).
- The only unserved sermon/theology rows belong to **staged** works (10,074 + 19,275 rows, 31
  works incl. staged npnf201/202/203 neighbours) — serving them would be the
  served-but-unpublished bug, so they are correctly out of scope.

**Verdict: the 08-19 preconditions do NOT hold on dev** — there is nothing to flip. The item
brief says execute only if preconditions hold, "otherwise dry-run only and say why" — so:
dry-run only. Evidence: `docs/evidence/swarm-2026-08-22/w-regdurable/dev-dry-run.txt`
(9 published works, todo=0, 31 staged works excluded and listed).

## Deliverables

- **Design note** (≤1 page): `docs/pm/swarm-2026-08-22/w-regdurable/DESIGN.md`. Mechanism is
  the repo's existing idiom, not a new framework: 2,000-row autocommit batches, the database
  as resumable state via the `served IS NOT TRUE` idempotence predicate (same as
  `scripts/serve-batched.mjs` and the 08-22 relabel's detached 2,000-row batches), legality
  preflight before the first write. Selection by `sources.source_type` + `status='published'`,
  NOT by the register label (write-only, already moved once).
- **Tool**: `scripts/register-flip-batched.mjs` — dry-run default, `--apply` to write,
  dev-guarded exactly like the suppression scripts (`assertDevOnlyTarget`: `NEON_BRANCH=dev|test`
  AND ep-tiny-hat / ep-holy-rice / localhost host; prod unreachable).
- **Red-proof** (throwaway local postgresql@14, destroyed after):
  `docs/evidence/swarm-2026-08-22/w-regdurable/redproof-local.txt` — SIGTERM landing mid-run
  after 3 committed batches (exit 143), resume writing exactly the remainder, ledger
  6+1=7=todo (double-application would exceed it), final 8/8, staged rows untouched;
  idempotent re-run reports 0; predicate-less variant demonstrably double-applies (the check
  is load-bearing); mid-statement `pg_terminate_backend` rolls the in-flight batch back;
  guard refuses unset/prod NEON_BRANCH and a prod-looking host before connecting; preflight
  STOPs on a MUST_NOT_SERVE author with nothing written.

## Honest incidents (in the record, not buried)

1. First red-proof attempt exported `DATABASE_URL` but not `DATABASE_URL_UNPOOLED`; the repo's
   `.env.local` fallback let dev's unpooled URL win, so those node runs hit **dev** in 0-todo
   mode. Nothing written (every apply run: "OK — 0 row(s)"; dev count re-measured unchanged
   191,233/191,233). Corrected runs are the ones in evidence.
2. First local interrupt attempt seeded too little filler; batches committed before the
   watcher could kill — the "interrupted" run completed. Re-proven with 5M filler rows; the
   valid transcript is the one committed.

## Spend (A1)

**$0.00.** Zero provider calls — no embeddings, no DeepInfra, no eval runs. Dev DB reads + a
local throwaway Postgres only.

## Audit

`npm run audit` in the worktree: **RED on exactly one test, the known thayers baseline** —
`test/publish-flip-toolchain.test.ts > thayers evidence gate > the SHIPPED CLI refuses at the
same gate` (asserts `docs/evidence/thayers-source-verification.md` absent; it exists since the
08-22 Thayer's verification). Receipt: 1 failed | 847 passed (848), 69/70 files; every other
leg green incl. deploy.sh gate harness and Gate B. This red is pre-existing at base `9dce273`
and is W-BASEFIX's item — noted, deliberately not fixed here. My diff adds no test-imported
code (one new script + docs), so it cannot be implicated. Full log: `/tmp/swarm-regdurable-audit.log`
(scratch; the failing assertion is quoted above).

## Owner packet note (prod flip)

The 08-19 numbers were PROD counts (sermon 146,205 rows ≈ 90 min, theology ~245,000 ≈ 2.4 h at
the measured 28 rows/sec) and prod is where the flip remains owed — dev's equivalent already
landed under the prose register. Recommended owner command: build the slug list of prod
`status='published'` sermon/theology works, then run the existing prod-authorized
`scripts/serve-batched.mjs --slugs=<file> --batch=2000` (it already embodies this exact
durability pattern: committed batches, `served IS NOT TRUE` resume, legality preflight, owner
TTY gate). `scripts/register-flip-batched.mjs` is the dev-guarded twin for rehearsal; it
refuses prod by design. Pre-flight on prod: confirm the published sermon/theology slug set and
todo count, and expect ~4 h of resumable batches — an interruption costs ≤1 batch.
