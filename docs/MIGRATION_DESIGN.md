# Migration Design — `commentary_entries`/`embeddings` → `sources`/`sections`

**Status: SUPERSEDED — IMPLEMENTED and IN PROD (as of 2026-07-12).** The legal-corpus migration/publish
shipped: `db/migrations/*.sql` (incl. the `status` staged→published column), `legalBasePoolSql` /
`LEGAL_CORPUS_FILTER` in `web/src/lib/teacher/routing.ts`, deployed and verified live. This doc is retained as
design rationale, **not a pending proposal** — do not read "awaiting approval" as "unbuilt."
_(Original status: DESIGN ONLY — awaiting owner approval.)_
Owner: this session (recorded in `WORKLOG.md`/`ROADMAP.md` 2026-07-10). Executes ADR-010. Consolidates `docs/INGESTION_TASK.md` (Appendix A) + `docs/SCHEMA.md` §4 + the running system — it does not restate them, it reconciles them to what is actually in Neon today.

---

## 1. The one decision that matters: re-point the vectors, don't re-embed

The current retrieval corpus is **173,806 embedding rows** already in Neon, all produced by the pinned `bge-large-en-v1.5`. The migration **preserves those vectors by re-pointing them** to the new `section_embeddings` table via SQL — it does **not** regenerate them. Everything else in this doc follows from that choice.

**Why this is the whole ballgame (the scaling trap, named):**
Adopting `sources`/`sections` is a *table-model* change, not a *retrieval-quality* change. A section body that differs — by even one character — from the text that produced a vector makes that vector invalid for the section. So there are exactly two paths:

