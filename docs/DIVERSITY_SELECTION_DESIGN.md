# Diversity-aware final selection — design (for approval)

**Status:** APPROVED + BUILT 2026-07-10 (per-author cap, AUTHOR_CAP=2, floor-first-then-cap).
`selectDiverse` in shared `routing.ts`; wired to production + eval; tests 8/8. Result: topical
HIT@2 60→65 (dilution undone), epistle 72 held (+12), verse-ref HIT@2 →93; pericope HIT@1 73
(ingest side-effect, unchanged by cap). See WORKLOG 2026-07-10. Next gate = fresh v3 held-out.

## Problem (measured, deterministic — variance ~0)
Adding Barnes/Wesley/Calvin (author-diversity ingest) gave a real **epistle HIT@2 +12**
(60→72, same index) — the added voices land on-target for specific-passage epistle queries.
But on **diffuse topical** queries it **regressed −5** (65→60) and **pericope HIT@1 −7**
(HIT@2 held): the reranker fills the top-6 with multiple **same-author, near-passage**
entries that outrank the *second distinct author* on the target passage, so a query that had
2 on-target voices drops to 1 (`<2-voices`). **Bigger pool does not help** — CANDIDATE_POOL
20→30→40 changed *nothing* (the on-target voice is in the pool; it's the top-6 *composition*
that's wrong). So the lever is **final selection**, not pool size.

## Proposal
Add a **diversity-aware top-K selector** applied to the reranked list when composing the final
`limit` results — a pure reordering, no extra API/DB call:

- **Per-author cap:** at most `AUTHOR_CAP` (proposed **2**) entries from any single author in the
  final top-K. When the reranker's next pick would exceed a cap, skip it and take the next
  distinct-author candidate; if the pool is exhausted, backfill the capped ones. This directly
  forces the second distinct author onto the target passage → restores `≥2 voices`.
- Composition with the existing **floor** (`floorOnRange`, ADR-015): floor first (reserve the
  top on-*reference* slots for referenced queries), then apply the author cap to the remainder,
  so routing and diversity compose rather than fight. Exact order is an approval question.

Lives in the shared `web/src/lib/teacher/routing.ts` (a `selectDiverse` fn) called by BOTH
production `retrieveCommentary` and the eval — the same single-source pattern the parity fix
established, so the measured number can't drift from the shipped selector.

## Why not the alternatives
- **Bigger CANDIDATE_POOL:** measured to recover nothing, and would ~2× rerank latency/query on
  the request path. Rejected on data.
- **Per-passage (verseId) cap instead of per-author:** also plausible ("one passage dominating");
  a variant to measure. Per-author is the more direct fit to the `≥2 distinct voices` guarantee.
- **MMR / embedding-diversity re-rank:** heavier, less interpretable; overkill for a top-6.

## Measurement (the gate)
Deterministic pipeline ⇒ one run per config is exact. Re-run the **whole frozen v2** (hash
`56c00104…`, read-only, no query/label edits):
- **Recover:** topical HIT@2 back to ≥ pre (65) — ideally above, since the voices now exist.
- **Hold:** epistle HIT@2 stays ~72 (+12 preserved); verse-ref/pericope/controls no regression
  (esp. pericope HIT@1 back toward 80).
- Report per-category vs the pre-registered bars.

## Request-path cost
~0 — post-rerank reordering over ≤ CANDIDATE_POOL items, no extra embedding/rerank/DB call.

## Out of scope
- The reranker semantic-drift residual (5/14) — separate query-understanding slice, must use an
  **independent** doctrine→passage source, never the catechism labels (circular).
- OT commentary ingest (Calvin/Wesley OT alignment) — deferred.
- Production deploy — owner-only dogfood until the re-measure clears the bar; no beta.

## Approval asks
1. **Cap policy:** per-author (recommended), per-passage, or both?
2. **Cap value:** `AUTHOR_CAP = 2` in the top-6?
3. **Floor interaction:** floor-then-cap (recommended) or cap-then-floor?
