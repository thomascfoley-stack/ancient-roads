-- ============================================================
-- 108: embeddings source_type gains 'historian' (corpus-backlog #6)
-- ============================================================
-- The historian lane (RULED "build it" 2026-08-13, docs/pm/orders/
-- 2026-08-13-corpus-backlog-decisions.md decision 6) serves flat `embeddings` rows
-- with source_type='historian' — but the table's CHECK has never allowed that value,
-- so the first josephus-whiston backfill insert failed closed on
-- embeddings_source_type_check. `sources` already allows 'historian' (040's list);
-- this is the 038-header lesson in reverse: the two tables are independently
-- constrained over different value sets, and this time the SOURCES side was the one
-- already extended.
--
-- Same idiom as 038/040: NOT VALID keeps the ACCESS EXCLUSIVE window at
-- milliseconds, VALIDATE (SHARE UPDATE EXCLUSIVE) never blocks writers. Dev first;
-- prod gets it with the owner-gated serve flip, not before.

SET lock_timeout = '2s';

ALTER TABLE embeddings DROP CONSTRAINT IF EXISTS embeddings_source_type_check;
ALTER TABLE embeddings ADD CONSTRAINT embeddings_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'commentary'::text, 'bible'::text, 'sermon'::text, 'father'::text,
    'theology'::text, 'confession'::text, 'lexicon'::text, 'hymn'::text,
    'poetry'::text, 'note'::text, 'document'::text, 'devotional'::text,
    'topical_index'::text, 'historian'::text
  ])) NOT VALID;
ALTER TABLE embeddings VALIDATE CONSTRAINT embeddings_source_type_check;

-- No schema_migrations INSERT here: db/apply-migration.mjs records the ledger
-- row with the file's sha256. An in-file INSERT would land first without a
-- checksum and the runner's pinned row would then conflict away (record-migration.mjs).
