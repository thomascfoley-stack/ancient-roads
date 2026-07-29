# Ingestion Task — Public-Domain Bibles & Commentaries

Actionable build task for bringing PD/open Bible translations + **complete** commentaries into the app (host, render whole works, embed for search) from the sources in [`DATA_SOURCES.md`](../DATA_SOURCES.md). Executes ADR-008. **Reuses the pipeline design in [`CORPUS.md`](CORPUS.md) §2 — do not reinvent it.**

## 0. Reconcile before building (design review — resolve first)

Two drifts between the design docs and the running system must be resolved before code:

**Schema drift.** `CORPUS.md`/`SCHEMA.md` design `sources` + `sections` + `section_embeddings` (with **provenance, per-work license, tradition/era tags, and a staged→published QA gate**) on Supabase + `bge-m3`. The **running** system is Neon + `BGE-large-en-v1.5` (1024-dim) with `commentary_entries` (verse-keyed FTS snippets, migration 003/005) + `embeddings` (`source_type='commentary'`, queried by `hybrid_search_v2`, migration 004). Bibles are static JSON in `web/public/`. **The provenance/license registry and the full-works `sections` structure are NOT built.**

**Legal drift.** `CORPUS.md`'s source inventory still lists CCEL and mentions scraping ThML. `DATA_SOURCES.md` (current, researched) supersedes it: **CCEL editions/markup are commercially restricted (reference only, never scrape); SWORD/CrossWire is the primary commentary source; never scrape aggregators (BibleHub/StudyLight).**

**ADOPTED DECISION (ADR-010): the `sources` + `sections` model is the ingestion target.** Multi-source PD ingestion needs (a) a per-work **provenance + license registry** (compliance — ADR-008) and (b) a **full-works structure** (ordered `sections`) to render entire commentaries in the popup — and the flat `commentary_entries` has neither. So all new ingestion writes to `CORPUS.md`'s `sources` + `sections` + `section_embeddings` model (provenance, license, tradition/era tags, staged→published QA gate, full works as ordered sections), bridged into the teacher's retrieval.

