# Document 3: Corpus acquisition and ingestion

> **⛔ SUPERSEDED (2026-07-19).** Supabase-era corpus design — the running sources and pipeline are `DATA_SOURCES.md` + `docs/INGESTION_TASK.md`; sourcing decisions are ADR-008 ("Commentary sourcing: SWORD/CrossWire primary; never scrape aggregators") and ADR-010 ("`sources` + `sections` is the corpus ingestion target") in `docs/DECISIONS.md`. Kept for history; do not build from this.

Two content streams with a hard wall between them:

1. The curated corpus: open-licensed works you ingest, review, and publish.
   Shared by all users. This is what the product's citation guarantee covers.
2. User libraries: PDFs/DOCX/EPUBs a user uploads for their own study.
   Private to that user, never shared, never in topical guides, never
   training data. See section 4.

---

## 1. Source inventory (all free, all buildable-on today)

### Bibles

| Work | Format | License | Where |
|---|---|---|---|
| World English Bible (WEB) | USFM | Public domain | ebible.org |
| Berean Standard Bible (BSB) | USFM/CSV | Public domain (dedicated 2023) | berean.bible / bereanbible.com |
| KJV | USFM/OSIS | Public domain (US; UK Crown patent nuance, revisit at intl launch) | ebible.org, CrossWire |
| SBL Greek NT | XML/txt | CC BY | sblgnt.com, github |
| Westminster Leningrad Codex | OSIS/XML | Public domain | github.com/openscriptures/morphhb |

### Original-language data (the Logos-killer layer, all CC BY)

| Work | What it is | Where |
|---|---|---|
| STEPBible TAGNT | Greek NT, word-by-word tagged (lemma, Strong's, morph, gloss) | github.com/STEPBible/STEPBible-Data |
| STEPBible TAHOT | Hebrew OT, same treatment | same repo |
| STEPBible TVTMS | Versification mappings (feeds versification_map) | same repo |
| MorphGNT | Alternate Greek morphology | github.com/morphgnt |
| Strong's, Thayer, BDB, Abbott-Smith | Lexicons, public domain | openscriptures + STEPBible repos |

STEPBible-Data is the single highest-value repo on this list. Ingest it
first; it populates original_words, lexicon_entries, and versification_map
almost directly.

### Commentaries, fathers, sermons, theology (public domain)

| Work | Scale | Tradition/era tags | Where |
|---|---|---|---|
| Matthew Henry, Complete Commentary | whole Bible, 6 vols | puritan/reformed | CCEL (ThML) |
| Calvin's Commentaries | 46 vols, most of Bible | reformation/reformed | CCEL |
| Ante-Nicene + Nicene/Post-Nicene Fathers | 38 vols | patristic | CCEL |
| Spurgeon sermons | ~3,500 sermons | baptist/victorian | spurgeon.org archive, CCEL |
| Wesley, sermons + notes | ~150 sermons, whole-NT notes | wesleyan | CCEL, wesley.nnu.edu |
| Jonathan Edwards | major works | puritan | CCEL (public domain editions only; Yale WJE editions are copyrighted) |
| JFB, Barnes' Notes, Gill's Exposition | whole-Bible commentaries | 19th c. reformed/baptist | CCEL, e-Sword/sacred-texts dumps |
| Aquinas, Summa + Catena Aurea | | medieval/catholic | CCEL, dhspriory dumps |
| Creeds + confessions (Westminster, Heidelberg, 1689, Augsburg, Nicene...) | small, highly structured | per tradition | CCEL, public repos |

Also: CrossWire SWORD modules package hundreds of these in one standardized
OSIS format with existing parse tooling (pysword). Often the fastest path
versus scraping CCEL's ThML directly. unfoldingWord resources (translation
notes/words, CC BY-SA) are solid fill for verses thin on commentary;
share-alike applies to derivatives of the works, not to the app, so display
with attribution is fine.

