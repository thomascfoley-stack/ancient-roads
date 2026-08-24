# WORKORDER v2 — the six-stage plan (reconstructed index)

> **Reconstructed 2026-08-22 from [`MASTER.md`](MASTER.md) (index + Lane A gate rows A1–A9),
> [`../DECISIONS.md`](../DECISIONS.md) ADR-039–043, `docs/evidence/work-order-v2-*/`,
> `docs/pm/orders/2026-07-31-*` and the 2026-08-01/2026-08-02 orders, and
> `docs/evidence/consolidation-2026-07-31/CONSOLIDATION.md`; this is a faithful index of what was executed, not a recovered original.**

## Why this file was missing

The original work order was never committed to the repo. The `MASTER.md` index previously
pointed at `AP_WORKORDER_V2.md`, which has never existed anywhere on the owner's machine
(CONSOLIDATION.md, open item 1). The index was repointed here and marked **NOT YET FILED** on
2026-07-31 (order `2026-07-31-search-programme.md` §2: "Do not repoint it at another phantom").
Per bylaw 1 the plan was therefore formally unissued for its entire execution — the stages
below ran anyway, and their artifacts are what this file indexes. **This file issues no work.**
It exists so the index pointer resolves and the historical record is complete. The living plan
is the `MASTER.md` gate board, which superseded this work order in practice from 2026-07-31 on.

The count "six stages" survives only in the `MASTER.md` index line itself. What each stage
*was* is recoverable only where executed artifacts name it; where nothing names it, this file
says so rather than inventing content.

## Stage 0 — prod-reachability hardening ("Tranche 0", 2026-07-30)

- **0.1 / 0.2** — the prod measurement path runs under plain `node`: no transpiler, no registry
  fetch. Standing proof `test/prod-path-no-transpiler.test.ts`; red-proof
  `docs/evidence/work-order-v2-tranche0/0.1-0.2-redproof.log`.
- **0.3** — ADR-043: G10's red-proof is *written, not discharged*; presence is not discharge.
  G10 dropped from the Stage 2.2 go criteria until its falsifiable condition is met.
- **0.4** — census of every repo path that can reach `ep-odd-fog`, grouped by how the
  connection string is obtained (`docs/evidence/work-order-v2-tranche0/0.4-second-door-report.md`;
  the `runtimeDbUrl` third door at `docs/evidence/work-order-v2-stage2/0.4-third-door-runtimeDbUrl.md`).
- **Stage 0.1 (owner ruling)** — the orchestrator and ADR-039's barnes prod-repair path retired;
  `scripts/repair-barnes-prod.mjs` and `scripts/b0-seed.mjs` deleted; manifest guard on
  `barnes-crosswire-nt` restored (retirement banner on ADR-039).

## Stage 1 — CI and audit hardening (items 1.1–1.10; PRs #43/#44, 2026-07-29/30)

Evidence index: `docs/evidence/work-order-v2-stage1/README.md`; item-to-file map:
`pr44-auditor-file-scope.md` in the same directory. The items, as executed:

- 1.1 protected-branch refusal · 1.2 `db-invariants` fail-closed + skip ceiling · 1.3 manifest
  forbidden-provenance guard · 1.4 deps-audit enumerated acceptable-red set (now
  `docs/SECURITY.md`'s CI-handling section) · 1.5 bait-route gate · 1.6 teach budget · 1.7 /ask
  outcome discriminator · 1.8 user-table spec completeness · 1.9 CI concurrency / duplicate
  check-run elimination (ADR-040) · 1.10 the barnes grep-repair item, closed by the ADR-039
  retirement above.
- STOP rule, quoted by the Stage 2 audit prompt: *"Independent audit is required at the Stage 1
  and Stage 2 STOPs, by an agent that wrote none of it, which re-executes the red-proofs from
  committed evidence rather than reading them."* Stage 1's independent audit report is
  `docs/evidence/work-order-v2-stage1/independent-audit-report.md` ("Stage 2 may open:
  CONDITIONAL"); it also forced the three-way evidence classification (red-proof / pass log /
  receipt) that Stage 1's README carries.

## Stage 2 — the `unit_ordinal` instrument and the ordering problem (2026-07-30/31)

- ADR-041: one instrument core (`scripts/lib/unit-ordinal-instrument.mjs`), three surfaces —
  db-invariants test with standing perturbations of the committed 024 backfill SQL, cutover
  gate **G10** (per-work digest + rollup ratchet), and a read-only CLI for prod measurement.
  The invariant is **order preservation, not dense 1..N** (Stage 2 Tranche 2).
- Eight overnight tranches plus the 61,486-row slug-scoped repair on `ep-tiny-hat` and
  `ep-tiny-bonus` — the red→green flip of `db-invariants` was a **data** move, not a code move
  (`docs/evidence/work-order-v2-stage2/README.md`; `docs/STATE_OF_TRUTH.md` §2e).
- ADR-042 records the 2026-07-30 unplanned production read (no retrospective authorisation;
  three rulings including the evidence-file and owner-go rules).
- STOP audit filed (`orders/2026-07-31-stop-audit-stage2.md`), verdict returned
  (`orders/2026-07-31-stop-verdict-stage2.md`): four blockers **B-1..B-4**, which became
  `MASTER.md` gate **A1**, closed 2026-08-01 with PR #48 merged at `29d6f98`
  (`orders/2026-08-01-stop-verdict-a1-closure.md`).

## Stage 3 — static-corpus gates (2026-07-31)

- **3.1** — the corpus identity ratchet, verse-key gate, and artifact-skip requirement now
  carried by `scripts/predeploy-gate.ts` (tranche 4 red-proofs:
  `docs/evidence/work-order-v2-tranche4/`; named as Stage 3.1 there and in `docs/RECOVERY.md`).
- **3.2** — the front-matter detector (tranche 5 red-proofs:
  `docs/evidence/work-order-v2-tranche5/`; state recorded in `docs/STATE_OF_TRUTH.md`'s
  front-matter entry; the all-hits-stop vs strong-only gating question stayed an owner decision
  — decision 4 in `orders/2026-07-31-search-programme.md` §2).

## Stage 4 — first Book Reader deploy

The only plan-level sentence that survives is ADR-041's context line: *"Stage 4 deploys the
Book Reader for the first time."* Nothing more of Stage 4's plan text is recoverable. What
actually shipped is recorded where it happened: `MASTER.md` Lane A gates A6–A9 and
`docs/DEPLOY_PREFLIGHT.md`.

## Stage 5 — the product walk ("twelve journeys")

The twelve-journey list was **never filed**; per bylaw 1 it was never issued
(`orders/2026-08-02-a7-product-walk.md` says this in as many words). A7 derived a replacement
12-journey list from the shipped navigation, filed it before the walk, and states plainly that
it is **not** Stage 5's list and is not evidence that Stage 5's list was satisfied. The walk
itself is done: `orders/2026-08-02-a7-product-walk.md`,
`docs/evidence/a7-product-walk-2026-08-02.md`, and the wider A7b walk
(`docs/evidence/a7b-wider-product-walk-2026-08-02.md`).

## Stage 6 — not recoverable

No file in the repo names Stage 6's content. The count "six" survives only in the `MASTER.md`
index line. Anything written here would be invention, so nothing is.
