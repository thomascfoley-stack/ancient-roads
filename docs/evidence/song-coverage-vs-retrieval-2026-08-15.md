# The Song's coverage/retrieval "gap" — measured, and mostly RETRACTED

Measured 2026-08-15 against dev (`ep-tiny-hat`), read-only. **This file's first version claimed a
defect that the measurement does not support. That claim is withdrawn here, with the numbers.**

## What the first version said, and why it was wrong

> "`verse_coverage` reads 117/117 verses at ≥2 authors; retrieval delivers ≥2 on 12/117."

Both halves were **per-verse** counts. **Neither mechanism operates per verse**, so the comparison
measured a proxy and the conclusion was drawn wider than the evidence — the exact failure
`quality-slice` step 0 exists to catch ("name the artifact… is it the one the code path actually
reads?"). What the two mechanisms actually do:

- **The Plans gate** — `checkScopeCoverage`, [`web/src/lib/plan/store.ts:46`](../../web/src/lib/plan/store.ts):
  `WHERE EXISTS (SELECT 1 FROM verse_coverage c WHERE c.author_count >= 2 AND c.verse_id BETWEEN
  d.vs AND d.ve)` — per **reading-day range**, "does this range contain ANY qualifying verse", and
  it refuses only when `covered * 2 < days.length`, i.e. fewer than **half** the days. It never
  asked for per-verse ≥2.
- **Retrieval's on-range injection** — `injectionSql`, `routing.ts`:
  `(metadata->>'verseId')::int BETWEEN r.start AND r.end` — per **requested passage range**.

## Apples-to-apples, at the granularity both actually query

Per Song chapter, distinct **served** authors from verse-keyed exegetical rows in that range:

| chapter | verses coverage calls ≥2 | distinct served authors in range | who |
|---|---|---|---|
| 1 | 17 | 3 | Gill, John + Jamieson, Robert + Schaff, Philip |
| 2 | 17 | 3 | Gill + Jamieson + Schaff |
| 3 | 11 | 2 | Gill + Jamieson |
| 4 | 16 | 3 | Gill + Jamieson + Schaff |
| 5 | 16 | 2 | Gill + Jamieson |
| 6 | 13 | 3 | Gill + Jamieson + Schaff |
| 7 | 13 | 2 | Gill + Jamieson |
| 8 | 14 | 2 | Gill + Jamieson |

**8 of 8 chapters carry ≥2 distinct served authors, and coverage agrees.** The two models do not
disagree at the granularity either one uses. **There is no defect to fix here.**

## The one real residue, bounded and failure-coded

**6 Song verses** — 4:14, 6:6, 6:7, 6:9, 7:6, 7:12 — are credited by `verse_coverage` with 2
authors but have **zero verse-keyed served row**. Canon-wide the same shape is **541 of 28,598**
verses that coverage calls ≥2 authors — **1.9%**.

**Failure code: not `no-content`.** The sections exist and genuinely cover these verses; both
anchors over Song 4:14 are chapter-scoped —

| verse_id_start | verse_id_end | slug |
|---|---|---|
| 22004001 | 22004999 | `gill-song` |
| 22004001 | 22004016 | `jamieson-jfb` |

— so this is a **keying-granularity difference**: a section anchored across a chapter yields
embedding rows carrying one representative `verseId`, and a verse-scoped query for 4:14 produces
the range `[22004014, 22004014]`, which a row keyed `22004001` does not fall in.

Consequence, stated no wider than the evidence: **a query naming exactly one of those verses gets
nothing from the on-range injection path.** The base semantic pool carries no `verseId` predicate
and is unaffected, so the answer is not starved — but what the base pool returns for such a query
was not measured, and is not claimed here.

## Not fixed, deliberately

Closing the 1.9% means changing the injection predicate to match through `section_anchors` ranges
rather than the single `verseId` key, or re-keying embeddings per verse at ingest. **Either is a
retrieval change**, which under `CLAUDE.md` requires a design doc, pre-registered per-category
bars, a fresh held-out run, and owner approval — not a late-night edit. Filed, with the number
attached so the decision has a size: **1.9% of ≥2-author verses, affecting verse-scoped queries
only.**

## What should change in how these numbers get quoted

`verse_coverage` counts **anchor ranges** admitted by `status='published'`; retrieval counts
**verse-keyed rows** admitted by `served`. They answer different questions and both are correct.
State which table produced a number. The specific error to avoid is the one made here: comparing
them **per verse** when both mechanisms operate on **ranges**.

## Method note

Reads only; no write was made by this measurement. Production was NOT read (bylaw 7) — every
number is dev.
