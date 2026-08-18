# Independent review of the CI `db-invariants` diagnosis — 2026-08-18

Reviewer wrote none of the work under review (bylaw 4). Read-only; no writes, no production
contact. Brief: refute, don't approve; default to refuted when uncertain.

## What it refuted (the diagnosis was WRONG on its central premise)

1. **CRITICAL — the backfill is NOT done.** v1 read `served = 132,690` and concluded 044's four
   `UPDATE` legs had run. Measured per leg against 044's own predicates:
   Leg 1 = 0 rows remaining · Leg 2 = 0 · **Leg 3 (sermon) = 162,507** · **Leg 4 (theology) =
   33,578**. Legs 1–2 finish instantly *because already satisfied*, which is what made the proxy
   convincing. `pg_stat_activity` caught the CI session 650 s into Leg 3 on `Neon/PS_ReadIO`.
   **The job has never reached a `CREATE INDEX` statement.** v1's T1 therefore fixed nothing.
2. **CRITICAL — T1's ordering was harmful.** 044's five partial indexes carry `served` in their
   predicates. Building them before the backfill removes HOT eligibility for `served=false→true`,
   forcing 196,085 row updates to maintain twelve indexes including three multi-GB HNSW.
   Backfill first, then indexes — which is 044's own file order. Running the *tail* was the error.
3. **CRITICAL — T1 was livelocked, and v1 misread the livelock as progress.** v1's build sat 558 s
   in `pg_stat_progress_create_index.phase = 'waiting for writers before build'` behind CI's Leg 3
   `UPDATE`. Two writers on one target with no lock — AGENTS.md's one-writer rule broken against a
   database instead of a tree.
4. **HIGH — the invalid-index guard already exists, on the production path.**
   `apply-migration-concurrent.mjs:93-102` (pre-clean) and `:113-126` (assert, ledger gated).
   v1's grep was scoped to `db/migrations/*.sql`, where it was never expected to live. The gap is
   `apply-pending.mjs` only, which refuses production by construction — so this is CI-only, and
   v1 inverted the severity.
5. **HIGH — v1's own status board was an unearned green**: "T2/T3 implemented with red-proofs"
   while `apply-pending.mjs` was unmodified.

## What it confirmed

- The named culprit file (044) and the timeout line, verbatim against run 32108864575.
- The workflow comment blames the wrong files — and is wrong in more ways than v1 said: **114 is
  free** (predicate matches 0 rows), and there are **four** GIN rebuilds pending, not three.
- `APPLY_PENDING_FORGET` deletes 044's ledger row every run, so its removal is a **precondition**
  for convergence, not a reward for one. v1 sequenced it backwards.
- No checksum/ledger integrity hazard from out-of-band application; no production risk realized
  (both runners gate on `isAuditAllowedHost`, which refuses `ep-odd-fog`).
- `commentary_entries` is **191,749** rows / 754 MB — not the 162k the workflow comment carries.

## New defects it found

- **T2 must not blind-drop**: the only invalid index during review was v1's own in-flight build.
  `apply-migration-concurrent.mjs:93-102` carries this flaw today. Check
  `pg_stat_progress_create_index` before dropping.
- **Session-state leak**: one client for the run, `SET` outside `SET LOCAL` persists, so `112`'s
  `lock_timeout='2s'` is inherited by 108/109/113/115's `CONCURRENTLY` builds — which 044's own
  header calls flaky-by-design.
- **A second failure waits**: the `DB-backed invariants (real DB)` step is `skipped` in all 40
  recent runs; 115 invariant files have not executed against a database in that window.
- v1 used an ad-hoc shell `case` guard rather than `scripts/lib/target-guard.mjs`, the exact
  fail-open shape that module exists to replace.

## Disposition

v1 aborted and rolled back: build killed, leftover invalid index dropped, branch verified as found
(`invalid indexes: none`, `044 indexes present: 0`). Diagnosis rewritten as v2 with the errors
marked **[v1 WRONG]** in place rather than silently corrected.