| | **A. Re-point (recommended)** | **B. Re-chunk + re-embed** |
|---|---|---|
| Section body | `:= embeddings.content` (the exact embedded text) | new 200–800-word full-works chunks |
| Vectors | **reuse all 173,806** verbatim | **regenerate all** (~170k+ units) |
| DeepInfra cost | **$0** | ~$0.74+ and rising with corpus growth |
| Coverage gap during migration | **stays 0** (a section's embedding exists by construction) | **> 0 until the whole re-embed finishes** — reopens the zero Gate A just closed |
| Time | SQL backfill, minutes | full embed job (~30 min) + risk of a partial/poisoned run |
| Risk | low (pure `INSERT … SELECT`) | reintroduces every batch-pipeline failure mode from 2026-07-09 |

**Decision: Path A for the migration.** The migration's job is to move the *same* corpus into the *better* model with retrieval parity — not to re-cut or expand it. Re-chunking into readable full-works sections (Path B) is real, wanted work, but it is a **re-embed rebuild** and is explicitly **out of scope here** (§7) so it never blocks the model change or endangers coverage.

**What Path A deliberately does NOT fix (stated so scope is honest):** the current `source_id` scheme (`commentary:{slug}:{ch}:{vs}:{author}`, no `entry_index`) collapses **341,912 eligible entries → 168,233 keys**; only the first entry per key was ever embedded, so **~173,679 entries' distinct text is not in the vector index today** (it is still keyword-searchable via `commentary_entries.tsv`). Re-pointing carries this limitation forward unchanged. Fixing it = embedding those entries = new vectors = cost + a reopened gap → that is a **corpus-expansion decision (§8, open for approval)**, not part of this migration.

---

## 2. What exists today (reconciled from Neon, 2026-07-10)

- `commentary_entries` (371,406 rows; 341,912 with body≥100; **401** authors/works): `id, book, chapter, verse_start, verse_end, author, year, tradition, source_title, source_url, body, tsv, entry_index`. This is the structured backbone the backfill reads.
- `embeddings` (commentary slice, `user_id IS NULL AND source_type='commentary'`): **173,806** rows over **168,392** distinct `source_id`s (3,872 chunked, `chunk_index` up to 11); columns `source_id, chunk_index, content, embedding vector(1024), metadata`. **`content` is the exact text embedded** — the reuse handle.
- `sources`, `sections`, `section_anchors`, `section_embeddings`: **do not exist.** Clean create.
- The single source of truth for the legacy key is [`src/ingest/source-id.ts`](../src/ingest/source-id.ts) (`synthesizeSourceId`, `MIN_BODY_LENGTH`), already shared by the embed job and Gate A.

---

## 3. Target schema (reconciled DDL)

Per `SCHEMA.md` §4 with three corrections it needs to be correct against reality. Migration `006_sources_sections.sql`, run as `neondb_owner`, `GRANT SELECT` to `app_runtime`; public data, **no RLS**.

```sql
create table sources (
  id           bigint primary key generated always as identity,
  slug         text not null unique,
  title        text not null,
  author       text not null,
  author_died  smallint,
  year_written smallint,
  source_type  text not null check (source_type in
    ('commentary','sermon','historian','theology','father','confession','lexicon')),  -- +historian (ADR-013)
  tradition    text not null,
  era          text not null,
  language     text not null default 'en',
  license      text not null,                 -- Gate B: NOT NULL, from ingest/sources.config.json
  provenance   jsonb not null,                -- {url, edition/translator, year, retrieved_at, checksum}
  status       text not null default 'staged' -- ADDED: the staged→published QA gate; Gate B keys on this
               check (status in ('staged','published','quarantined'))
);

create table sections (
  id        bigint primary key generated always as identity,
  source_id bigint not null references sources,
  ordinal   int not null,                     -- reading order within source
  heading   text,
  body      text not null,
  tsv       tsvector generated always as (to_tsvector('english', body)) stored,
  unique (source_id, ordinal)
);
create index sections_tsv_idx on sections using gin (tsv);

create table section_anchors (
  section_id     bigint not null references sections,
  verse_id_start int not null,                -- book*1_000_000 + chapter*1_000 + verse (existing scheme)
  verse_id_end   int not null,
  primary key (section_id, verse_id_start)
);
create index anchors_range_idx on section_anchors (verse_id_start, verse_id_end);

create table section_embeddings (
  section_id bigint not null references sections,
  model_slug text not null,                   -- 'bge-large-en-v1.5' (ADR-005) — NOT 'bge-m3' (SCHEMA.md stale)
  embedding  vector(1024) not null,
  primary key (section_id, model_slug)
);
create index se_hnsw_idx on section_embeddings using hnsw (embedding vector_cosine_ops);
```

**Corrections vs `SCHEMA.md` §4 (call-outs, not silent):** (1) added `sources.status` — the staged/published/quarantined gate; `check-licenses.ts` already queries `WHERE status='published'`, so the column is *required* for Gate B's DB check to function. (2) `model_slug = 'bge-large-en-v1.5'`, not `'bge-m3'`. (3) `source_type` CHECK gains `historian` (ADR-013). `provenance` made `NOT NULL` (Gate B needs it).

---

## 4. `source_id` stays computed in exactly one place

The new model keys on **`sections.id` (bigint identity)** — no new string-`source_id` scheme is invented (inventing one is exactly the cross-session divergence risk NEXT_PHASE §3 warns about). The legacy `commentary:{…}` key is used **only as the migration bridge** to join `commentary_entries` ↔ `embeddings` ↔ new `sections`, and it is computed **only** by `synthesizeSourceId` in [`source-id.ts`](../src/ingest/source-id.ts) — the backfill imports it, never re-implements it. (In practice the backfill reads structured fields — `verseId`, `verseEnd`, `author` — directly from `embeddings.metadata`, so it doesn't even parse the key string.) After cutover (§6) and once the legacy tables are dropped, `source-id.ts` is retired with them. Net: the format still lives in one file; the migration adds zero new definitions of it.

### 4.1 Deferred expansion is APPEND-ONLY — deferring must never mean re-migrating (confirmed)

`sections.id` is a **surrogate `bigint generated always as identity`** — it carries no content and is independent of verse/author/order. So the ~173,679 currently-collapsed entries (§1) can be added **later** as brand-new `sections` rows: each gets a fresh `id`, an `ordinal` **after the source's current `max(ordinal)`** (append, don't re-interleave), a new `section_anchor`, and a **new** embedding for its own text. **No existing `sections` row is re-keyed, re-ordinaled, its anchors touched, or its vector regenerated.** Expansion is a pure `INSERT` of new rows; it is not a re-run of this migration. (The only thing later expansion changes for existing rows is nothing.) True reading-order interleaving, if ever wanted, belongs to the separate full-works re-chunk rebuild (§7), which is already a re-embed and can assign ordinals freely. **This is the guarantee that makes deferral safe.**

---

## 5. Backfill plan — smallest first slice, then scale

**Prove deep before wide: migrate ONE work end-to-end first** (recommend **Barnes' Notes** — large, confirmed PD), verify both gates + retrieval parity on it, *then* run all 401. Every step idempotent (`ON CONFLICT DO NOTHING`, re-runnable), staged, DDL as owner.

1. **Create the four tables** (§3); grant `app_runtime` SELECT.
2. **License map — the one human-review pause (compliance gate).** Populate/extend the checked-in `ingest/sources.config.json` (the same file Gate B already validates) with one entry per work: `license`, `source_type`, `tradition`, `era`, `author_died`/`year`, `provenance`. **Pause for owner review before backfilling `sources`.** Fail closed: any work without a confirmed PD/CC license → `status='quarantined'`, never migrated to `published`.
3. **`sources`** ← one row per work, from the reviewed config joined to distinct `(author, source_title, tradition, year)` in `commentary_entries`. `status` starts `staged`; flips to `published` only after the per-source integrity gate (§6/INGESTION_TASK §Corpus-integrity-gate) passes.
4. **`sections`** ← **one section per `embeddings` row** for that source: `body := embeddings.content`, `ordinal` assigned by `(book, chapter, verse_start, chunk_index)`. (Body = the embedded text, so the reused vector stays valid — §1.)
5. **`section_anchors`** ← `verse_id_start/end` from the section's key via `source-id.ts` decode (`book*1_000_000 + chapter*1_000 + verse`). All chunks of one key share an anchor.
6. **`section_embeddings`** ← `embedding := embeddings.embedding`, `model_slug := 'bge-large-en-v1.5'`. **Reused, not regenerated** → for that source, `section_embeddings` count == `sections` count by construction (coverage stays 0).

For the first slice this is a handful of `INSERT … SELECT` statements scoped to one `author`; scaling to all 401 is the same statements without the filter (optionally `COPY` for speed).

### 5.1 Chunked embeddings map 1:1 to sections (confirmed — no PK conflict)

3,872 `source_id`s are chunked (`chunk_index` 0…up to 11) → 173,806 embedding rows over 168,392 keys. The mapping is deliberately **one `embeddings` row → one `section` → one `section_embeddings` row (1:1:1)**, *not* "N vectors per section." A `source_id` with 11 chunks becomes **11 sections**, each a distinct retrieval unit with `body :=` that chunk's `content` and exactly one vector. This is the only mapping that fits `section_embeddings`' primary key `(section_id, model_slug)` — you cannot store N vectors for one section under one model without changing that PK, and there's no reason to: the chunk *is* the retrieval unit. So the whole commentary slice is a clean **173,806 embeddings → 173,806 sections → 173,806 section_embeddings**; `sections` count == `section_embeddings` count by construction, so Gate A is 0 with no orphaned or dropped chunk. (Chunks of one original entry stay adjacent via consecutive `ordinal`; concatenating them for a future "read the whole entry" view is a later full-works concern, §7.)

---

## 6. How the two gates integrate (both must pass before `published`)

**Gate B — license (fail CLOSED), already wired:** every `sources` row has `license NOT NULL` + `provenance NOT NULL`, sourced from the reviewed `ingest/sources.config.json`. `check-licenses.ts` already asserts (a) the manifest is all `Public Domain | CC BY | CC BY-SA` with provenance, and (b) **zero `published` sources with a disallowed/null license** — the DB half goes live automatically the moment `sources` exists. A source that fails stays `quarantined` and is never retrieved. **No new Gate B code needed.**

**Gate A — coverage (fail LOUD), one small addition:** today `check-corpus-coverage.ts` anti-joins `commentary_entries` vs `embeddings`. Post-migration it must also anti-join **eligible `sections` minus `section_embeddings` (with `model_slug='bge-large-en-v1.5'`), per source** — exactly what NEXT_PHASE §Gate-A specifies. Add a `--target=sections` mode (the anti-join query below); run **both** during dual-read, drop the legacy one at cutover.

```sql
-- Gate A (sections): missing = non-quarantined sources' sections with no matching-model
-- embedding. Uses status <> 'quarantined' (not '= published') so it also gates a source
-- while it is still 'staged' — completeness must be proven BEFORE flipping to 'published'.
select src.slug, count(*) as missing
from sections s
join sources src on src.id = s.source_id and src.status <> 'quarantined'
left join section_embeddings e on e.section_id = s.id and e.model_slug = 'bge-large-en-v1.5'
where e.section_id is null
group by src.slug;   -- any row => exit 1
```

**Retrieval bridge (dual-read → parity → cutover):** add a section-based retrieval path (`section_anchors` + `section_embeddings` + `sections.tsv` + reranker) alongside the current `hybrid_search_v2`/`embeddings`. **Prove the true-success diagnostic on the new path is ≥ the current number** (re-run the 10-query + 30-query evals per CLAUDE.md; record in WORKLOG). Only then cut retrieval over. **Do not drop `commentary_entries`/`embeddings` until parity is proven.**

---

## 7. Out of scope (explicitly — separate, later tasks)

- **Full-works re-chunking into 200–800-word readable sections** — this is Path B (§1), a re-embed rebuild. Deferred and decoupled so it never endangers coverage.
- **Embedding the ~173,679 currently-unembedded entries** — corpus expansion (§8), not this migration.
- **New-source ingestion** (SWORD/CrossWire, more Bibles — INGESTION_TASK Phases 1–3): the migration proves the *model*; new content comes after.
- **Full-works rendering UI** (movable popup) — depends on this data, built later.
- **Dropping the legacy tables** — only after §6 cutover parity.
- **RLS** — public corpus data, none.

## 8. Open decisions for the owner (approve / redirect before code)

1. **Approve Path A (re-point, $0, preserve corpus) over Path B (re-embed).** ← the core call.
2. **Corpus expansion — separate yes/no:** do we later embed the ~173,679 collapsed entries (per-`entry_index` granularity) to widen vector recall? Cost: new embeddings + a temporarily reopened gate on those. Recommend **defer** — decide after the model migration + accuracy re-check.
3. **First-slice source:** Barnes' Notes — OK, or prefer another?
4. **Schema corrections in §3** (add `status`, fix `model_slug`, `+historian`, `provenance NOT NULL`) — approve folding these into `SCHEMA.md` so the docs and DB agree.
5. **`ingest/sources.config.json` shape:** extend the Gate-B manifest entry with `source_type/tradition/era/author_died` (one config, two consumers) vs a second file. Recommend **one file**.
6. **Provenance sourcing (surfaced during the Barnes slice):** the existing corpus's `sourceUrl` points to **biblehub.com** — an aggregator ADR-008 says never to scrape. The *text* is public domain (Barnes d. 1870), so the **license is valid** and this does not block the model migration. But the acquisition provenance is a real compliance item: **re-source the corpus text from CrossWire/PD (INGESTION_TASK Phase 2) before wide/beta rollout.** Provenance records the biblehub origin honestly (per ADR-013, retained in the record, never rendered as an outbound link). Tracked, not fixed here.

---

## APPROVED (2026-07-10): Path A; defer expansion (tracked, tied to eval-set growth); Barnes first slice; fold §3 into SCHEMA.md; one config file. Building migration 006 + the Barnes slice only, proven green on both gates, before the other ~400 sources.

---
*No code will be written against this until it is approved. On approval, first deliverable is migration `006` + the Barnes first-slice backfill + the Gate A `sections` mode, proven green, before touching the other 400 sources.*
