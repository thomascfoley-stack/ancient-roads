# MASTER — Ancient Paths programme sheet

**Read this first, every session.** It is the plan and the gate board. It is **not** the state —
state lives in `docs/STATE_OF_TRUTH.md` and this file points at it rather than copying it.

Last verified: 2026-08-01 · `main` @ `29d6f98` — the merge commit of **PR #48**, merged 2026-08-01
02:19:30Z by merge-commit, so all 21 commits and their `Model:` trailers survive · working branch
`fix/post-a1-corrections-2026-08-01`

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
| A1 | Stage 2 blockers closed · PR #48 merged | **CLOSED 2026-08-01.** All four re-executed by a fresh session that wrote none of the work — the first independent verdict this repo has carried ([verdict](orders/2026-08-01-stop-verdict-a1-closure.md)). PR #48 merged at `29d6f98`. Six findings, none blocking; three corrected by [the post-A1 tranche](orders/2026-08-01-post-a1-corrections.md) |
| A2 | ⚑ Prod read-only session — instrument over `staged` + serving census, one log, no writes | Not started |
| A3 | Census adjudicated — a published-but-not-admitted work is a STOP | Blocked on A2 |
| A4 | ⚑ Publish flip — `UPDATE sources SET status`, exact inverse, snapshotted | Blocked on A3 |
| A5 | Prod instrument run — G10 stops being permanently skipped | Blocked on A4 |
| A6 | ⚑ Deploy A — the irreversible one | Blocked on A5. **Preflight now measured, not guessed** — [DEPLOY_PREFLIGHT.md](../DEPLOY_PREFLIGHT.md). The build was **BROKEN at `d1576fe`** (fixed `c1e359d`, and `next build` is in CI since `19798ec`); `predeploy-gate` passes on the real corpus. `concordance`/`lexicon`/`original` were ABSENT; **`b9ad463` restored all three and the [census](../evidence/post-a1-2026-08-01/concordance-census.md) confirms all six served dirs are byte-exact against `corpus-backup-2026-07-28`.** Rollback ids established — [RECOVERY.md](../RECOVERY.md) §2 |
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
**CERTIFIED 2026-08-01, and A1 is closed.** A fresh session that wrote none of the 21 commits
re-executed all four blockers and signed off: B-1 by loading both library versions side by side
(cohort recompute SQL byte-identical, 2790 == 2790), B-2/B-3/B-4 by seeding real product code and
watching each check fail. Six findings, none blocking. [Verdict](orders/2026-08-01-stop-verdict-a1-closure.md).

`DEPLOY_PREFLIGHT.md` was rewritten at `bf34b21` from 25 lines to 241 (**248 today**). The
"still 25 lines (NOT DONE, carried)" line that stood here was false when it was written — `bf34b21`
precedes the commit that wrote it.

**Verified but not closed:** the repair's guards (weld abort, prod refusal on the *resolved* endpoint,
dry-run default, single-column scope) all fire. Its **execution** is UNVERIFIED — the auditor had no
dev credentials, so the 61,486-row claim rests on the tool's own log.

**Why the first payload is small:** nothing in this pipeline has ever run successfully on production.
E5 never ran. Whether `deploy.sh` works end-to-end is an open question in the work order itself.
The first pass should be the one where, if something breaks, you know what broke it.

## Lane B — gates

