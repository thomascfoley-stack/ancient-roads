# halfvec served indexes — design

**Status: DESIGNED, NOT APPLIED, NOT SHIPPED.** Filed 2026-08-21 against `208aef8`. The migration
is `db/migrations/121_halfvec_served_indexes.sql.draft` — a `.draft` suffix, so
`db/apply-pending.mjs` (which filters `/^\d+_.*\.sql$/`) cannot pick it up. Same pattern as
`013_user_corpus.sql.draft`. **Nothing in this design has run against any database.**

Lane A (corpus/retrieval). Companions: ADR-025 (zero-window index policy), ADR-019 (no re-embed),
`docs/PHASE_A_DIAGNOSIS.md`, `.claude/skills/quality-slice/SKILL.md`.

---

## 1. The claim, and the arithmetic

A `vector(1024)` datum is `4 + 1024×4 = 4,100` bytes. A `halfvec(1024)` is `4 + 1024×2 = 2,052`.
An HNSW graph stores the vectors it indexes, so **an index over the half-precision expression is
roughly half the size of the same index over the full-precision column.**

Why that is a dollar question here rather than a tidiness one, from numbers already in the repo:

- `WORKLOG.md:541-546` measures `embeddings` at **1,113,390 rows / 19 GB** with **five** served
  HNSW indexes plus the never-dropped full-table `idx_embeddings_vector`.
- The 08-19 flip runs recorded wait events dominated by Neon page-server reads
  (`Extension/Neon/PS_ReadIO` → `FileCache_Read`): index pages crossing the network until the
  local file cache warms. That is the mechanism behind the **18.2 s cold-start retrieve** recorded
  in the B2 latency measurement.
- `docs/ARCHITECTURE.md` budgets **~$110/mo for Neon Large** on the premise that "the full
  embedding index must live in RAM".

Halving the resident index set is the cheapest lever on all three, and unlike a model change it
touches no vector data: the `embedding` column stays `vector(1024)` at full precision.

## 2. Why this is a RETRIEVAL change, not an index change

This is the part that makes it gated, and it is the thing the original recommendation understated.

Postgres uses an expression index only when the query contains the **same expression**. So:

```sql
CREATE INDEX ... USING hnsw ((embedding::halfvec(1024)) halfvec_cosine_ops) WHERE ...
```

is dead weight unless every query that should use it is rewritten from

```sql
ORDER BY embedding <=> $1::vector
```

to

```sql
ORDER BY embedding::halfvec(1024) <=> $1::halfvec(1024)
```

Two consequences:

1. **Building the indexes without the query change is pure cost** — hours of build time and
   gigabytes of storage for something nothing reads. The two halves ship together or not at all.
2. **The rewritten query ranks on half-precision distances**, so the candidate pool can differ from
   today's. That is a retrieval change under CLAUDE.md's Definition of Done, which requires the
   accuracy diagnostic re-run and recorded. **This is why the migration is a draft.**

Note what is *not* at risk: the stored vectors are untouched, so this is fully reversible by
dropping the indexes and reverting the query — unlike a model swap, which overwrites the only copy
(ADR-019).

## 3. Call sites that must change with it

Derived by grepping for the distance operator against `embeddings`, not listed from memory:

| Site | Function | Index it must imply |
|---|---|---|
| `web/src/lib/teacher/routing.ts` | `legalBasePoolSql` | `idx_embeddings_served_legal` |
| `web/src/lib/teacher/routing.ts` | `lanePoolSql` / `laneOnRangeSql` | the four lane indexes |
| `web/src/lib/teacher/routing.ts` | `injectionSql` | btree range scan — **no change** (not an HNSW path) |
| `web/src/lib/user-corpus/suggested-readings.ts` | queued sweep | **no change** — it deliberately sets `enable_indexscan = off` and does an exact scan |
| `web/src/lib/user-corpus/related-voices.ts` | hymn/poetry sweeps | **blocked** — see §6 |
| `web/src/lib/history-search-db.ts` | history vector leg | different table (`history_embeddings`); out of scope here |

`legalBasePoolSql`'s two conjuncts are byte-matched to the index predicate on purpose, and
`test/invariants/legal-hnsw-index-sync.test.ts` enforces that. **That guard must be extended to the
expression as well as the predicate**, or the treadmill it exists to stop simply moves from the
`WHERE` clause to the `ORDER BY`.

## 4. Pre-registered measurement (write this down BEFORE the run)

The label eval is the wrong primary instrument here. This change cannot make retrieval *smarter*;
it can only make it *differ*. So the sharp question is agreement, not accuracy, and it is cheaper
and more sensitive:

**Primary — rank agreement, pre-registered bars:**

- Over **≥200 queries** (the v3 dev set plus real questions from `ask_outcomes`), run the base pool
  twice — once through today's fp32 SQL, once through the halfvec SQL — against the same database
  at the same `ef_search`.
- **Bar A:** the top-20 candidate pool is set-equal on **≥99%** of queries.
- **Bar B:** the final top-6 voices after rerank/floor/diversity are identical on **≥99.5%** of
  queries.
