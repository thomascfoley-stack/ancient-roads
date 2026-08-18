# CI `db-invariants` — diagnosis, treatment, evidence

**Filed 2026-08-18.** Owner instruction: *"CI run the test and name the culprit, then apply the
same logic of the corpus to it"* — diagnose, propose treatment, have someone else confirm it,
apply, then test/fix until the loop closes.

> **v2, after independent review. v1's central premise was measurably FALSE and its first
> treatment was actively harmful.** The review is the reason this document is worth anything;
> the corrections are marked **[v1 WRONG]** in place rather than quietly rewritten, because a
> diagnosis that hides its own errors teaches the next reader to trust the wrong things.

## 1. The symptom

`db-invariants` has failed **every run back to 2026-08-15** — zero successes in the last 100
(`gh run list --workflow=audit.yml --limit 100`). `audit` is green throughout, so "nothing merges
red" has been resting on one of two jobs for days.

## 2. The culprit file, NAMED

Run [32108864575](https://github.com/thomascfoley-stack/ancient-roads/actions/runs/32108864575):

```
07:19:30  ▶ 12 pending: 044_embeddings_served_expand.sql, 045_…, 107_…, … 116_…
07:19:30    ▶ applying 044_embeddings_served_expand.sql …
07:49:42  ##[error]The action 'apply pending migrations…' has timed out after 30 minutes.
```

**Migration 044 alone consumes the entire budget.** 045–116 never execute. This is the first run
that could say so — the `▶ applying <file> …` line was added the same morning; before it the step
produced 30 minutes of silence and named nothing.

**The workflow comment blames the wrong files** (`audit.yml:181-188`): it attributes the 10→30
minute rise to 113/114/115. Those never run. Worse than v1 said — review finding 13 measured 114
as **free** (its predicate `served AND source_type='historian'` matches **0** rows), so the comment
is wrong on the file, the count and the cost.

## 3. WHY, corrected

### [v1 WRONG] What v1 claimed

> "044's `ALTER` and its four backfill `UPDATE`s are **already done** … What remains is the tail:
> four HNSW `CREATE INDEX CONCURRENTLY` builds."

**False, and the error is instructive.** v1 measured `served = 132,690` and concluded the backfill
had run. `served` is a **proxy**, not the property: it counts rows already true, including the
pre-cutover population, and says nothing about how many rows each leg still has to update. The
property is *"how many rows still match this leg's `WHERE`"*, and nobody asked it — including of
`scripts/verify-served-backfill.mjs`, the instrument this repo built to answer exactly this.

### What is actually true (review, measured per leg against 044's own predicates)

| 044 backfill leg | rows still matching `NOT served` |
|---|---|
| Leg 1 — exegetical (`044:95`) | 0 |
| Leg 2 — song/verse (`044:108`) | 0 |
| **Leg 3 — sermon (`044:114`)** | **162,507** |
| **Leg 4 — theology (`044:122`)** | **33,578** |

Legs 1 and 2 finish instantly *because they are already satisfied*, which is exactly what made the
proxy look convincing. **Legs 3 and 4 have never completed on this branch.** `pg_stat_activity`
caught the CI session 650 s into Leg 3, waiting on `Neon/PS_ReadIO`. **The job has never reached a
`CREATE INDEX` statement at all.**

Branch facts (`ci-test-20260729` / `ep-tiny-bonus-at3izo3y`, a **test** branch — bylaw 7 covers
`ep-odd-fog` and is not engaged): `embeddings` 420,974 rows / 813 MB heap; `commentary_entries`
**191,749** rows / 754 MB (not the 162k the workflow comment carries — another uncited number);
`idx_embeddings_vector` 3,878 MB, `_sermon` 1,279 MB, `_legal` 1,008 MB.

Nothing is recorded on timeout, so every run redoes the same work from zero. **The job has never
converged and cannot** — no timeout value fixes a step that repeats one-time work every run.

`APPLY_PENDING_FORGET: 44,45` is not merely a red herring (v1's reading): it **deletes 044's
ledger row on every run**, so even a run that finished would be undone by the next one. Its comment
justifies itself with "the column read says `embeddings.served` is absent" while `describe-target`
prints `044: ALL PRESENT` **30 seconds earlier in the same job**. Note `describe-target.mjs:73-77`
checks the *column* only and says nothing about indexes or backfill completeness.

## 4. The `CONCURRENTLY` hazard — real, but v1 put it on the wrong path

The mechanism is sound and was red-proofed on a throwaway PG17 (400k rows), every step observed:
interrupt a build → `indisvalid=f`; re-run → `NOTICE: … already exists, skipping` → `CREATE INDEX`,
**exit 0**, still invalid; planner → `Parallel Seq Scan`; and 108/109/113/115's next statement drops
the working predecessor. End state: no usable index, success reported, green ledger row.

**[v1 WRONG] "no validity check anywhere … a production hazard, not a CI one."**
`db/apply-migration-concurrent.mjs:93-102` already drops invalid leftovers and `:113-126` asserts
`indisvalid`/`indisready` with the ledger write gated behind it (2026-07-18 deep audit). Every one
of these migrations names that runner in its own header. **That runner is the production path.**
v1's grep was scoped to `db/migrations/*.sql`, where the guard was never expected to live —
MASTER's sixth watchlist shape: an instrument's blind spot recorded as a property of the world.

The gap is **`db/apply-pending.mjs:208-214` only**, which refuses production by construction. So
this is a CI-only defect, not a production one. v1 inverted the severity.

Also corrected: the hazard applies to **108/109/113/115** (all four have the
create-`_vN` → drop-old → rename shape), **not** to 044 or 114, which drop and rename nothing.

## 5. Treatment (v2)

**T0 — remove `APPLY_PENDING_FORGET: 44,45` FIRST.** v1 deferred this until "a run is green,"
which is backwards: while it is present, any completed 044 is deleted before the next run. It is a
**precondition** for convergence, not a reward for it.

**T1 — apply the heavy migrations out of band, via the repo's own runner, in file order.**
[v1 WRONG] v1 ran only 044's `CREATE INDEX` tail through ad-hoc `psql`. Three defects, all caught
by review:
- **Order inverted.** 044's five partial indexes have `served` in their predicates. Building them
  before the backfill makes `served=false→true` updates ineligible for HOT, forcing 196,085 rows
  to maintain twelve indexes including three multi-GB HNSW. It would have made the blocking
  statement dramatically worse. **Backfill first, then indexes** — which is 044's own file order,
  so running the *whole file* is right and running the *tail* was wrong.
- **Livelocked, and observed to be so.** v1's build sat 558 s in
  `pg_stat_progress_create_index.phase = 'waiting for writers before build'` behind CI's Leg 3
  `UPDATE`, on a shared target with no lock — while v1 read "still on the first index" as progress.
  It was never building. AGENTS.md's one-writer rule, broken against a database instead of a tree.
- **Ad-hoc guard.** A shell `case` on the connection string, the exact fail-open shape
  `scripts/lib/target-guard.mjs:1-18` exists to replace (case-sensitive on a DNS label; substring
  match against a whole string, password included). No production contact occurred and the endpoint
  was verified as `ep-tiny-bonus`, but the guard used is not in the repo, so it cannot be reviewed.
  **Use `db/apply-migration-concurrent.mjs`** — it carries the endpoint guard, the invalid-index
  pre-clean, the validity assert, and the ledger write.

**T2 — extract the guard, do not copy it.** `apply-pending.mjs` needs
`apply-migration-concurrent.mjs`'s pre-clean/assert. Writing it a second time creates a second
thing to drift, which is what this repo's sync guards exist to prevent. Extract into `db/lib/`,
have both runners call it, and **gate the ledger write on the assert** — the damage in §4 is the
green ledger row, not the missing warning.

**T2a — the pre-clean must not drop a LIVE build.** Review finding 5: the only invalid index on the
branch during the review was v1's own in-flight build, and a pre-clean firing then would have
wedged, or dropped a freshly built valid index once the lock released.
`apply-migration-concurrent.mjs:93-102` carries this flaw today. Refuse when
`pg_stat_progress_create_index` shows an active build on the relation, rather than dropping blind.

**T3 — per-statement timing.** §2 was answerable only because of a per-file line; a step that dies
inside a 6-statement migration should name the statement. Review calls this the one treatment to
keep unchanged and do **first**, because it is what would size the remaining work.

**T4 — session-state leak** (review finding 12). `apply-pending.mjs:67-71` uses one client for the
run and `SET` outside `SET LOCAL` persists. `112:1` sets `lock_timeout='2s'`, which 108/109/113/115
then inherit for their `CONCURRENTLY` GIN builds — and `044:78-84` states in its own header that a
short `lock_timeout` during a CIC is flaky-by-design. Reset per file.

**T5 — a second failure is waiting.** Review finding 11: the `DB-backed invariants (real DB)` step
is `skipped` in all 40 recent runs, so 115 invariant files have not executed against a database in
that window. Getting migrations to apply is step one of an unknown number.

## 6. Status

- T0: **not yet applied.**
- T1: **v1 attempt ABORTED and rolled back** — build killed, leftover invalid index dropped, branch
  left as found. Not yet re-run in the corrected order.
- T2/T2a/T3/T4/T5: **not implemented.** [v1 WRONG] v1's board claimed "T2/T3: implemented with
  red-proofs" while `apply-pending.mjs` was unmodified — an unearned green, in the document whose
  subject is unearned greens.

## 7. Evidence

- §4 red-proof: executed on a throwaway PG17, each step observed. Log below.
- §3 measurements: read-only against the test branch, per-leg against 044's own predicates.
- Review: `docs/evidence/ci-db-invariants-2026-08-18/review-findings.md`.

---

## 8. MEASURED 2026-08-18 18:21 UTC — the blocker is a LIVE build, not an orphan. WAIT.

The lock-holder diagnostic (`db/apply-pending.mjs`, run 32170461224) answered the question this
document exists to ask, on its first real run:

```
  ✗ 044_embeddings_served_expand.sql failed: canceling statement due to lock timeout
  ⓘ 3 other non-idle backend(s) on this database:
     pid 9596   active  age 00:03:46  -/-
       -- idx_embeddings_served_legal — the composed /ask exegetical pool …
     pid 17659  active  age 00:03:46  Extension/Neon/PS_ReadIO
       -- idx_embeddings_served_legal …
     pid 17658  active  age 00:03:46  -/-
       -- idx_embeddings_served_legal …
```

**All three run the same statement** — 044's first HNSW build, `idx_embeddings_served_legal` — as a
leader plus two parallel workers, one of them inside Neon's pageserver read path. Same age to the
second. That is a build **in progress and doing I/O**, not a wedged or orphaned backend.

So the action is **WAIT**, and that is the whole value of the line: `canceling statement due to lock
timeout` is identical whether the branch needs another few minutes or needs a human to terminate a
zombie, and the two ask for opposite things. Before this, the only way to choose was to guess — and
the previous two guesses were both wrong (30-minute slow build; 113/114/115, which had never run).

**The structural defect this exposes, and it is worse than the symptom.** The 30-minute
`timeout-minutes` kills the *client*; the server-side `CREATE INDEX CONCURRENTLY` carries on. So a
timed-out run leaves a build running, the next run's `ALTER TABLE` cannot get ACCESS EXCLUSIVE
against it, and — because runs can overlap the build even when the job's concurrency group
serialises the *jobs* — each attempt can start yet another build over the same table. The step does
not converge by retrying; retrying is what sustains it. The ledger records nothing either way,
because `recordMigration` runs only after the file completes.

**Therefore:** 044 must be completed ONCE, out of band, and allowed to finish (it is `IF NOT
EXISTS` / idempotent, so a completed build makes every later run cheap). CI's step should not be
the thing that starts it. Until the in-flight build finishes and its ledger row lands, every
db-invariants run will fail in ~5s on this lock, and that failure is now self-describing rather
than mute.

**Not claimed:** that this makes the job green. It does not. It makes the red decidable.

