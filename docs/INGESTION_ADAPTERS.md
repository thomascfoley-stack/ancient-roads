# Ingestion Adapters — spec

The loop (`INGESTION_LOOP.md`) reads `ingest/sources.config.json`, dispatches each work to the adapter named in its `provenance.acquire.adapter`, and the adapter returns rows for the 006 `sources`/`sections` model. This doc specs the adapters the clean-tier queue needs. **Text-only for hymn/poetry (lyrics/poems, no tunes); historians `serve:false` (staged, chunk on headings); art is a separate pipeline (not here).**

## The adapter contract (all adapters)

Input: one manifest entry (its `acquire` block + `source_type`/`license`/`provenance`).
Output: a `SourceRow` + N `SectionRow`s written to **staged** (never published — publish is the human digest).

```ts
interface AcquireResult {
  source: { slug; title; author; author_died?; year_written?; source_type;
            tradition; era; language; license; provenance; status: 'staged' };
  sections: { ordinal; heading?; body; anchors?: {verseIdStart;verseIdEnd}[] }[];
}
```

Rules every adapter obeys (fail closed → `quarantine`, never publish):
- **License/provenance first.** Refuse anything whose `license` isn't PD / CC-BY / CC-BY-SA; record the exact source URL + edition + year + retrieved_at + checksum in `provenance`. CC-BY(-SA) → carry the attribution string.
- **Embed whole.** Chunk to ≤ the embed budget so the `MAX_EMBED_CHARS=1000` head-truncation never fires (the topical-retrieval scar). Never head-truncate a section.
- **Chunk on the source's own structure**, never blind token windows (`CORPUS.md`). Carry the heading into the section (`heading` field + prepend to the embed text).
- **Idempotent:** `ON CONFLICT DO NOTHING` on `(source_id, ordinal)`; re-runs never double-ingest.
- **Polite fetch:** cached, resumable, rate-limit-aware backoff; never re-hammer a host.

**Migration prerequisite:** entries with `source_type` in `{hymn, poetry, art}` need an additive migration adding those to the `sources.source_type` CHECK before ingest. `crossref`/geo/art are separate (structured-data) pipelines.

---

## 1. `helloao` — HelloAO Free Use Bible API (structured JSON, zero OCR)

The cleanest adapter: verse-keyed JSON, PD Mark 1.0. Already partly modeled by the existing `rebuild` blocks and `src/ingest/helloao-source.ts#HELLOAO_BOOK_MAP`.

- **Input:** `{ adapter:"helloao", commentary_id, api }`.
- **Fetch:** `GET {api}/c/{commentary_id}/books.json` → for each book `GET {api}/c/{commentary_id}/{helloao_book_id}/{chapter}.json`. A verse = a content item where `type='verse'` (`item.number`).
- **Chunk:** one section per verse-comment (or per contiguous verse-range the source groups). `heading` = the verse ref; **anchor** = `verseId(book,chapter,verse)` via `src/bible/verse-id.ts` → `{verseIdStart, verseIdEnd}` (this is the verse-keyed join — commentary rides existing retrieval).
- **Gotcha:** map HelloAO book ids → canonical book via `HELLOAO_BOOK_MAP`; fetch the **untruncated** text (the stored-vector truncation note in the existing entries is exactly what to avoid here).
- **Queue users:** `keil-delitzsch` (complete OT). (Gill/JFB/Clarke/Henry already ingested via this API.)

## 2. `ccel` — CCEL ThML → text (the biggest reuse; ~25 queue works)

CCEL is PD *text* under commercially-restricted *markup* — so **extract text, strip ThML, re-provenance to the underlying PD edition** (standing rule).

