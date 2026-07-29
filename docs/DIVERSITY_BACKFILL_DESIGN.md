# Author backfill on surfaced passages — design (for approval)

**Status:** MEASURED-REGRESSED 2026-07-10 — built as approved (Option C), re-measured on the whole frozen
v2, and it **regressed** topical 65→50 / epistle 72→56 (see WORKLOG). Root cause: `selectDiverse` caps per
*author* not per *passage*, so backfill collapses the top-K onto the single #1-reranked chapter (off-target
on diffuse queries). Slice stashed (`git stash@{0}`); production stays at the pre-backfill 65/72. The right
correction is a **per-passage cap in selection** — a new design, deferred (post-beta GA per strategy).
~~DRAFT — awaiting owner approval before code (design-before-code rail).~~
**Slice:** the ACTIVE-JOB step-1 retrieval fix — the `surfaced=1` half of the frozen-v2 gap.
**Scope:** `web/src/lib/teacher/routing.ts` (shared) + its two callers. Retrieval-only; the
JSON contract + fail-closed verifier are **untouched** (concordance guarantee holds).

## Problem (measured, from the ≥2-available split — WORKLOG 2026-07-10)

The whole topical/epistle HIT@2 gap is retrieval-limited (content-limited = 0; every label has
≥2 PD authors available). The 14 misses cleanly halve:

- **surfaced=0 (7)** — the on-doctrine passage never reaches the reranked top-K. → reranker
  semantic-drift, **deferred to post-beta** (needs an independent doctrine map; not this slice).
- **surfaced=1 (7)** — the right passage **IS** in the reranked top-K, but only **1** author on it,
  even though a 2nd distinct author exists in the corpus on that same passage. **This slice.**
  Queries: `f-tp-01` sovereignty, `f-tp-03` repentance, `f-tp-05` forgiveness, `f-tp-17` angels,
  `f-ep-03` union, `f-ep-17` resurrection-of-body, `f-ep-19` indwelling-Spirit.

## Root cause

`selectDiverse(cap=2)` can only promote a 2nd author that is **already in the reranked list**.
On a diffuse topical query the reranker fills the pool with the *leading* author's several
near-passage notes; the 2nd distinct author's best entry on the same passage sits **below the
CANDIDATE_POOL=20 / selection cut**, so `selectDiverse` has nothing to promote. Enlarging the pool
was already measured to recover nothing (WORKLOG 2026-07-10 DILUTION) — the fix is not "more pool",
it is **targeted author-diversity injection on the passages retrieval already surfaced.**

## Proposal — post-rerank, pre-selection author backfill

Add one bounded step between rerank/floor and `selectDiverse`, in shared `routing.ts`:

1. **Identify surfaced passages** — the distinct *chapter keys* (`verseId/1000` = book·1000+chapter)
   among the current top-`limit` (=6) reranked-and-floored entries. Label-free — it uses only what
   retrieval itself returned, so **no external doctrine map, no circularity, no drift risk**.
2. **Fetch the 2nd+ voices on those passages** — one range query (the 007 verseId index) returning
   the **top-by-vector entry per (chapter, author)** across those chapters, from the same corpus
   filter as the base pool:
   ```sql
   SELECT DISTINCT ON ((metadata->>'verseId')::int/1000, metadata->>'author')
          source_id, content, metadata, 1-(embedding <=> $1::vector) AS score
   FROM embeddings
   WHERE user_id IS NULL AND source_type='commentary' AND <corpusFilter>
     AND (<verseId BETWEEN chapter*1000+1 AND chapter*1000+999  OR ...>)
   ORDER BY (metadata->>'verseId')::int/1000, metadata->>'author', embedding <=> $1::vector
   ```
   Ordering by `embedding <=> vec` within each (chapter,author) self-selects the *on-topic* verse in
   the chapter, so backfill can't drag in an off-topic corner of the chapter. Bounded: ≤ (#chapters
   in top-6) × (9 authors) candidates, realistically far fewer.
3. **Insert each missing author adjacent to its same-chapter sibling** — de-dup by `source_id`
   (already-present win), then place each fetched entry immediately after the first reranked entry on
   its chapter. The backfilled voice inherits a rank just below the passage's lead voice — a
   principled position (same passage, comparable relevance), with **no rerank-score mixing**.
4. **`selectDiverse(cap=2)`** as today — now the 2nd voice on a surfaced passage is present *and*
   positioned to survive selection. On-reference (floored) voices stay exempt.

Shared-module discipline (the parity pattern): the SQL builder + the pure insert/merge logic live in
`routing.ts`; each caller does its own DB fetch (production's is `server-only`). So the eval measures
the exact shipped selection.

## Options considered
- **(C) position-adjacent insert (recommended)** — above. **0 added rerank calls**, one bounded DB
  range-scan. Directly targets "2nd voice sits behind the 1st on the surfaced passage."
- **(A) merge-then-re-rerank** — inject the fetched voices and rerank the enlarged pool again. Cleaner
  comparable scores, but **+1 rerank call on the request path** per query. Fallback if C's positional
  heuristic proves fragile in the frozen-v2 re-measure.
- **Bigger CANDIDATE_POOL** — measured to recover nothing, ~2× rerank latency. Rejected on data.

## Measurement (the gate — deterministic ⇒ one run is exact)
Re-run the **WHOLE frozen v2** (`eval-heldout.mts --frozen`, hash `56c00104…`, read-only, no
query/label edits) through the shared path:
- **Recover:** the 7 `surfaced=1` queries → HIT@2 pass (2nd voice present). Expected ceiling
  (hypothesis, not a promise): topical up to 17/20 (≈85%), epistle up to 21/25 (≈84%).
- **Hold (no regression):** verse-ref HIT@1 100%, pericope, proper-noun, controls 0 hijacks,
  no-content 0%. Watch that adjacent-insert doesn't push an on-target entry out of the top-K.
- `surfaced=0` stays unfixed **by design** (no passage to backfill) — not this slice's job.
Report per-category vs the pre-registered bars in WORKLOG.md; then STOP.

## Request-path cost
+1 bounded DB range-scan (007 index), 0 extra rerank (option C). ~0 net on latency.

## Out of scope
- `surfaced=0` reranker semantic-drift (independent doctrine map; post-beta).
- Any corpus ingest (content availability already ≥2 everywhere).
- The fresh **v3** held-out (the real ship gate; frozen v2 is a dev set — this re-measure informs,
  it does not gate beta).
- Contract / verifier / faithfulness path (never touched here).

## Approval asks
1. **Option C (position-adjacent, 0 extra rerank) vs A (re-rerank, +1 call)?** — recommend C.
2. **Backfill target = distinct chapters in the top-`limit` (6) reranked entries?** (vs top-1/top-2 only.)
3. **Cap unchanged at `AUTHOR_CAP=2`** for the enlarged list? — recommend yes.
