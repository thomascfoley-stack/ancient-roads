-- What Others Have Said — database schema
-- Neon Postgres with pgvector, RLS, per-user isolation

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgvector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- User profiles (extends Neon Auth user table)
-- ============================================================
CREATE TABLE user_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  avatar_url    TEXT,
  preferred_translation TEXT DEFAULT 'web',
  encryption_key_hash   TEXT,
  plan          TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'scholar')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_user_profiles_auth ON user_profiles(auth_user_id);

-- ============================================================
-- Channels (study groups, bible studies, classes)
-- ============================================================
CREATE TABLE channels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  pinned_sources JSONB DEFAULT '[]',
  settings    JSONB DEFAULT '{}',
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_channels_user ON channels(user_id);

-- ============================================================
-- Chats (DM conversations with LLM study partners)
-- ============================================================
CREATE TABLE chats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  persona     TEXT DEFAULT 'general',
  icon_color  TEXT DEFAULT '#6b7280',
  is_archived BOOLEAN DEFAULT false,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chats_user ON chats(user_id);

-- ============================================================
-- Messages (channel posts and chat messages)
-- ============================================================
CREATE TABLE messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  channel_id    UUID REFERENCES channels(id) ON DELETE CASCADE,
  chat_id       UUID REFERENCES chats(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content       TEXT NOT NULL,
  sources       JSONB DEFAULT '[]',
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT msg_belongs_to_one CHECK (
    (channel_id IS NOT NULL AND chat_id IS NULL) OR
    (channel_id IS NULL AND chat_id IS NOT NULL)
  )
);

CREATE INDEX idx_messages_channel ON messages(channel_id, created_at);
CREATE INDEX idx_messages_chat ON messages(chat_id, created_at);
CREATE INDEX idx_messages_user ON messages(user_id);

-- ============================================================
-- Chat memory (per-chat persistent context for LLM)
-- ============================================================
CREATE TABLE chat_memories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  chat_id     UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  fact_type   TEXT NOT NULL CHECK (fact_type IN (
    'struggle', 'interest', 'progress', 'preference', 'bookmark', 'note'
  )),
  content     TEXT NOT NULL,
  verse_refs  JSONB DEFAULT '[]',
  confidence  REAL DEFAULT 1.0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_memories_chat ON chat_memories(chat_id) WHERE is_active = true;
CREATE INDEX idx_chat_memories_user ON chat_memories(user_id);

-- ============================================================
-- Reading history
-- ============================================================
CREATE TABLE reading_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  book_slug     TEXT NOT NULL,
  chapter       INT NOT NULL,
  translation   TEXT DEFAULT 'web',
  time_spent_ms INT,
  read_at       TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, book_slug, chapter, read_at)
);

CREATE INDEX idx_reading_history_user ON reading_history(user_id, read_at DESC);

