# MASTER — Ancient Paths programme sheet

**Read this first, every session.** It is the plan and the gate board. It is **not** the state —
state lives in `docs/STATE_OF_TRUTH.md` and this file points at it rather than copying it.

Last verified: 2026-07-31 · `main` @ `1199a03` · working branch `chore/work-order-v2-stage2` @ `ac19935`

## Bylaws

1. **If it is not in the repo, it was never issued.** Orders, verdicts, audit prompts and decisions
   live under `docs/pm/`. A decision that exists only in a chat window does not exist.
2. **The docs are the source of truth.** Do not characterise a document you have not opened.
3. **Least code.** A fix must state what it costs to *not* fix it. **Deletion is an allowed remedy.**
   A check that cannot be made honest should be removed, not padded.
4. **Fixer ≠ verifier.** Agent-written work is never self-certifying. Independent audit at every STOP.
5. **A property is not an implementation.** State the property; the builder chooses how and red-proves it.
6. **Scale rigour to blast radius.** Full ceremony before an irreversible production write. Not before a
   documentation tranche.
7. **Any production connection, read or write, needs the owner's explicit go, every time** (`AGENTS.md`).
8. **Every commit carries a `Model:` trailer.**

## Where the work is

| Lane | What | Independent of |
|---|---|---|
| **A** | The product pipeline — publish, deploy, walk it | — |
| **B** | Sermon search, `docs/SERMON_SEARCH_DESIGN.md` — writes user tables on a dev branch | Lane A entirely (BUILD_MODEL §2 file-disjoint) |

## Lane A — gates

⚑ = owner go required, per occasion.

| # | Gate | Status |
|---|---|---|
| A1 | Stage 2 blockers closed · PR #48 merged | **OPEN** — 4 blockers FIXED at `03516b6`, awaiting independent audit + ⚑ owner merge ([verdict](orders/2026-07-31-stop-verdict-stage2.md)) |
| A2 | ⚑ Prod read-only session — instrument over `staged` + serving census, one log, no writes | Not started |
| A3 | Census adjudicated — a published-but-not-admitted work is a STOP | Blocked on A2 |
| A4 | ⚑ Publish flip — `UPDATE sources SET status`, exact inverse, snapshotted | Blocked on A3 |
| A5 | Prod instrument run — G10 stops being permanently skipped | Blocked on A4 |
| A6 | ⚑ Deploy A — the irreversible one | Blocked on A5 |
| A7 | Walk the product — Stage 5's twelve journeys · **G7 for the first time ever** | Blocked on A6 |
| A8 | Register ingest slice → Deploy B → publish registers | Blocked on A7 |

### A1 — the four Stage 2 blockers

From the independent STOP audit at `ac19935`
([verdict](orders/2026-07-31-stop-verdict-stage2.md) · [prompt](orders/2026-07-31-stop-audit-stage2.md)).
Every inventory item was VERIFIED by re-execution; these are what the inventory did not cover.

| # | Blocker | Verdict § |
|---|---|---|
| B-1 | The causal sentence is unwritten. `db-invariants` went red→green because **data on `ep-tiny-hat` and `ep-tiny-bonus` was rewritten, not because code changed** — confirmed from the runs, with the `+56`-line refactor beside the flip ruled out. Not recorded in `STATE_OF_TRUTH.md` §2e or the evidence index. | [§B](orders/2026-07-31-stop-verdict-stage2.md) |
| B-2 | `REQUIRED_GATE_PREFIXES` is typed, not derived — the **eighth** instance of the recurring class, introduced by the tranche meant to close it. Adding a `G11` leg leaves the check and its test green; the test builds its reported set from the constant it validates. | §D-1 |
| B-3 | The perturbation suite runs the **unscoped** 024 backfill and writes to sources it does not own — proven to heal a seeded NULL, i.e. it erases the drift the published leg exists to detect. | §D-4 |
| B-4 | The weld check lives only in `scripts/repair-unit-ordinal.mjs` — not in the instrument, not in CI, no test. Ordered into the CI instrument by [the 07-31 weld order](orders/2026-07-31-weld-finding-and-order.md) §1 (BLOCKING); did not land there. The guard is correct (auditor drove it against a seeded weld) but nothing re-proves it. | §F |

