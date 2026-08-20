-- ============================================================
-- 119: history_embeddings — the history lane's OWN vector table (HISTORY_RETRIEVAL_DESIGN §2)
-- ============================================================
-- WHY A SEPARATE TABLE, measured not preferred (2026-08-19): `embeddings` carries 14 indexes /
-- 13 GB including an 8 GB all-rows HNSW; `served` appears in six index definitions so no update
-- is ever HOT, and each 4,100-byte row fills its page — flipping served runs at 20-36 rows/sec
-- and a register takes HOURS. History is greenfield: its own table keeps the graph tens of MB
-- and serving the whole register takes seconds. Voices registers STAY pooled in `embeddings`
-- because the exegetical search spans commentary+father in ONE vector query.
--
-- Keyed by section_id: history retrieval joins sections (heading path, period_*) and
-- section_history_anchors (entities) — the migration-016 model. Vectors come from
-- section_embeddings at backfill (ingest-historian has always written them) or at ingest.
--
-- NO RLS: corpus data only, no user rows ever (unlike `embeddings`, which mixes user_id rows).
-- app_runtime gets SELECT and nothing else — serving reads, never writes; served flips are
-- owner-terminal operations (serve-batched.mjs --table=history_embeddings).
--
-- IDEMPOTENT: IF NOT EXISTS throughout.
--   RUN (owner, dev-guarded): DATABASE_URL=<owner> node db/apply-migration.mjs db/migrations/119_history_embeddings.sql
--   ROLLBACK: DROP TABLE IF EXISTS history_embeddings;
CREATE TABLE IF NOT EXISTS history_embeddings (
  section_id BIGINT PRIMARY KEY REFERENCES sections(id) ON DELETE CASCADE,
  embedding  VECTOR(1024) NOT NULL,
  model_slug TEXT NOT NULL,
  served     BOOLEAN NOT NULL DEFAULT false
);

-- Served-partial HNSW, same shape as the idx_embeddings_served_* set. Plain CREATE (not
-- CONCURRENTLY): the table is empty at creation, so the build is instant and transactional.
CREATE INDEX IF NOT EXISTS idx_history_embeddings_served
  ON history_embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE served;

-- Default privileges on this cluster grant app_runtime DML on new tables (the migration-001
-- default; 032 narrowed the schema default but ALTER DEFAULT PRIVILEGES grants persist per
-- creating role). PROVEN: the DO tail below fired '119 FAILED: app_runtime holds a write
-- privilege' on the first dev apply, before this REVOKE existed. Revoke explicitly — the
-- grant matrix must be what this file says, not what a default left behind.
REVOKE ALL ON history_embeddings FROM app_runtime;
GRANT SELECT ON history_embeddings TO app_runtime;

-- Self-verifying tail (106/110/116 pattern): assert the grant matrix and the served default,
-- and RAISE so a partial apply can never read as green.
DO $$
BEGIN
  IF NOT has_table_privilege('app_runtime', 'history_embeddings', 'SELECT') THEN
    RAISE EXCEPTION '119 FAILED: app_runtime lacks SELECT on history_embeddings';
  END IF;
  IF has_table_privilege('app_runtime', 'history_embeddings', 'INSERT')
     OR has_table_privilege('app_runtime', 'history_embeddings', 'UPDATE')
     OR has_table_privilege('app_runtime', 'history_embeddings', 'DELETE') THEN
    RAISE EXCEPTION '119 FAILED: app_runtime holds a write privilege on history_embeddings';
  END IF;
  IF (SELECT column_default FROM information_schema.columns
       WHERE table_name='history_embeddings' AND column_name='served') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION '119 FAILED: history_embeddings.served default is not false';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i
      WHERE i.indexrelid = 'idx_history_embeddings_served'::regclass
        AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%served%') THEN
    RAISE EXCEPTION '119 FAILED: served-partial HNSW index missing or unpartialed';
  END IF;
END $$;