-- ============================================================
-- User library (uploaded files, purchased books)
-- ============================================================
CREATE TABLE user_library (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  title         TEXT NOT NULL,
  file_type     TEXT NOT NULL CHECK (file_type IN (
    'pdf', 'epub', 'audio', 'video', 'notes', 'image'
  )),
  storage_key   TEXT NOT NULL,
  size_bytes    BIGINT,
  mime_type     TEXT,
  is_purchased  BOOLEAN DEFAULT false,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_user_library_user ON user_library(user_id);

-- ============================================================
-- Study guides (topical studies, reading plans)
-- ============================================================
CREATE TABLE study_guides (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  channel_id    UUID REFERENCES channels(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  topic         TEXT,
  description   TEXT,
  sections      JSONB DEFAULT '[]',
  progress      JSONB DEFAULT '{}',
  is_template   BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_study_guides_user ON study_guides(user_id);

-- ============================================================
-- Embeddings store (pgvector for semantic search)
-- ============================================================
CREATE TABLE embeddings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT,
  source_type   TEXT NOT NULL CHECK (source_type IN (
    'bible_verse', 'commentary', 'user_upload', 'sermon_transcript',
    'study_note', 'book_chapter'
  )),
  source_id     TEXT NOT NULL,
  chunk_index   INT DEFAULT 0,
  content       TEXT NOT NULL,
  embedding     vector(1024),
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- UNIQUE so ingestion can upsert with ON CONFLICT (source_type, source_id, chunk_index);
-- also serves (source_type, source_id) prefix lookups.
CREATE UNIQUE INDEX idx_embeddings_source ON embeddings(source_type, source_id, chunk_index);
CREATE INDEX idx_embeddings_user ON embeddings(user_id) WHERE user_id IS NOT NULL;
-- Prod is HNSW (verified via pg_indexes 2026-07-13): USING hnsw (embedding vector_cosine_ops).
-- The earlier ivfflat/lists=100 line was stale — HNSW gives better recall/latency at this
-- corpus size and is what production actually runs. Query-time knobs: hnsw.ef_search (default
-- 40) and hnsw.iterative_scan (see docs/PHASE_A_DIAGNOSIS.md for the recall/latency tradeoff).
CREATE INDEX idx_embeddings_vector ON embeddings USING hnsw (embedding vector_cosine_ops);

-- BM25 full-text search index
ALTER TABLE embeddings ADD COLUMN tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX idx_embeddings_fts ON embeddings USING gin(tsv);

-- ============================================================
-- Connected integrations (Composio account references)
-- ============================================================
CREATE TABLE user_integrations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               TEXT NOT NULL,
  provider              TEXT NOT NULL,
  composio_account_id   TEXT NOT NULL,
  status                TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  scopes                JSONB DEFAULT '[]',
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, provider)
);

CREATE INDEX idx_user_integrations_user ON user_integrations(user_id);

-- ============================================================
-- Row-Level Security policies
-- ============================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own data
-- current_setting('app.current_user_id') is set per-request from the JWT

CREATE POLICY user_profiles_policy ON user_profiles
  USING (auth_user_id = current_setting('app.current_user_id', true))
  WITH CHECK (auth_user_id = current_setting('app.current_user_id', true));

CREATE POLICY channels_policy ON channels
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE POLICY chats_policy ON chats
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE POLICY messages_policy ON messages
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE POLICY chat_memories_policy ON chat_memories
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE POLICY reading_history_policy ON reading_history
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE POLICY user_library_policy ON user_library
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE POLICY study_guides_policy ON study_guides
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

-- Embeddings: platform content (user_id IS NULL) readable by all, user content isolated
CREATE POLICY embeddings_read_policy ON embeddings FOR SELECT
  USING (
    user_id IS NULL
    OR user_id = current_setting('app.current_user_id', true)
  );

CREATE POLICY embeddings_write_policy ON embeddings FOR INSERT
  WITH CHECK (
    user_id IS NULL
    OR user_id = current_setting('app.current_user_id', true)
  );

CREATE POLICY user_integrations_policy ON user_integrations
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

-- ============================================================
-- Helper: hybrid search function (BM25 + vector cosine)
-- ============================================================
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text TEXT,
  query_embedding vector(1024),
  match_count INT DEFAULT 10,
  bm25_weight REAL DEFAULT 0.4,
  vector_weight REAL DEFAULT 0.6,
  filter_user_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  source_type TEXT,
  source_id TEXT,
  content TEXT,
  metadata JSONB,
  bm25_score REAL,
  vector_score REAL,
  combined_score REAL
)
LANGUAGE sql STABLE AS $$
  WITH bm25 AS (
    SELECT e.id, ts_rank_cd(e.tsv, websearch_to_tsquery('english', query_text)) AS score
    FROM embeddings e
    WHERE e.tsv @@ websearch_to_tsquery('english', query_text)
      AND (filter_user_id IS NULL OR e.user_id IS NULL OR e.user_id = filter_user_id)
    ORDER BY score DESC
    LIMIT match_count * 3
  ),
  vec AS (
    SELECT e.id, 1 - (e.embedding <=> query_embedding) AS score
    FROM embeddings e
    WHERE (filter_user_id IS NULL OR e.user_id IS NULL OR e.user_id = filter_user_id)
    ORDER BY e.embedding <=> query_embedding
    LIMIT match_count * 3
  ),
  combined AS (
    SELECT
      COALESCE(b.id, v.id) AS id,
      COALESCE(b.score, 0)::REAL AS bm25_score,
      COALESCE(v.score, 0)::REAL AS vector_score,
      (COALESCE(b.score, 0) * bm25_weight + COALESCE(v.score, 0) * vector_weight)::REAL AS combined_score
    FROM bm25 b FULL OUTER JOIN vec v ON b.id = v.id
  )
  SELECT
    e.id, e.source_type, e.source_id, e.content, e.metadata,
    c.bm25_score, c.vector_score, c.combined_score
  FROM combined c
  JOIN embeddings e ON e.id = c.id
  ORDER BY c.combined_score DESC
  LIMIT match_count;
$$;

-- ============================================================
-- User annotations: highlights + notes (see docs/USER_DATA.md)
-- Anchored to the canonical verse id (book*1e6 + chapter*1e3 + verse),
-- translation-independent. Sync-ready: uuid pk, updated_at, deleted_at.
-- ============================================================

CREATE TABLE IF NOT EXISTS highlights (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  verse_id      INTEGER NOT NULL,
  verse_end     INTEGER,
  color         TEXT NOT NULL DEFAULT 'yellow',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_highlights_user_verse ON highlights(user_id, verse_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS notes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  verse_id      INTEGER NOT NULL,
  verse_end     INTEGER,
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_user_verse ON notes(user_id, verse_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes(user_id, updated_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS highlights_policy ON highlights;
CREATE POLICY highlights_policy ON highlights
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

DROP POLICY IF EXISTS notes_policy ON notes;
CREATE POLICY notes_policy ON notes
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));