**Status at `03516b6`:** all four fixed, each with a red-proof re-executed against a throwaway local
Postgres, and both suites confirmed *executed* (not skipped) against the real CI test DB —
`unit-ordinal-instrument.test.ts` 15 tests, `gate-leg-inventory.test.ts` 10 tests (was 3).
**Not yet certified:** the agent that closed these is the same session that raised them, so per
bylaw 4 A1 stays OPEN until a fresh pair of eyes signs off. `DEPLOY_PREFLIGHT.md` is still 25 lines
(NOT DONE, carried).

**Verified but not closed:** the repair's guards (weld abort, prod refusal on the *resolved* endpoint,
dry-run default, single-column scope) all fire. Its **execution** is UNVERIFIED — the auditor had no
dev credentials, so the 61,486-row claim rests on the tool's own log.

**Why the first payload is small:** nothing in this pipeline has ever run successfully on production.
E5 never ran. Whether `deploy.sh` works end-to-end is an open question in the work order itself.
The first pass should be the one where, if something breaks, you know what broke it.

## Lane B — gates

| # | Gate | Status |
|---|---|---|
| B0 | Slice 0 — anchor recall | **CLEARED.** Held-out n=30, frozen harness, recall 90% (CI lower bound 74% vs a 70% bar). Precision clears at K=2 (82/68) and K=3 (75/96) |
| B1 | ⚑ Owner: a Neon dev branch to build against | **OPEN** |
| B2 | ⚑ Owner: confirm DeepInfra `bge-large` as the committed embedding model | **OPEN** |
| B3 | ⚑ Owner: Vercel Pro (hobby cron is daily; useless for an ingestion queue) | **OPEN** |
| B4 | Translation decision — shingle against the user's translation, or all. Moved the headline 17 points | **OPEN** |
| B5 | Slice 1 — prose/sermons end-to-end + the tradition-gap join | Blocked on B1–B4 |

## Owner decisions outstanding

| # | Decision | Blocks |
|---|---|---|
| 1 | Neon dev branch for Lane B | all of Lane B |
| 2 | Confirm `bge-large` | all of Lane B — parity failure returns garbage silently, with no error |
| 3 | Vercel Pro | Lane B ingestion queue |
| 4 | Front-matter gating — all admitted hits stop, or strong-only (`origin/wip/front-matter-strength`) | merge of that branch |
| 5 | Each ⚑ gate above | that gate |

## Failure-mode watchlist

Eight instances so far. The eighth was introduced by the tranche meant to fix the class.

- **A hand-maintained expected set that nothing enforces.** CI file allowlist · `USER_TABLES` · the gate's
  legs · `isUserScoped` · the licence-manifest domain list · role literals · `REQUIRED_GATE_PREFIXES`.
- **A verdict computed separately from the report of that verdict.** `reportExpectRedMismatch` beside
  `compareExpectRed` · a header certifying "clean-provenance works only" while another predicate chose the
  sample · a CLI growing its own `formatExcerptLine`.

Also seen: red-proofs seeding a *copy* of the predicate · checks that are algebraic identities · mocks
asserting they return what they were told · "audit green" while `db-invariants` is red · a test that
repairs the defect it measures (the perturbation suite's unscoped backfill).

**A third shape, and a standing check on this directory: a correction filed where nobody meets the
claim it corrects.** The `chrysostom-homilies` "+16 prolegomena" story lived in the ADR-029 addendum;
the correction to it (deltas are **(16, 17)** — two deletion points) was first written only into
`STATE_OF_TRUTH.md` §2e, which a reader of ADR-029 has no reason to open. It now sits in both. Apply
this to every correction: **name the document a reader reaches when they meet the wrong version, and
put it there** — the canonical record is where the correction is *complete*, not where it is *first*.

**Instance nine is not a strategy.** This needs one deliberate decision — a mechanical check, or explicit
acceptance that it recurs and audits catch it.

## Index

- Plan: `docs/pm/WORKORDER_V2.md` (six stages) — **NOT YET FILED.** The index previously pointed at
  `AP_WORKORDER_V2.md`, which is not in this repo either. Per bylaw 1 the plan is currently unissued;
  the target path above is where it goes.
- Programme brief: `docs/pm/PROGRAM_BRIEF.md` — **NOT YET FILED.**
- Two-lane strategy: `docs/pm/orders/2026-07-31-strategy-two-lanes.md` — **NOT YET FILED.**
- State: `docs/STATE_OF_TRUTH.md`
- Rulings: `docs/DECISIONS.md`
- Orders and verdicts: `docs/pm/orders/`
- Lane B design: `docs/SERMON_SEARCH_DESIGN.md`