Skip for now: anything requiring OCR from archive.org scans (quality tax),
anything modern/licensed (that's the month-6+ BD track), sermon platforms
like SermonAudio (copyrighted). Living preachers become a permission-based
program later; many will say yes for attribution and links.

Rough scale: this inventory yields ~300-600k sections. A few GB of text,
~2-3 GB of embeddings. Comfortably inside Supabase/pgvector for years.

## 2. Ingestion pipeline (curated corpus)

A CLI in the repo (`pnpm ingest <source>`), not a service. Runs on your
machine or CI. Idempotent: every stage keyed by content checksum, re-runs
skip unchanged work. Raw files archived to Supabase storage
(corpus-raw/ bucket) so any parse can be redone.

Stages:

1. **Fetch**: download raw (USFM, OSIS/ThML XML, SWORD module, txt).
   Record provenance jsonb: url, retrieved_at, checksum, license note.
2. **Normalize**: convert to internal markdown + metadata. One parser per
   format: USFM (existing npm parsers), OSIS/ThML (xml), SWORD (pysword).
   Pandoc as fallback.
3. **Structure**: detect chapters/sections/sermon divisions from the format's
   own markup. Never chunk blind by tokens when structure exists.
4. **Anchor**: extract scripture references and write section_anchors. Use
   bible-passage-reference-parser (npm, handles hundreds of formats) BUT
   test against archaic citation styles: Matthew Henry writes "Rom. viii.
   28" with Roman numeral chapters. Budget real time here; anchor quality
   is retrieval quality, and this step is 80% of ingestion difficulty.
5. **Chunk**: split sections to 200-800 words along paragraph boundaries,
   carrying heading context down into each chunk.
6. **Tag**: tradition + era + source_type from a per-source config file
   (checked into the repo; this is editorial data you author once per work).
7. **Embed**: bge-large-en-v1.5 (pinned, ADR-005 — Models pinned) -> section_embeddings.
8. **QA gate**: every source lands as status=staged. A review script samples
   N random sections for eyeballing (mangled text, footnote bleed, broken
   anchors) before flipping to published. Retrieval only sees published.

Ingestion order (each step is shippable value):

1. WEB + BSB + KJV + STEPBible data (structured, clean, powers reader +
   word study immediately)
2. Creeds and confessions (small, structured, instant tradition diversity)
3. Matthew Henry (one source = whole-Bible commentary coverage)
4. Calvin, then the Fathers (ANF/NPNF), then Spurgeon
5. Wesley, Edwards, JFB/Barnes/Gill, Aquinas

After step 3 the product already demos. After step 5 the "5 voices, 2+
traditions" rule has real depth on most passages.

## 3. Upload pipeline (user library)

Flow: client uploads to Supabase storage (user-scoped bucket path) ->
row in user_documents (status=uploaded) -> pgmq job -> parse worker ->
sections + anchors + embeddings -> status=indexed. Async with visible
status; a 500-page PDF takes minutes and cents, so the UI shows
"processing" not a spinner.

Parse worker: PDF and DOCX parsing is too heavy for serverless function
limits. Run a small dedicated worker (Fly.io machine or Modal function)
that polls pgmq. Parsers: Docling or marker for PDF -> markdown (both
handle layout, tables, footnotes far better than raw text extraction),
mammoth for DOCX, epub via pandoc. Same stages 3-7 as the corpus pipeline,
writing to the user_* tables instead.

Formats at launch: PDF, DOCX, EPUB, TXT/MD. Scanned image-only PDFs:
detect (no text layer) and reject with a clear message in v1; OCR is a
later feature, not a launch blocker.

## 4. The wall (design decisions of record)

Copyright: users will upload books they bought. Private personal-use
storage and retrieval is defensible (same posture as Dropbox); sharing is
not. Therefore: no cross-user sharing, no upload content in topical
guides, no training on uploads, standard DMCA registered-agent setup at
launch. The user_* tables and RLS make the wall structural, not policy.

Authority labeling: the citation guarantee ("verbatim, attributed,
resolvable") applies mechanically to uploads too (the verifier treats
user_sections identically), but the UI must distinguish provenance. A
fringe PDF must not render with the same visual authority as Chrysostom.
Contract 1.1 adds attribution.origin: 'corpus' | 'user_library'; clients
badge user-library citations "from your library."

Teachers only retrieve from a user's library when the user asked about
their own materials or toggled it on per-study (studies gains an
include_library boolean, default on, user-visible).
