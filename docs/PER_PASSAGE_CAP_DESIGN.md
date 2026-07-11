# surfaced=1 fix — per-passage cap + on-passage backfill (Phase A item 2)

**Status:** design for the item-2 attempt (WORKORDER_PHASE_A §1). Mechanism owner-specified.

## Problem (7 failures)
The on-target passage reaches the reranked top-6, but only **one** author is on it; the 2nd distinct voice
**exists in the legal corpus but is not in the candidate pool** (below the CANDIDATE_POOL=20 vector cut), so
`selectDiverse` has nothing to promote. HIT@2 needs ≥2 distinct authors on-target ⇒ these fail.

## Prior attempt (why it regressed) — do not repeat
Backfill the 2nd voice + **per-AUTHOR** cap. Because the cap was per-author, 6 distinct-author voices from the
**#1 reranked chapter** all passed the cap → the top-6 collapsed onto one chapter (often off-target) →
topical 65→50. The cap dimension was wrong.

## Fix — two parts
1. **On-passage backfill (get the 2nd voice into the pool).** After rerank + floor, for the distinct
   **chapters** among the top-`limit` entries, fetch the top-by-vector entry per (chapter, author) over the
   legal corpus (007 index range-scan), and splice each missing author in **adjacent to its chapter's lead**.
   Label-free (only passages retrieval already surfaced) — no circularity.
2. **Per-PASSAGE cap in selection** (the correction). `selectDiverse` caps at `PASSAGE_CAP=2` voices **per
   chapter** in the top-K (was per-author). On-reference (floored) voices stay exempt. This lets the 2nd voice
   onto the target passage **while preserving cross-passage coverage** — the top-6 can hold at most 2 per
   chapter, so it can never collapse onto one chapter. Deferred items backfill to fill K.

## Interfaces (`web/src/lib/teacher/routing.ts`, single-sourced; both prod + eval)
- `chapterKeysOf(entries, chapterKey)` · `diversityBackfillSql(chapterKeys, corpusFilter)` ·
  `insertBackfill(ordered, fetched, id, chapterKey, author)` — the backfill (pure + the SQL builder).
- `selectDiverse(ordered, k, chapterKey, onRef, cap=PASSAGE_CAP)` — cap dimension changed author→chapter.
- Wired identically into production `retrieveCommentary` and the eval `retrieveLegal`.

## Measurement (the gate — deterministic, one run exact)
Re-measure the **WHOLE frozen v2** (`--frozen`): recover the 7 surfaced=1 (topical/epistle HIT@2 up), **zero
regression** on verse-ref / pericope / proper-noun / controls / no-content. Report p50/p95 of retrieval.
Then DoD: `npm run audit`, `/audit`, **interpretation_bait ≥99% LIVE** (harness), record in WORKLOG +
WORKORDER_PHASE_A §2. surfaced=0 is NOT addressed here (item 3).

## Request-path cost
+1 bounded DB range-scan (007 index) for the backfill; selection is pure reordering. Latency measured pre/post.

## Out of scope
surfaced=0 reranker-drift (item 3); the corpus-wall case (item 4).