| # | Gate | Status |
|---|---|---|
| B0b | Is stated-text recall the right metric? | **PAPER, awaiting ruling** — [METRIC-PROPOSAL.md](../evidence/slice0-k-revalidation/METRIC-PROPOSAL.md). Recommends SUPERSEDE for the ship gate, KEEP as a regression check (it is the only ground truth not produced by substring overlap). Demotes the parser widening from blocker to nice-to-have |
| B0a | K re-validation on a fresh held-out set | **NOT DONE — set could not be built.** The frozen marker regex requires quote-then-reference (Spurgeon's CCEL house style); Wesley/Edwards/Whitefield state the reference FIRST, so eligible n=0 against a floor of 20. Positive control fires (63 matches on Spurgeon vols 10+13). Harness deliberately NOT widened. [result](../evidence/slice0-k-revalidation/RESULT.md) |
| B0 | Slice 0 — anchor recall | **CLEARED.** Held-out n=30, frozen harness, recall 90% (CI lower bound 74% vs a 70% bar). Precision clears at K=2 (82/68) and K=3 (75/96) |
| B1 | ⚑ Owner: a Neon dev branch to build against | **OPEN** |
| B2 | ⚑ Owner: confirm DeepInfra `bge-large` as the committed embedding model | **OPEN — contradiction removed.** ADR-005 already pins `bge-large-en-v1.5` for the corpus and rejects mixing embedders; `SERMON_COMPANION.md` §3's "Jina v3 (already chosen)" was a wishlist row with no ADR and no code behind it (corrected in place). B2 now asks only: same model for **user-corpus** embedding in Slice 1? Parity near-forces it. |
| B3 | ⚑ Owner: Vercel Pro (hobby cron is daily; useless for an ingestion queue) | **OPEN** |
| B4 | Translation decision — shingle against the user's translation, or all. Moved the headline 17 points | **OPEN — options now written** ([paper](../SLICE1_TRANSLATION_DECISION.md), recommends Option A + detection). Rulable. |
| B5 | Slice 1 — prose/sermons end-to-end + the tradition-gap join | Blocked on B1–B4 |

## Owner decisions outstanding

| # | Decision | Blocks |
|---|---|---|
| 1 | Neon dev branch for Lane B | all of Lane B |
| 2 | Confirm `bge-large` **for user-corpus embedding** (the corpus is already pinned by ADR-005) | all of Lane B — parity failure returns garbage silently, with no error. Jina v3 is ALSO 1024-dim, so a mismatch inserts, joins and scores cleanly |
| 3 | Vercel Pro | Lane B ingestion queue |
| 4 | Front-matter gating — all admitted hits stop, or strong-only (`origin/wip/front-matter-strength`) | merge of that branch |
| 5 | Each ⚑ gate above | that gate |

## Failure-mode watchlist

**Ten instances so far.** The eighth was introduced by the tranche meant to fix the class; the tenth
was introduced by the tranche meant to *name* it. `b9ad463` §2.2 declares itself the ninth (the
served-asset directory list, closed by derivation). The tenth is
`test/ask-max-duration-literal.test.ts:26-29` — a hand-typed two-route array in the file whose own
header names this class, already incomplete at the commit that introduced it, closed by derivation
on 2026-08-01 ([red-proof](../evidence/post-a1-2026-08-01/maxduration-redproof.md)).

**The artefact list below names ten items against a count that has never matched it** (it read
"eight" while listing ten). The count above is of *instances found*, which is not the same list;
no attempt is made here to renumber the artefacts to match, because inventing a mapping is how this
kind of drift becomes permanent.

- **A hand-maintained expected set that nothing enforces.** CI file allowlist · `USER_TABLES` · the gate's
  legs · `isUserScoped` · the licence-manifest domain list · role literals · `REQUIRED_GATE_PREFIXES` ·
  the served-asset directory list (ninth, derived at `b9ad463`) · the `maxDuration` route list
  (tenth, derived 2026-08-01).
- **A verdict computed separately from the report of that verdict.** `reportExpectRedMismatch` beside
  `compareExpectRed` · a header certifying "clean-provenance works only" while another predicate chose the
  sample · a CLI growing its own `formatExcerptLine`.

Also seen: red-proofs seeding a *copy* of the predicate · checks that are algebraic identities · mocks
asserting they return what they were told · "audit green" while `db-invariants` is red · a test that
repairs the defect it measures (the perturbation suite's unscoped backfill) · **an unearned RED**:
`db-invariants` failed on `ca53457`, a docs-only commit, because
`web/test/invariants/section-vector-pairing.test.ts` calls the live DeepInfra embedding API and got
`429 engine_overloaded`. Re-run with no code change: green. The gate is therefore non-deterministic,
and a red does not distinguish "broken" from "the provider was busy" — which is how a real red gets
waved through. Not fixed here; a bounded retry on 429, or an explicit NOT RUN on provider
unavailability, would make the signal mean one thing again.

**A fifth, found by T1 (2026-08-01): a gate nobody runs is not a gate.** `next build` was not in CI —
neither `audit` nor `db-invariants` compiled the app — so the production build sat broken at HEAD with
every check green. The deploy itself, at step 6 of 7, was the only thing that would have caught it.
**CLOSED at `19798ec`**: `.github/workflows/audit.yml:55-65` runs `next build` as step 7 of the
`audit` job, with `set -o pipefail` so a failure through `tee` is not swallowed, and a second
annotation that names the likely cause because Next reports segment-config errors without naming a
route. Watch for gates that exist only inside an irreversible operation.

**Still open, and it is not the same thing:** `main` is **unprotected** — `required_status_checks`
is empty and rulesets are unavailable on this plan for a private repo. `audit` is not a required
check. So the build gate is real inside the job, and nothing mechanically stops a red commit
reaching `main`. Every "nothing merges red" sentence in this repo is a statement about discipline,
not mechanism.

**A sixth, and it produced two of this week's errors: an instrument's blind spot recorded as a
property of the thing it could not see.** `6ab5779` established, correctly and precisely, that the
Vercel CLI on this machine cannot reach the `web` project — it authenticates as `thomas-5672`
against scopes that do not contain it. It then wrote down that the deployment "appears in no Vercel
listing", and told readers to delete the id from every document. The id is real: it is the
deployment serving `ancientpaths.app`. A scope limit became a claim about the world. **Same family
as reporting a provider outage as a failure: a negative result that is really a NOT RUN.** The tell
is a universal negative ("appears in no…", "exists nowhere…") whose evidence is one instrument's
silence. Corrected in [RECOVERY.md](../RECOVERY.md) §2 on 2026-08-01.

**A fourth, found by B-1: an eligibility rule that selects for the population it was built on.** The
Slice 0 stated-text parser reads Spurgeon's CCEL typography (quote-then-reference) and matches
essentially nothing else — 63 hits on 78,655 Spurgeon lines, 1 on 116,162 lines of Wesley/Edwards/
Whitefield, who all state the reference first. So every "held-out" set built by that rule is drawn from
one author by construction. Watch for filters whose reach is narrower than the population they claim to
sample.

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
