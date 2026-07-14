# Corpus verse-key repair — Barnes / Wesley / Calvin (§2)

**Status: DIAGNOSED (2026-07-13), fix NOT started — needs owner approval (source + re-embed cost).**
Measured read-only against prod. This is the largest retrieval defect found to date and the most likely
dominant cause of the topical/epistle voice-starvation (HIT@2 needs ≥2 distinct voices per passage).

## The bug (one sentence)

Three of the nine legally-served commentators — **Barnes' Notes, John Wesley, John Calvin** — were ingested
with **`verse_start = verse_end = the CHAPTER number`** on every entry, so all ~17 distinct verse-by-verse
paragraphs in a chapter collapse to a single verse-key and a single synthesized `source_id`; the embed job
vectors **only the first** and skips the rest as "already embedded," and the one vector it does write is
**mis-attributed to `verse = chapter`.**

## Measured impact (prod, read-only)

| author | eligible entries | vectored (distinct source_ids) | distinct text **absent from the vector index** |
|---|---|---|---|
| **Barnes' Notes** | 19,848 | ~1,189 (1 per chapter) | **~94%** |
| **John Wesley** | 14,849 | ~1,285 | **~91%** |
| **John Calvin** | 6,166 | ~1,189 | **~81%** |
| John Chrysostom | 6,769 | (homily-structured, separate issue) | ~23% |
| John Gill | 28,279 | 28,279 | 0% ✅ |
| Adam Clarke | 12,570 | 12,570 | 0% ✅ |
| Matthew Henry | 4,124 | 4,124 | 0% ✅ |

Confirmation queries:
- `verse_start = chapter` holds for **19,848 / 19,848** Barnes rows, **14,846 / 14,849** Wesley, **6,159 / 6,166**
  Calvin. It does NOT hold for Gill/Clarke/Henry (they carry true per-verse keys).
- Barnes: `avg entries/chapter = 16.7`, `avg DISTINCT verse-keys/chapter = 1.0`, `chapters where all entries
  share one verse-key = 1,189 / 1,189` (1,189 = the exact chapter count of the Protestant Bible).
- Sample — Barnes, Romans 8, entry_index 161–174, **all `verse_start=8`**, bodies are the distinct comments on
  8:1 ("There is, therefore, now…"), 8:2 ("For the law…"), 8:3, 8:4 … i.e. genuinely distinct text, not dupes.

Corpus-wide: **341,912** eligible entries → **340,808** distinct texts (only ~1,100 exact dupes) → but only
**~168,233** distinct source_ids are reachable, so **true vector coverage ≈ 49%**, not the ~100% the
collapsed coverage detector reports. **173,679 distinct paragraphs of real commentary are present in
`commentary_entries` (so they show in FTS/reader) yet were never embedded.**

## Why it matters (three consumers, all verse-keyed)

1. **Teacher retrieval (the accuracy gate).** Barnes/Wesley/Calvin contribute ~1 vector per chapter instead of
   ~17. On any given passage the pool of *distinct* voices is gutted — precisely the ≥2-voice recall the
   topical/epistle HIT@2 gate measures. This likely swamps the §4 HNSW-recall effect.
2. **Attribution correctness (the product guarantee).** The one vector per chapter carries
   `verseId = book·1e6 + chapter·1000 + chapter` — e.g. a Barnes comment on Romans 8:1 is tagged **Romans 8:8**.
   A concordance that quotes-and-attributes must not cite the wrong verse.
3. **Reader.** Any verse-keyed read of `commentary_entries` places all of a chapter's Barnes/Wesley/Calvin text
   on `verse = chapter` and nothing on the other verses.

## Root cause & full scope

A **BibleHub-adapter defect**: it wrote the chapter number into `verse_start` for **every** commentary it
ingested — not just the three served authors. The coverage gate (`measure-embedding-gap.ts`) now lists all of
them. Ranked by entries keyed to `verse=chapter`:

| commentary | entries mis-keyed | served now? |
|---|---|---|
| Pulpit Commentary | 25,328 | triage candidate |
| Cambridge Bible | 24,928 | triage candidate |
| Geneva Study Bible | 24,875 | triage candidate |
| Matthew Poole | 23,153 | triage candidate |
| **Barnes' Notes** | 19,848 | **YES (legal)** |
| Joseph Benson | 15,341 | triage candidate |
| **John Wesley** | 14,846 | **YES (legal)** |
| Johann Bengel | 6,610 | triage candidate |
| B.W. Johnson | 6,534 | triage candidate |
| **John Calvin** | 6,159 | **YES (legal)** |
| J.N. Darby / C.I. Scofield / A. MacLaren / J.P. Lange | 2,095–2,376 each | triage candidates |

So the repair unblocks BOTH the currently-served quality (Barnes/Wesley/Calvin) AND every future AUTHOR_TRIAGE
promotion — none of these BibleHub-sourced works can be promoted until their verse keys are fixed.

(Note: **BibleHub is a ToS-protected aggregator that CLAUDE.md forbids scraping** — a separate provenance flag;
the underlying texts are public domain, but they must be re-sourced from a permitted origin, not re-fetched
from BibleHub.)

## The fix — SEQUENCED (do not reorder)

1. **Repair `verse_start` first (data).** Re-parse true per-verse numbers from a **permitted PD source** —
   CCEL (Barnes, Calvin, Wesley are all on CCEL) or Wikisource — NOT BibleHub/StudyLight. The entry body opens
   with the verse lemma, so a re-ingest with a per-verse parser (or lemma→KJV-verse matching) recovers the
   number. One author at a time (per the quality-slice rail), measured against the reader.
2. **Then** add `entry_index` to `synthesizeSourceId` **in lockstep with both checkers**
   (`check-corpus-coverage.ts`, `measure-embedding-gap.ts`) so distinct paragraphs get distinct source_ids.
3. **Then** incremental re-embed of the recovered entries (~174k new vectors; additive, new source_ids only —
   existing rows untouched; this is NOT the model-swap one-way door).
4. Re-measure v4 per category; expect the topical/epistle voice count to rise materially.

## Why NOT to add `entry_index` / re-embed tonight

Adding `entry_index` to the source_id now (or re-embedding) BEFORE step 1 would vector all ~342k entries with
the **wrong verse attribution baked in** — 342k mis-cited vectors is worse than 168k. The coverage detector
was therefore left honest-but-unchanged at the embed layer; only the *reporting* is corrected (see
`measure-embedding-gap.ts`) so the ~49% true coverage stops hiding behind the collapsed count.

## Decision needed from the owner

- Approve re-sourcing Barnes/Wesley/Calvin from **CCEL** (or another permitted PD origin) with a per-verse parser.
- Approve the incremental re-embed cost (~174k entries × BGE embed ≈ a few $ on DeepInfra; one-time).
- One author first (Barnes — largest, cleanest lemma structure) as the proof slice before the other two.