- **Input:** one of `{ adapter:"ccel", ccel_ids:[...] }` · `{ ccel_id_pattern:"spurgeon/sermons{01..63}" }` (expand the `{a..b}` range) · `{ ccel_author:"owen" }` (enumerate the author page's works). Plus `strip_markup:true` and optional `chunk_on_headings:true`.
- **Fetch:** prefer the plain-text cache `ccel.org/ccel/{s}/{id}/cache/{id}.txt`; else the ThML XML `ccel.org/ccel/{s}/{id}.xml` and strip tags. (Author pages: `ccel.org/ccel/{author}` lists work ids.)
- **Chunk:** on the work's own divisions — ThML `<div>`/heading structure. For **sermons/hymns/poems**: one section per sermon / hymn / poem (the natural unit; `heading` = title/first-line). For **fathers' homilies**: one per homily. For **historians** (`chunk_on_headings:true`): on Schaff's dated `§` headings / book-chapter — put the heading in `heading` (it carries the period/event anchor for the future history path). For **commentary** (Ryle, Treasury, K-style): anchor to the verse the section is on where the source states it.
- **Provenance:** set `provenance.edition` to the underlying print edition (e.g. "NPSP/MTP year-edition"), not "CCEL".
- **Gotchas:** verify each `ccel_id` resolves (fail→quarantine, log); re-provenance every row; strip the ThML markup fully (no stray tags in `body`).
- **Queue users:** Spurgeon (sermons + Treasury), Maclaren, Chrysostom/Augustine/Origen (NPNF/ANF), the Puritan set (Owen/Watson/Flavel/Edwards), Wesley/Ryle/Vincent, Hodge/Calvin/Schaff-Creeds, Josephus/Edersheim/Schaff-History (staged), Olney/Scottish-Psalter/Neale/Bramley (hymn), Herbert/Montgomery (poetry).

## 3. `gutenberg` — Project Gutenberg (clean UTF-8, zero OCR)

- **Input:** `{ adapter:"gutenberg", ebook_id }`.
- **Fetch:** the plain-text / HTML file for `{ebook_id}` (`gutenberg.org/ebooks/{id}` → the `.txt`/`-h.htm`). **Strip the Gutenberg license header/footer** (the boilerplate before "*** START ***" and after "*** END ***") — never ingest it.
- **Chunk:** on the book's own structure — one section per **hymn / poem / sermon** (heading = title). For collections that mix sacred + secular (Herrick *Hesperides*, Milton, Donne), **filter to the sacred section** named in the entry `note` (isolate *Noble Numbers*, *Divine Poems*, etc.). For subject-anchorable epics (Milton), record the biblical subject as `heading`; verse-anchoring by subject is a later enrichment, not required at ingest.
- **Gotchas:** Gutenberg's programmatic search endpoints were flaky in discovery — fetch by the known `ebook_id` (all queue entries carry it), don't rely on search. Confirm the edition matches the `note` (e.g. Hopkins **#22403 = the 1918 first ed.**, never a later copyrighted edition).
- **Queue users:** Watts (hymns/psalms), Keble, Donne, Herrick, Traherne, Milton, Rossetti, Hopkins, Tennyson, Dante (Longfellow), Wheatley, Whitefield.

---

## Adapters already built / out of scope here

- **`sword` (exists — extend):** `src/ingest/ingest-sword-commentaries.mts`. Input `{ adapter:"sword", module, verify_conf }`. Verify each module's `.conf` `DistributionLicense=Public Domain` before ingest. Queue users: Catena, ISBE, Easton, Smith, Nave (+ the wider reference cluster, and the 6 new NT commentary modules from `SOURCE_CATALOGUE §3a`).
- **`archive` (exists — OCR guardrails):** archive.org `_djvu.txt` with the title-page check / `tokenListOcr` / calibration bar (`ARCHIVE_ORG_INGEST_DESIGN`). OCR tier → `staged`. Used here only by `thayers-lexicon`; the bulk OCR tier (Pulpit, Lange, Simeon, Parker Society, à Lapide, sermon long-tail) queues later.
- **`github` (new, simple):** clone/pull a repo path (e.g. `openscriptures/HebrewLexicon` for BDB; the bible/original-language repos). Filter by per-file license (the scrollmapper trap). Structured data, not verse-voice prose.
- **`bible` (future):** bulk USFM/OSIS parse from open-bibles/eBible/STEP — a distinct adapter (versification-gated), deferred.
- **`art` (future):** Wikidata SPARQL + Iconclass CC0 gazetteer + museum CC0 APIs → `artworks`/`artwork_iconclass` tables (`SOURCE_CATALOGUE §19`). Entirely separate from the text pipeline.

## What this unlocks

With these three adapters built (+ the SWORD extension), the loop can sweep the **clean tier** — the ~46 flagship works now in `sources.config.json` — from `helloao`/`ccel`/`gutenberg`/`sword`, staging thousands of sections (Spurgeon ~3,560, Maclaren ~1,500, Chrysostom+Augustine, K&D complete OT, the reference cluster, confessions, the hymn/poetry flagships) instead of five commentaries. OCR-tier and structured-data (bibles/art) adapters come after.