- **Bar C:** total size of the five served indexes falls by **≥40%** (`pg_relation_size`).
- **Bar D:** p50 retrieve does not regress.

**Secondary, and only if Bar A or B misses:** run the v3 dev set through the full compose→verify
loop and require **no category regression**. Do not use frozen v4 — it was run once, untuned, and
spending it on a no-regression check burns a held-out set for a question a dev set answers.

**Ship rule:** all four bars clear → ship. Bar A or B misses → the secondary decides, and a
regression in any category kills it. Record the numbers in `WORKLOG.md` either way, including a
kill.

### 4a. Early measurement on dev (2026-08-21) — Bars A and B look clear, with one gap

Read-only on `~/.neon_dev_url`, 131,569 rows in the served legal pool, `hnsw.ef_search=200`,
8 probe vectors drawn deterministically (`ORDER BY md5(source_id||'salt')`):

| quantity | result |
|---|---|
| top-20 **set** overlap (Bar A) | **20/20 on 8 of 8 probes** |
| top-6 set overlap (proxy for Bar B) | **6/6 on 8 of 8** |
| top-20 order identical | **20/20 on 8 of 8** |
| max abs distance error, fp32 vs halfvec | **1.41 × 10⁻⁵** |
| smallest adjacent gap within a top-50 | **7.35 × 10⁻⁶** |

**The mechanism, stated so nobody reads this as "half precision is free":** the quantization error
is *larger* than the smallest gaps between near-tied neighbours, so halfvec genuinely can reorder.
Measured over a top-50, it did — 48 of 50 kept their rank, two swapped. **Both swaps were below
rank 20**, in the tail where distances bunch. Inside the pool that feeds composition, nothing moved
on any probe. And the pool feeds a cross-encoder that re-orders everything anyway, so near-tie order
at the retrieval stage is washed out downstream.

**The gap named above is now CLOSED — exact dual scan, 2026-08-21.** The measurements above re-rank
*the candidate set fp32 selected*, so they could not show whether halfvec would pull in a row fp32
ranked below the cutoff. Settled by re-running with `enable_indexscan=off` and `enable_bitmapscan=off`
on **both** arms, so each computes an exact top-20 over all 131,569 rows independently — a scan that
*can* surface a different candidate set:

| probe | top-20 set overlap | order identical |
|---|---|---|
| 1 | **20/20** | **20/20** |
| 2 | **20/20** | **20/20** |
| 3 | **20/20** | **20/20** |

So halfvec selects the same candidates, in the same order, when nothing constrains it to fp32's
choices. Combined with the error/gap arithmetic above, the picture is consistent: the perturbation is
real but ~1.4 × 10⁻⁵, which only reorders items whose true distances are closer together than that,
and no such pair reaches the top 20.

**What is still NOT proven, and why §4 stands.** n = 3 exact and n = 8 indexed are early signals, not
the pre-registered run — Bar A asks for ≥99% over **≥200 queries**, and these probes are corpus
vectors rather than embedded user questions, so they are in-distribution but not query-distribution.
**Bars C (index size −40%) and D (p50 no regression) are entirely unmeasured** and cannot be measured
until the index exists. Nothing here authorizes building anything.

## 5. Apply order (ADR-025 zero-window)

Per-index, never drop-first: `CREATE INDEX CONCURRENTLY` the halfvec twin under a new name → verify
`VALID` and `READY` → ship the query change → confirm the planner uses the twin with `EXPLAIN` →
`DROP INDEX CONCURRENTLY` the fp32 original. The old index serves throughout. Applied only via
`db/apply-migration-concurrent.mjs`, which splits on `--SPLIT--` because `CONCURRENTLY` cannot run
inside a transaction block.

**Requires pgvector ≥ 0.7.0** for the `halfvec` type.

**CLEARED ON DEV, 2026-08-21** — read-only, `~/.neon_dev_url`:

```
vector 0.8.1        pg_trgm 1.6        halfvec type present: t
```

**PROD STILL UNVERIFIED** (bylaw 7 — owner go per occasion). Dev being 0.8.1 makes prod very likely
but does not prove it; a branch carries the extension version it was cut with. Settle before applying:

```sql
SELECT extversion FROM pg_extension WHERE extname = 'vector';
```

## 6. Out of scope, and one thing worth more

- **`related-voices.ts` is blocked, not skipped.** Its query carries no `source_type` conjunct, so
  it implies none of the five partial indexes and can only be served by the full-table
  `idx_embeddings_vector` — which is ~8 GB, roughly 60% of the footprint, and is the *only*
  shipped consumer of that index. **Fixing that query is worth more than this entire design**: it
  makes the 8 GB index droppable, which is a bigger saving than halving the other five, and it also
  fixes a panel that is currently returning about one row where it should return dozens. Do that
  first; it needs no accuracy gate because the query is broken today.
- `history_embeddings` (migration 120) is greenfield and tens of MB. Not worth the change yet.
- The `embedding` column type stays `vector(1024)`. Converting it would be a full-table rewrite and
  would **destroy the fp32 originals** — irreversible precision loss, and it would make any future
  re-index at full precision impossible. Never do this.
