# Schema as built — Neon Postgres + pgvector + RLS

**Generated from `db/schema.sql` + `db/migrations/001_*.sql`–`023_*.sql` on 2026-07-19.** Every
statement below was read from those files, not remembered. To regenerate: re-read `db/schema.sql`
and every migration in `db/migrations/` (including any newer than 023) and rewrite this file.
Prod-verified state (live row counts, deployed indexes, what is actually applied where) lives in
`docs/STATE_OF_TRUTH.md` — this file is the *committed DDL*; STATE_OF_TRUTH is the *measured
database*.

This doc replaces `docs/SCHEMA.md` (a Supabase-era target design, mostly never built) as the
schema reference. `SCHEMA.md` is kept for history with a supersession banner — do not build from it.

Scope notes:

- `db/migrations/013_user_corpus.sql.draft` is a **DRAFT — NOT APPLIED** (it targets a Neon dev
  branch that does not exist yet; the header forbids applying it to prod). It is documented in
  §7 as design-only.
- Migration 016 was applied to the **dev branch only** in the 2026-07-16 run; prod application is
  deferred to the 006 cutover (its own header says so). Migrations 017/020 are dev-first; 021 is
  the prod record for the revokes 016 already did on dev.
- The header of `db/schema.sql`: "Neon Postgres with pgvector, RLS, per-user isolation".
  Extensions: `pgvector`, `pg_trgm` (schema.sql); migrations re-assert `vector` idempotently.

---

## 1. Roles and the access model (migration 001, ADR-009 — "SEC-2: least-privilege role + RLS as the data-isolation boundary")

Two roles:

- **`neondb_owner`** — migrations/DDL and offline ingestion only. Has `BYPASSRLS`, so RLS never
  binds for it; platform ingest writes corpus tables through this role and is unaffected by RLS.
- **`app_runtime`** — the web runtime role. `LOGIN NOBYPASSRLS`, created out-of-band (password
  generated, never committed). 001 grants it DML only: `SELECT, INSERT, UPDATE, DELETE` on all
  tables, `USAGE, SELECT` on sequences, `EXECUTE` on functions, plus `ALTER DEFAULT PRIVILEGES`
  so future owner-created tables are born with the same grants. No DDL, no ownership.

Every runtime query runs in a transaction that does
`set_config('app.current_user_id', <uid>, true)` (see `web/src/lib/db.ts` `runAsUser`). RLS
policies compare against `current_setting('app.current_user_id', true)`. **Fail-safe:** if the
session var is unset, RLS returns zero rows.

Because 001's default privileges grant full DML on every new table, several migrations then
*narrow* specific tables back down (the 010 pattern) — see the grants column per table below.

## 2. The flat corpus model (what is served today)

### 2.1 `commentary_entries` (migrations 003, 005, 019) — verse-keyed FTS corpus

Public corpus data — **no RLS**; `app_runtime` holds **SELECT only** (003 grant + 010 revoke).

| column | type | notes |
|---|---|---|
| `id` | SERIAL PK | |
| `book`, `chapter`, `verse_start`, `verse_end` | SMALLINT NOT NULL | |
| `author` | TEXT NOT NULL | |
| `year` | SMALLINT | |
| `tradition` | TEXT | |
| `source_title` | TEXT NOT NULL | |
| `source_url` | TEXT NOT NULL DEFAULT `''` | |
| `body` | TEXT NOT NULL | |
| `entry_index` | SMALLINT NOT NULL DEFAULT 0 | added by 005 — ordinal in the source chapter file; without it the natural key collapsed sub-verse chunks and 190k of 371k rows were silently dropped |
| `work` | TEXT | added by 019 (register slug) |
| `register` | TEXT | added by 019 |
| `tsv` | tsvector GENERATED ALWAYS AS (`to_tsvector('english', body)`) STORED | body only, by design (author/tradition filtered via WHERE) |

Indexes: `idx_commentary_fts` GIN(tsv); `idx_commentary_passage` (book, chapter, verse_start);
`idx_commentary_natural_key` UNIQUE (book, chapter, verse_start, verse_end, author, source_title,
entry_index) (005 shape); `idx_commentary_fts_legal` — partial legal GIN, see §6.

### 2.2 `embeddings` (schema.sql; migrations 007, 012, 018, 020, 022) — shared vector + BM25 store

One table holds **platform corpus rows (`user_id IS NULL`)** and per-user rows, separated by RLS.

