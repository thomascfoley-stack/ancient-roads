# The Song reads 117/117 on the coverage gate and 12/117 on the retrieval path

Measured 2026-08-15, read-only against dev (`ep-tiny-hat`). No writes were made.

## The two numbers

```
verse_coverage (section_anchors, status='published'):  117 verses, 117 at >=2 authors
retrieval      (embeddings.served, verse-keyed):       111 verses,  12 at >=2 authors
```

Both are correct about what they measure. They do not measure the same thing, and the
Song is the first book where the difference is large enough to matter.

## Why they diverge — two admission models over one corpus

`scripts/rebuild-verse-coverage.ts` admits on **`sources.status='published'`** and sweeps
**`section_anchors`**, which carry a `verse_id_start .. verse_id_end` RANGE. A single
chapter-spanning anchor credits every verse in that range.

`web/src/lib/teacher/routing.ts` admits on **`embeddings.served`** and keys each row to a
SINGLE `metadata->>'verseId'`. A row credits exactly one verse.

Served rows inside book 22, measured:

| work | author | rows | distinct verses |
|---|---|---|---|
| `gill-song` | Gill, John | 1942 | 111 |
| `jamieson-jfb` | Jamieson, Robert | 85 | **8** |
| `schaff-npnf210` | Schaff, Philip | 14 | 2 |
| `schaff-npnf104` | Schaff, Philip | 9 | 2 |
| `schaff-npnf101` | Schaff, Philip | 3 | 1 |

`jamieson-jfb` contributes **8 anchors spanning the whole book** (22001001–22008014) but
only **8 verse-keyed embedding rows**. Coverage credits it with all 117; retrieval can
produce it on 8. Gill carries the real weight — 111 of 117 verses have a served voice,
which is the part of the fix that genuinely landed.

## What is and is not true after the 2026-08-12 Song work

TRUE: the Song is no longer a hole. 111/117 verses carry a served, verse-keyed exegetical
voice where before there were **26 rows of Schaff quoting the Song in passing**.

NOT TRUE: "117/117 verses at >=2 exegetical authors" as a statement about `/ask`. On the
retrieval path it is **12/117**. The `>=2 voices` floor is met on twelve verses.

The `jfb` / `jamieson-jfb` double-count that `routing.ts:69-72` warned about did NOT
happen: `jfb` is now `staged` with 0 served rows and `jamieson-jfb` is published and fully
served, so only one JFB text serves. That resolution is sound and is not in question here.

## The general shape, for the watchlist

**A gate whose admission predicate differs from the shipped serving predicate.** This is
adjacent to the recorded class (a verifier whose expectation is derived from the artifact
under test) but not the same: here neither side is derived from the other, and both are
individually defensible. The defect is that one is quoted as if it were the other.

`verse_coverage` gates Plans, which is a **reading** surface — shelf-readability may be the
right admission rule for it, and `gill-song` is genuinely readable across the book. Nothing
here says the plans-routes flip was wrong. It says the number must not be restated as a
retrieval claim.

## Suggested, not applied

1. Never quote `verse_coverage` counts as `/ask` coverage. Say which table produced them.
2. If the `>=2 voices` floor is meant to hold for the Song on `/ask`, the second voice has
   to be verse-keyed at the row level — 8 rows will not do it. That is an ingest question
   for `jamieson-jfb` (its anchors are chapter-ranged; its embeddings are not).
3. A cheap standing check: for any book, diff `verse_coverage.author_count>=2` against the
   served/verse-keyed count. A large gap means the two models have drifted apart again.

## Method note

Reads only, via `.env.local` (`ep-tiny-hat`, pooled and direct, agreeing). Production was
NOT read — bylaw 7 — so every number here is dev. Dev and prod are not assumed equal.
