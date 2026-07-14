# Corpus verse-key repair — biblehub `commentary_entries` (§2)

**Status: DIAGNOSED (2026-07-13), fix NOT started — needs owner approval (source + cost).**
Measured read-only against prod.

> **Correction (same day):** my first pass called this "3 of 9 legal voices ~90% missing from *retrieval*" and
> "true vector coverage ≈ 49%". **That was wrong** — it measured the biblehub reader corpus as a proxy for the
> teacher's vector corpus, but they are **two disjoint ingests**. Corrected below (the meta-rail working: name
> the artifact the mechanism actually depends on).

## The two disjoint corpora (this is the whole story)

The same three whole-Bible authors exist twice, from two different ingests, under two different author strings:

| | table | author string | source | verse keys | book span |
|---|---|---|---|---|---|
| **Teacher / vectors** | `embeddings` | `Albert Barnes`, `John Wesley`, `John Calvin` | **crosswire (SWORD)** | **correct, per-verse** (Barnes 26.3 distinct verses/chapter, 0 collapsed) | **NT-only** (books 40–66; Barnes 260 ch, Wesley 259, Calvin 236) |
| **Search / reader** | `commentary_entries` | `Barnes' Notes`, `John Wesley`, `John Calvin` | **biblehub** | **BROKEN — `verse_start = verse_end = chapter`** on every row | whole-Bible (~1,189 ch) |

They never join (different author string AND different keys). So:

- **Teacher retrieval is NOT verse-key-broken.** The crosswire vectors it serves are correctly per-verse keyed.
  Verified: Barnes Romans 8 embeddings cover verses 2–39; W/C likewise ~20 distinct verses/chapter, ~0 collapsed.
- **`measure-embedding-gap.ts`'s "missing" count is a phantom** — it synthesizes a source_id from the biblehub
  rows (`Barnes' Notes`, verse=chapter) and looks for it among the crosswire vectors (`Albert Barnes`,
  per-verse); no match ⇒ it reports the whole biblehub corpus as un-embedded. That is NOT a retrieval gap. (The
  tool now prints a caution to that effect and only flags the real pathology.)

## The two REAL defects

1. **SEARCH / reader citation bug (user-visible).** `searchCommentaries` (`commentary-search.ts`) serves
   `commentary_entries` gated by `LEGAL_COMMENTARY_ENTRIES_PREDICATE`, which (correctly, since §1b) admits
   `Barnes' Notes` / `John Wesley` / `John Calvin` — the biblehub rows. Their `verse_start = chapter`, so a
   Barnes comment on **Romans 8:1** is returned/cited as **Romans 8:8**. The snippet text, author, and chapter
   are right; the **verse number is wrong**. This is systemic across ~14 biblehub commentaries in the table
   (Pulpit 25,328 · Cambridge 24,928 · Geneva 24,875 · Poole 23,153 · Barnes 19,848 · Benson · Wesley · Bengel
   · B.W. Johnson · Calvin · Darby · Scofield · MacLaren · Lange), of which Barnes/Wesley/Calvin are served now
   and the rest are AUTHOR_TRIAGE promotion candidates that **cannot be promoted until their keys are fixed**.
   Gill/Clarke/Henry are clean.

2. **Teacher OT gap (modest).** The crosswire vector modules for Barnes/Wesley/Calvin are **NT-only**. So on OT
   passages, those three voices are absent from retrieval (OT is served by Gill/JFB/Clarke/Henry + partial
   Augustine[Ps,John]/Chrysostom[Mt,John,Acts]). The failing v3 **epistle** queries are NT, so B/W/C ARE
   available there — this gap does NOT explain the epistle misses (those are the genuine semantic/recall misses
   from §1a/§1b). It would help OT **topical** coverage.

## The fix — sequenced (unchanged in shape, re-scoped in impact)

1. **Repair `verse_start`** in the biblehub `commentary_entries` by re-parsing true per-verse numbers from a
   **permitted PD origin** — CCEL / Wikisource, **NOT BibleHub/StudyLight** (ToS-forbidden, and where these were
   scraped — a provenance flag). The body opens with the verse lemma, so a per-verse re-ingest recovers it. One
   author at a time, verified against the reader.
2. This immediately fixes the SEARCH/reader citations. If we then also want OT B/W/C in the **teacher**, add
   `entry_index` to `synthesizeSourceId` + both checkers in lockstep and incrementally embed the repaired
   **OT** rows (additive; NT already covered by crosswire — dedupe by verse to avoid double-voicing).

## Priority (corrected)

This is **not** the "#1 retrieval lever" — the teacher is correctly keyed. It's (a) a real search-citation
correctness bug and (b) the blocker for promoting ~11 more commentaries, and (c) a path to OT coverage for
Barnes/Wesley/Calvin. Worth doing, but it does **not** explain the topical/epistle HIT@2 gap — that remains the
§1a/§1b genuine-recall story (epistle) and the label/Torrey story (topical).

## Decision needed from the owner

- Approve re-sourcing the biblehub commentaries from CCEL/Wikisource with a per-verse parser (fixes citations;
  unblocks promotion).
- Separately decide whether to extend Barnes/Wesley/Calvin to the OT in the **teacher** (needs the repair first).