| column | type | notes |
|---|---|---|
| `id` | UUID PK DEFAULT `gen_random_uuid()` | |
| `user_id` | TEXT, nullable | NULL = platform/corpus row |
| `source_type` | TEXT NOT NULL | CHECK per **migration 020**: `('commentary','bible','sermon','father','theology','confession','lexicon','hymn','poetry','note','document')` — 020 replaced the original schema.sql list (`'bible_verse','commentary','user_upload','sermon_transcript','study_note','book_chapter'`) so the served store accepts the register types |
| `source_id` | TEXT NOT NULL | |
| `chunk_index` | INT DEFAULT 0 | |
| `content` | TEXT NOT NULL | |
| `embedding` | `vector(1024)` | pinned embedder `BAAI/bge-large-en-v1.5` (ADR-005 — "Models: Qwen3.5-35B-A3B (compose) + BGE-large (embed), pinned") |
| `metadata` | JSONB DEFAULT `'{}'` | carries `verseId`, `author`, `work`, `sourceUrl` etc. — the partial-index predicates read these keys |
| `tsv` | tsvector GENERATED ALWAYS AS (`to_tsvector('english', content)`) STORED | |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

Indexes: `idx_embeddings_source` UNIQUE (source_type, source_id, chunk_index) — backs ingestion
`ON CONFLICT` upserts; `idx_embeddings_user` partial WHERE `user_id IS NOT NULL`;
`idx_embeddings_vector` HNSW (`embedding vector_cosine_ops`) — full-table (prod verified HNSW via
`pg_indexes` 2026-07-13, per the schema.sql comment; an earlier ivfflat line was stale);
`idx_embeddings_fts` GIN(tsv); `embeddings_commentary_verseid_idx` (007) — partial expression
btree on `((metadata->>'verseId')::int)` WHERE `user_id IS NULL AND source_type='commentary'`,
for reference-routing range injection; plus the register partial HNSW set from 012/018 — see §6.

RLS (enabled in schema.sql): read policy = `user_id IS NULL OR user_id = session-var`; write
policy per **migration 022** = `FOR INSERT WITH CHECK (user_id = session-var)` — the runtime may
insert **only the caller's own user rows, never platform rows**. There are no UPDATE/DELETE
policies, so RLS denies both for `app_runtime`. (Known gap: the table-level INSERT/UPDATE/DELETE
*grant* from 001 still stands on `embeddings`; RLS is the enforcing boundary because
`app_runtime` is NOBYPASSRLS. Recorded as STATE_OF_TRUTH §7.1, fix deferred to an owner-run
REVOKE.) Platform ingest runs as the owner, which bypasses RLS, so 022 does not affect ingestion.

### 2.3 `hybrid_search()` (schema.sql v1 → migration 004 v2)

SQL function, `LANGUAGE sql STABLE`: BM25 CTE (`ts_rank_cd` over `embeddings.tsv`) FULL OUTER
JOIN vector CTE (`1 - (embedding <=> query)`), weighted sum (defaults bm25 0.4 / vector 0.6),
optional `filter_user_id`. Migration 004 fixes v1: `websearch_to_tsquery` (AND semantics, ~0 hits)
→ `plainto_tsquery` (OR semantics), restricts both legs to `source_type = 'commentary'`, and
widens candidate pools to `match_count * 5` (BM25) / `* 3` (vector).

## 3. The 006 corpus model (the ingestion target — ADR-010 — "`sources` + `sections` is the corpus ingestion target")

Created by migration 006 (additive; dual-read with the flat model until cutover). All four tables
are **public corpus — no RLS**; `app_runtime` is **SELECT-only** (006 grants SELECT; 010 revoked
writes on `sources`/`sections`; 016 on dev + **021 on prod** revoked writes on
`section_anchors`/`section_embeddings`/`section_history_anchors`).

### 3.1 `sources` (006; CHECKs widened by 017 and 023) — license + provenance registry

