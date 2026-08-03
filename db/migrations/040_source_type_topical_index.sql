-- ============================================================
-- 040: source_type gains 'topical_index' — BOTH constrained tables
-- ============================================================
-- Split from 039 (see its header): this half needs ACCESS EXCLUSIVE on
-- sources AND embeddings, which queues behind any long read transaction.
-- Apply with the retry loop; NOT VALID keeps the exclusive window at
-- milliseconds and VALIDATE (SHARE UPDATE EXCLUSIVE) never blocks writers.
--
-- TWO constraints on purpose. 038's header records the failure the first
-- time this was done half-way: sources and embeddings are independently
-- CHECK-constrained over DIFFERENT value sets, register-writer writes the
-- work's type into both, and extending only `sources` quarantined every
-- work of the new type at the embeddings insert.

SET lock_timeout = '2s';

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_source_type_check;
ALTER TABLE sources ADD CONSTRAINT sources_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'commentary'::text, 'sermon'::text, 'historian'::text, 'theology'::text,
    'father'::text, 'confession'::text, 'lexicon'::text, 'hymn'::text,
    'poetry'::text, 'art'::text, 'devotional'::text, 'topical_index'::text
  ])) NOT VALID;
ALTER TABLE sources VALIDATE CONSTRAINT sources_source_type_check;

ALTER TABLE embeddings DROP CONSTRAINT IF EXISTS embeddings_source_type_check;
ALTER TABLE embeddings ADD CONSTRAINT embeddings_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'commentary'::text, 'bible'::text, 'sermon'::text, 'father'::text,
    'theology'::text, 'confession'::text, 'lexicon'::text, 'hymn'::text,
    'poetry'::text, 'note'::text, 'document'::text, 'devotional'::text,
    'topical_index'::text
  ])) NOT VALID;
ALTER TABLE embeddings VALIDATE CONSTRAINT embeddings_source_type_check;

-- No schema_migrations INSERT here: db/apply-migration.mjs records the ledger
-- row with the file's sha256. An in-file INSERT would land first without a
-- checksum and the runner's pinned row would then conflict away (record-migration.mjs).
