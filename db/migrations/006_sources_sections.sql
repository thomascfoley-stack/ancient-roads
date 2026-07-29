-- ============================================================
-- 006: sources / sections / section_anchors / section_embeddings
-- ============================================================
-- The corpus-model target (ADR-010, docs/MIGRATION_DESIGN.md). ADDITIVE: creates
-- new tables only; does NOT touch commentary_entries / embeddings or retrieval
-- (dual-read until parity is proven, then cutover). Idempotent — re-runnable.
-- Run as neondb_owner:  DATABASE_URL=<owner-url> node db/apply-migration.mjs db/migrations/006_sources_sections.sql
-- (public corpus data — no RLS; app_runtime gets SELECT only, per ADR-009.)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- The license + provenance registry (ADR-008/010). Every row carries a NOT NULL
-- license (Gate B) and a status the QA gate flips staged -> published.
CREATE TABLE IF NOT EXISTS sources (
  id           BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  author       TEXT NOT NULL,
  author_died  SMALLINT,
  year_written SMALLINT,
  source_type  TEXT NOT NULL CHECK (source_type IN
    ('commentary','sermon','historian','theology','father','confession','lexicon')),
  tradition    TEXT NOT NULL,
  era          TEXT NOT NULL,
  language     TEXT NOT NULL DEFAULT 'en',
  license      TEXT NOT NULL,
  provenance   JSONB NOT NULL,
  status       TEXT NOT NULL DEFAULT 'staged'
               CHECK (status IN ('staged','published','quarantined'))
);

-- The retrieval unit. body = the exact text that produced the reused vector
-- (MIGRATION_DESIGN §1). Surrogate id => later expansion is append-only (§4.1).
CREATE TABLE IF NOT EXISTS sections (
  id         BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  source_id  BIGINT NOT NULL REFERENCES sources(id),
  ordinal    INT NOT NULL,
  heading    TEXT,
  body       TEXT NOT NULL,
  tsv        TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', body)) STORED,
  UNIQUE (source_id, ordinal)
);
CREATE INDEX IF NOT EXISTS sections_tsv_idx    ON sections USING GIN (tsv);
CREATE INDEX IF NOT EXISTS sections_source_idx ON sections (source_id);

-- The verse-join that powers "N views on this verse". verse_id = book*1e6 + ch*1e3 + verse.
CREATE TABLE IF NOT EXISTS section_anchors (
  section_id     BIGINT NOT NULL REFERENCES sections(id),
  verse_id_start INT NOT NULL,
  verse_id_end   INT NOT NULL,
  PRIMARY KEY (section_id, verse_id_start)
);
CREATE INDEX IF NOT EXISTS anchors_range_idx ON section_anchors (verse_id_start, verse_id_end);

-- Embeddings live apart from content: re-embedding is a rebuild, not a migration.
-- PK (section_id, model_slug) => one vector per section per model (MIGRATION_DESIGN §5.1).
CREATE TABLE IF NOT EXISTS section_embeddings (
  section_id BIGINT NOT NULL REFERENCES sections(id),
  model_slug TEXT NOT NULL,               -- 'bge-large-en-v1.5' (ADR-005, pinned)
  embedding  VECTOR(1024) NOT NULL,
  PRIMARY KEY (section_id, model_slug)
);
CREATE INDEX IF NOT EXISTS se_hnsw_idx ON section_embeddings USING hnsw (embedding vector_cosine_ops);

-- Least-privilege runtime (SEC-2 / ADR-009): read-only.
GRANT SELECT ON sources, sections, section_anchors, section_embeddings TO app_runtime;