| column | type | notes |
|---|---|---|
| `id` | BIGINT PK GENERATED ALWAYS AS IDENTITY | |
| `slug` | TEXT NOT NULL UNIQUE | |
| `title`, `author` | TEXT NOT NULL | |
| `author_died`, `year_written` | SMALLINT | |
| `source_type` | TEXT NOT NULL | CHECK per **017**: `('commentary','sermon','historian','theology','father','confession','lexicon','hymn','poetry','art')` (006's 7 + hymn/poetry/art) |
| `tradition`, `era` | TEXT NOT NULL | |
| `language` | TEXT NOT NULL DEFAULT `'en'` | |
| `license` | TEXT NOT NULL | Gate B: every row carries a license |
| `provenance` | JSONB NOT NULL | |
| `status` | TEXT NOT NULL DEFAULT `'staged'` | CHECK per **023**: `('staged','published','quarantined','ingesting')` — 023 added `'ingesting'` as the in-flight marker so a crash mid-write can never leave a `published` shell; the QA gate flips `staged → published` only on success |

### 3.2 `sections` (006; extended by 016) — the retrieval unit

| column | type | notes |
|---|---|---|
| `id` | BIGINT PK GENERATED ALWAYS AS IDENTITY | surrogate id ⇒ expansion is append-only |
| `source_id` | BIGINT NOT NULL REFERENCES `sources(id)` | |
| `ordinal` | INT NOT NULL | UNIQUE (source_id, ordinal) |
| `heading` | TEXT | |
| `body` | TEXT NOT NULL | the exact text that produced the vector |
| `tsv` | tsvector GENERATED … STORED | 006: body only; **016 conditionally swapped** it to `to_tsvector('english', coalesce(heading,'') || ' ' || body)` (dated headings were unsearchable) — the DO block only swaps if the expression still lacks `heading` |
| `period_start_year`, `period_end_year` | SMALLINT | added by **016** — the history spine; signed, negative = BC; `sections_period_idx` partial WHERE `period_start_year IS NOT NULL` |

Indexes: `sections_tsv_idx` GIN(tsv), `sections_source_idx` (source_id), `sections_period_idx`.

### 3.3 `section_anchors` (006) — the verse join

PK `(section_id, verse_id_start)`; `verse_id_end` INT NOT NULL. `verse_id = book*1e6 + chapter*1e3 + verse`.
Index: `anchors_range_idx` (verse_id_start, verse_id_end). Powers "N views on this verse".

### 3.4 `section_embeddings` (006) — vectors live apart from content

PK `(section_id, model_slug)` — one vector per section per model, so re-embedding is a rebuild,
not a migration. `embedding VECTOR(1024) NOT NULL`; `model_slug` = `'bge-large-en-v1.5'`
(ADR-005, pinned). Index: `se_hnsw_idx` HNSW (`embedding vector_cosine_ops`).

### 3.5 `section_history_anchors` (016) — routable history entities

PK `(section_id, kind, entity_slug)`; `kind` CHECK `('person','place','event','institution')`;
`entity_label` TEXT NOT NULL. Verbatim-grounded facts only; the gazetteer joins on `entity_slug`.
Index: `history_anchors_entity_idx` (kind, entity_slug). (016 also repaired the 010 miss: it
REVOKEd `app_runtime` writes on this table, `section_anchors`, and `section_embeddings` on dev;
021 is the same revoke as the standalone prod migration.)

## 4. User tables (schema.sql; annotations extended by 001/002/015)

All are per-user, **RLS enabled**, policy = `user_id = current_setting('app.current_user_id', true)`
(USING + WITH CHECK), and `app_runtime`-writable.

| table | key shape | specifics |
|---|---|---|
| `user_profiles` | UUID PK; `auth_user_id` TEXT NOT NULL UNIQUE (policy matches on `auth_user_id`) | `plan` CHECK `('free','pro','scholar')` DEFAULT `'free'`; `preferred_translation` DEFAULT `'web'`; `encryption_key_hash` |
| `channels` | UUID PK, `user_id` TEXT | study groups; `pinned_sources`/`settings` JSONB |
| `chats` | UUID PK, `user_id` | LLM study-partner DMs; `persona` DEFAULT `'general'` |
| `messages` | UUID PK, `user_id`; FKs `channel_id`, `chat_id` (both ON DELETE CASCADE) | CHECK `msg_belongs_to_one`: exactly one of channel/chat; `role` CHECK `('user','assistant','system')` |
| `chat_memories` | UUID PK; FK `chat_id` CASCADE | `fact_type` CHECK `('struggle','interest','progress','preference','bookmark','note')`; partial index `WHERE is_active` |
| `reading_history` | UUID PK | UNIQUE (user_id, book_slug, chapter, read_at) |
| `user_library` | UUID PK | `file_type` CHECK `('pdf','epub','audio','video','notes','image')`; `storage_key` |
| `study_guides` | UUID PK; optional FK `channel_id` ON DELETE SET NULL | `sections`/`progress` JSONB; `is_template` |
| `user_integrations` | UUID PK | UNIQUE (user_id, provider); `status` CHECK `('active','expired','revoked')` |

### 4.1 `highlights` (schema.sql; sub-verse anchoring added by 015)

UUID PK; `user_id` TEXT NOT NULL; `verse_id` INT NOT NULL, `verse_end` INT (canonical verse id,
book*1e6 + chapter*1e3 + verse, translation-independent); `color` TEXT NOT NULL DEFAULT `'yellow'`;
`created_at`/`updated_at` NOT NULL DEFAULT now(); `deleted_at` TIMESTAMPTZ (soft delete, sync-ready).
015 adds (all nullable ⇒ a legacy whole-verse highlight): `span_start`/`span_end` INT (half-open
character offsets into the verse text; NULL/NULL = whole verse), `translation` TEXT (offsets are
translation-relative), `background_color` TEXT (legacy `color` is kept and set to the same value
on write), `text_color` TEXT. Multiple active spans per verse are permitted (the lookup index is
plain, not UNIQUE; the old one-per-verse rule was app logic only).
Indexes: `idx_highlights_user_verse` (user_id, verse_id) WHERE `deleted_at IS NULL`;
`idx_highlights_user_created` (user_id, created_at DESC, id) WHERE `deleted_at IS NULL` (015,
keyset pagination).

### 4.2 `notes` (schema.sql; 002; 015)

UUID PK; `user_id`, `verse_id`, `verse_end`, `body` TEXT NOT NULL; same timestamp/soft-delete
shape as highlights.
Indexes: `idx_notes_user_verse` **UNIQUE** (user_id, verse_id) WHERE `deleted_at IS NULL` (002 —
one active note per (user, verse), so `upsertNote` is one atomic `INSERT … ON CONFLICT … DO
UPDATE`; a soft-deleted note does not occupy the slot); `idx_notes_user_updated` (user_id,
updated_at DESC) partial; `idx_notes_user_updated_id` (user_id, updated_at DESC, id) partial
(015, keyset tiebreak).

RLS on both was enabled by **migration 001** (they shipped without it; SEC-2 finding B), mirrored
in schema.sql.

## 5. Operational tables

### 5.1 `api_rate_limit` (migration 008) — per-user fixed-window counter for `/api/ask`

PK `(user_id, bucket, window_start)`; `bucket` = `'ask:min' | 'ask:day'`; `count` INT NOT NULL
DEFAULT 0; `window_start` = truncated window start (UTC). Index `api_rate_limit_window_idx`
(window_start) supports the expired-window sweep. **RLS intentionally NOT enabled** — an
operational counter (counts only, no secrets) that `app_runtime` (NOBYPASSRLS) must read/write
freely. Explicit full-DML grant to `app_runtime`. Reversible: `DROP TABLE api_rate_limit`.

### 5.2 `waitlist` (migration 014) — public early-access capture

`id` BIGINT PK IDENTITY; `email` TEXT NOT NULL UNIQUE (dedupe via `ON CONFLICT DO NOTHING`);
`source` TEXT; `created_at`. Backs `POST /api/waitlist`. **No RLS** (a public signup list, not
per-user data). Deliberately keeps full DML for `app_runtime` via 001's create-time default
privileges — a post-creation REVOKE/GRANT is not reliably picked up by Neon's connection pooler
(stale relcache ACL ⇒ "permission denied" via the pooled role), per the 014 header.

## 6. The legal/register partial indexes and the zero-window policy

These indexes exist because the corpus is only partially *servable* (license gate); their WHERE
predicates must stay **byte-identical** to the code constants or the planner silently stops using
them (correctness is unaffected; only speed regresses — the migration 009 → 011 lesson). Sync is
enforced by `test/invariants/fts-legal-index-sync.test.ts` and `test/invariants/legal-hnsw-index-sync`.

| index | on | built by | predicate mirrors |
|---|---|---|---|
| `idx_commentary_fts_legal` | `commentary_entries` GIN(tsv) partial | 009 → **011** (rebuilt: predicate drift — "Barnes' Notes" added, crosswire condition dropped) → **019** (zero-window v5 rebuild: predicate gained the register `work IN (…)` list; keys the stored `tsv` column) | `LEGAL_COMMENTARY_ENTRIES_PREDICATE` (`web/src/lib/legal-corpus.ts`) |
| `idx_embeddings_vector_legal` | `embeddings` HNSW (embedding vector_cosine_ops) partial | **012** → 018 (zero-window v5 rebuild: `source_type IN ('commentary','sermon','father','theology','confession','lexicon')` + register `work` list added) | `LEGAL_CORPUS_FILTER` (`web/src/lib/teacher/routing.ts`) |
| `idx_embeddings_vector_song_verse` | `embeddings` partial HNSW | 018 | hymn/poetry works (`SONG_VERSE_CORPUS_FILTER`) |
| `idx_embeddings_vector_sermon` | `embeddings` partial HNSW | 018 | sermon-lane `work IN (…)` |
| `idx_embeddings_vector_theology` | `embeddings` partial HNSW | 018 | theology-lane `work IN (…)` |
| `idx_embeddings_verseid_registers` | `embeddings` partial expression btree on `((metadata->>'verseId')::int)` | 018 | all prose + song registers |

Why partial HNSW (012, measured on prod 2026-07-14): the full-table HNSW at `hnsw.ef_search=40`
collects 40 neighbours and the selective legal filter (~44% of the table) then guts them —
`legalBasePoolSql(50)` returned **5**. An index built only over legal rows returns only legal
neighbours, so a modest ef_search fills the pool directly (no iterative_scan, no full-graph
re-walk).

**Zero-window policy — ADR-025 ("Zero-window index migration policy", 2026-07-18).** Any
migration touching a *serving* index must build the replacement `CONCURRENTLY` under a NEW name
(`<idx>_vN`), let it go VALID, `DROP INDEX CONCURRENTLY` the old one, then `ALTER INDEX … RENAME`
— a usable index exists at every instant (the migration-011 pattern; 018/019 follow it).
`CONCURRENTLY` cannot run inside a transaction block, so these run via
`db/apply-migration-concurrent.mjs`, which splits the file on `--SPLIT--` markers into separate
implicit transactions, pre-cleans INVALID leftover indexes, and post-asserts every touched index
VALID+READY. Never drop-first on a serving index, dev included.

## 7. Not in the tree (do not treat as built)

- **013 user corpus — DRAFT, NOT APPLIED** (`013_user_corpus.sql.draft`): four user-scoped tables
  (`user_documents`, `user_sections`, `user_section_embeddings`, `user_section_anchors`) mirroring
  the 006 shape for personal uploads (sermon search Slice 1), TEXT PKs, RLS on every table,
  CASCADE delete chain, deliberately **no HNSW** (per-user brute-force; a partition tripwire is a
  future migration). Targets a Neon dev branch that does not exist yet; must never be applied to
  prod as-is.
- **`sections.unit_ordinal`** — decided (ADR-026 — "`sections` is a retrieval unit; add a
  first-class `unit_ordinal` reading-unit grouping", 2026-07-18) as an owner-run migration, but
  no migration file exists in `db/migrations/` as of 2026-07-19.

## 8. RLS policies by table (summary)

| table | RLS | policy |
|---|---|---|
| `user_profiles` | ✅ | `auth_user_id = session-var` (USING + WITH CHECK) |
| `channels`, `chats`, `messages`, `chat_memories`, `reading_history`, `user_library`, `study_guides`, `user_integrations` | ✅ | `user_id = session-var` (USING + WITH CHECK) |
| `highlights`, `notes` | ✅ (enabled by 001) | `user_id = session-var` (USING + WITH CHECK) |
| `embeddings` | ✅ | SELECT: `user_id IS NULL OR user_id = session-var`; INSERT (022): `user_id = session-var` only; no UPDATE/DELETE policies ⇒ denied |
| `commentary_entries`, `sources`, `sections`, `section_anchors`, `section_embeddings`, `section_history_anchors` | ❌ (public corpus) | protected by `app_runtime` SELECT-only grants (006/010/016/021) |
| `api_rate_limit`, `waitlist` | ❌ (intentional) | operational / public-signup tables; `app_runtime` full DML |

## 9. The Bible text plane is NOT in the database

No `translations`/`verses`/`books` tables exist; Bible text is static JSON under
`web/public/bible/`, fetched client-side (STATE_OF_TRUTH §3, prod-verified). The relational Bible
framing in `docs/SCHEMA.md` was never built.