**Migration implication (plan this, don't skip it):** the current corpus lives in `commentary_entries` (FTS) + `embeddings` (`source_type='commentary'`). Adopting `sources`/`sections` means either (i) migrating the existing 371k into the new model and re-pointing retrieval + FTS at `sections`/`section_embeddings`, or (ii) running `sections` as the new write-path while the existing tables stay until retrieval is cut over. Recommend (ii): build `sources`/`sections` + its embeddings, dual-read during transition, then cut retrieval over once the full corpus is in the new model. Sequence this with the accuracy fix — do not fork the corpus into two live models permanently.

## 1. Hard rules (ADR-008, CLAUDE.md — non-negotiable)

- Ingest **only** public-domain or commercially-permissive CC (BY / BY-SA) content. Store a **per-work provenance + license record** (source URL, retrieved-at, checksum, license string) *before* publish. **Fail closed:** quarantine any work without a confirmed PD/CC license.
- **Never** scrape ToS-protected aggregators (BibleHub, StudyLight) or CCEL's editions. Use bulk/structured sources whose reuse is intended.
- Pinned embedder = **`BAAI/bge-large-en-v1.5` (1024-dim)** — NOT `bge-m3` (that reference in CORPUS.md is stale). English-only content.
- Never store the full text of copyrighted translations.

## 2. Pipeline (reuse CORPUS.md §2, targeting the real tables)

`fetch` (record provenance + license) → `normalize` (one parser per format: USFM, OSIS/ThML XML, SWORD) → `structure` (use the format's own markup — never chunk blind when structure exists) → `anchor` (scripture refs; **budget real time — archaic citation styles like "Rom. viii. 28" are 80% of the difficulty and anchor quality = retrieval quality**) → `chunk` (200–800 words on paragraph boundaries, carry heading context) → `tag` (tradition/era/source_type from a per-source config checked into the repo) → `embed` (BGE-large) → **QA gate** (`status=staged`; a review script samples N sections for mangled text / footnote bleed / broken anchors before flipping to `published`; retrieval only sees `published`).

**Tooling:** SWORD commentaries require `libsword`/`diatheke` (or `pywinsword`) — **`pysword` is Bible-only.** Use `installmgr` for repo sync + license enumeration (`mods.d.tar.gz` lists every `.conf` `DistributionLicense` — filter on it).

## Throughput & rate-limit handling (fast, sizeable, resilient batches)

Go as fast as the limits allow, back off gracefully when limited, never lose progress. **Do not run one job/row at a time.**

- **DB inserts: `COPY`, not row-by-row.** One bulk `COPY` per source/chunk beats thousands of HTTP inserts (the 45-min → seconds fix). Run as owner over the direct (unpooled) connection.
- **Embedding: largest reliable batch + bounded concurrency.** Send the biggest batch DeepInfra reliably accepts (respect the model's per-item token limit + payload size), and run a bounded number of requests in parallel up to DeepInfra's requests/min — not serial single batches.
- **Adaptive sizing + backoff.** Detect 429 / timeout / payload-too-large; on hit, exponential backoff + shrink batch/concurrency; on sustained success, ramp back up.
- **Resumable + idempotent (checkpointed).** Every batch keyed on natural key with `ON CONFLICT DO NOTHING` / skip-done; a failure or rate-limit pause **resumes**, never restarts, never re-spends.
- **Log throughput to WORKLOG** (rows/sec, batches, retries) so it's verifiable.

**The limits, and what to actually do:**
- **DeepInfra** = the only real API rate limit. The pipeline handles it with concurrency + backoff. Request a rate increase from DeepInfra **only if the full embed genuinely stalls on 429s** (it's a ~30-min one-time job — you likely won't need to).
- **Neon** = compute (CU), not a rate-limit form. If ingestion is I/O-bound, temporarily scale up Neon compute for the run, then scale down.
- **Vercel** = NOT in the ingestion path (ADR-012). Do not touch Vercel limits for data upload.

## Corpus integrity gate (redundancy — run after EVERY source ingest; must pass before `published`)

A source is not "ingested" until it passes ALL of these, with the numbers logged to WORKLOG. Retrieval only ever sees `published`; a failing source stays `staged`/quarantined under "Needs Thomas". **No single green check is trusted — the high-stakes properties are checked two independent ways.**

1. **Count parity** — ingested `sections` for the source == expected entries from the source parse/manifest. Log both numbers and the delta; a non-trivial delta = fail (this is the check that would have caught the 51% dedup loss).
2. **No empty rows** — zero `sections` with null/empty/whitespace `body`, and zero with body length below a sane floor (catches truncation / OCR failure / markup-bleed leaving an empty shell).
3. **Provenance + license present** — every `source` row has a non-null `license` and `provenance` (source URL, translator/edition, year). No source without a confirmed PD/CC license reaches `published` (fail closed).
4. **Referential integrity** — every `section` → a valid `source`; every `section_anchor` → a valid section + a structurally-valid verse range. Zero orphans.
5. **Embedding completeness (redundant count)** — `section_embeddings` count == `sections` count for the source, all with the correct `model_slug`. Corpus completeness is thus verified TWICE: per-source count parity (#1) AND total `embeddings == total sections`. Zero un-embedded sections.
6. **Content sanity (sampled)** — pull N random sections, assert the body is real prose (reasonable length, not garbled OCR, not raw markup), and log the sample so a human can eyeball it.

**If any check fails: do NOT publish, do NOT mark the source done.** Log the failing check + numbers under "Needs Thomas" and move on. This is how "verifiable stable build" is enforced instead of empty/partial rows landing silently.

## 3. Phased build

- **Phase 0 — provenance/license registry + the schema decision (§0).** Compliance foundation. First.
- **Phase 1 — Bibles (independent, can run anytime):** BSB (primary, PD, USJ/JSON from berean.bible) + WEB/KJV/ASV via `scrollmapper`/`seven1m/open-bibles`. Into the reader's bible store. Gives more translations immediately; unblocked by retrieval work.
- **Phase 2 — SWORD commentary backbone:** `installmgr` sync CrossWire → **filter `.conf` to PD/permissive licenses** → parse via `libsword`/`diatheke` → normalize → **dedupe against the existing 371k** → embed. Start with confirmed-PD modules: Barnes, Clarke, Calvin, Wesley, Catena Aurea, TSK.
- **Phase 3 — gaps + fathers + a modern voice:** Matthew Henry / Gill / JFB (affiliated SWORD repos or Wikisource PD text); Schaff's Ante/Nicene Fathers (archive.org); Tyndale Open Study Notes (CC BY-SA — attribute, keep note-derivatives share-alike).
- **Phase 4 (later) — copyrighted translations display-only** via API.Bible (per-request, **never embedded**).

## 4. First vertical slice (prove deep before wide)

One source end-to-end through the *full* pipeline including the QA gate, and confirm the teacher retrieves it: recommend **one SWORD commentary module (e.g. Barnes)** — acquire → license-check → parse → normalize → provenance record → embed → run a query and confirm it surfaces. Prove the pipeline on one source before running all of them.

## 5. Scaling risks (named up front)

- **Embedding cost/time:** one-time embed is cheap (~$0.74 for the current corpus per the diagnostic; expansion more), but holding the larger index needs **Neon Large ~$110/mo** (in budget).
- **Parse heterogeneity:** every source is a different format — one parser per format, tested.
- **Anchor quality = retrieval quality:** archaic citation parsing is the hard 80%.
- **License-filter discipline:** a single wrong license is legal exposure — fail closed, provenance before publish.
- **Dedup** against the existing corpus on a natural key (the `commentary_entries` entry_index lesson).

## 6. Out of scope (separate tasks)

Copyrighted-translation embedding; the full-works **rendering UI** (movable popup — depends on this data + the sections structure); the semantic cache / topical curation (after accuracy); user uploads (CORPUS.md §3).

## 8. Self-host all commentary + remove third-party links

**Goal:** nothing depends on an external content site at read time; every commentary is hosted by Ancient Paths.

**Current state (verified):** the ingested commentary text is *already* self-hosted (static JSON in `web/public/commentaries/`). The only third-party content dependency is the outbound **`entry.sourceUrl`** link rendered in `web/src/components/commentary-panel.tsx` (field `sourceUrl` in `lib/bible.ts`). Google Fonts (`layout.tsx`) is not content — leave it.

**Work:**
- Ingest the full commentary corpus into `sources`/`sections` (Phases 2–3) so complete works are self-hosted — the precondition for retiring outbound links.
- **Remove the user-facing external `sourceUrl` link.** Replace with **internal** navigation to the self-hosted full work (the `sections` full-work view). Where a full-work view doesn't exist yet, keep **attribution text only** (author / work / year) with **no outbound URL** — never drop attribution, just the external link.
- **Retain `sourceUrl`/provenance in the data layer** (it's the provenance + license record — ADR-010); stop rendering it as a clickable external link, don't delete the record.

**Coupling:** the outbound link can only be fully replaced by an internal one once that work is hosted as `sections`. So per source: ingest full work → point the link internally. Until a source is fully hosted, show attribution-only (no outbound link).

## 7. Sequencing

- **Runs after the retrieval-accuracy fix** (embed the existing 371k + hybrid + reranker → 10/10). Do **not** expand the commentary corpus into a broken retrieval — you'd embed more into a pipeline that returns the wrong sources.
- **Phase 1 (Bibles) is independent** of retrieval accuracy and can proceed anytime.
- Do not start until the working tree is committed + pushed (current backup risk).

## Appendix A — Phase 0 build spec: `sources`/`sections` migration (build-ready)

**Target tables** are already designed in `SCHEMA.md` §4 — create them on Neon if absent (new migration `006_sources_sections.sql`, run as `neondb_owner`, `GRANT SELECT` to `app_runtime`; public data, no RLS):
- `sources` — id, slug, title, author, author_died, year_written, `source_type` (CHECK: commentary/sermon/**historian**/theology/father/confession/lexicon — extend the CHECK to add `historian`), tradition, era, language, **`license` NOT NULL**, `provenance` jsonb. *This is the license + provenance registry (ADR-008/010).*
- `sections` — id, `source_id` FK, `ordinal` (reading order = full-works), heading, body, `tsv` (generated), `unique(source_id, ordinal)`; GIN on tsv.
- `section_anchors` — section_id, verse_id_start, verse_id_end; the verse-join for "N views on this verse."
- `section_embeddings` — section_id, `model_slug`, `embedding vector(1024)`, HNSW. **`model_slug` = the pinned `bge-large-en-v1.5` (the `'bge-m3'` in SCHEMA.md is stale — correct it).**

**Migration steps (idempotent, staged):**
1. Create the four tables if absent; grant `app_runtime` SELECT.
2. **Build the per-source license map — the compliance-critical, human-reviewable step.** For each of the ~401 sources in `web/public/commentaries/_manifest.json`, assign `license` (from `DATA_SOURCES.md` — most are PD), `source_type`, `tradition`, `era`, `author_died`/`year`, and `provenance` (source_url + retrieved_at + checksum). Store as a **checked-in config `ingest/sources.config.json`** so it's reviewable and versioned. **FAIL CLOSED: any source without a confirmed PD/CC license → quarantined, never migrated to `published`.**
3. Backfill `sources` from the config (one row per work).
4. Backfill `sections` from `commentary_entries` (group by source, assign stable `ordinal` by book/chapter/verse/entry_index) + `section_anchors` from the verse range.
5. Backfill `section_embeddings`: reuse existing `embeddings` vectors where they map 1:1 to sections, else re-embed with the **pinned** BGE-large (record `model_slug`; re-embedding is a rebuild, not a migration).
6. **Retrieval bridge (ADR-010 dual-read → cutover):** add a section-based retrieval path (section_anchors + section_embeddings + sections FTS) alongside the current `embeddings`/`hybrid_search`. **Prove the teacher's true-success diagnostic is ≥ the current number on the new path**, then cut retrieval over; deprecate `commentary_entries`/`embeddings` only once parity is confirmed.

**Hard rails:**
- **Do NOT drop `commentary_entries`/`embeddings` until retrieval parity is proven on `sections` (dual-read first).**
- License population is **fail-closed**: unconfirmed license → quarantined, retrieval only sees `published`.
- Pinned embedder (BGE-large, 1024-dim); record `model_slug`; never mix embedding models.
- Every migration idempotent + re-runnable; DDL as owner, `GRANT` to `app_runtime`.
- **Pause for review of `ingest/sources.config.json` (the license map) before backfilling `sources`** — this is the compliance gate.
