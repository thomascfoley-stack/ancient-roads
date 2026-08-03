-- ============================================================
-- 038: `devotional` becomes a source_type
-- ============================================================
-- The register the app did not have. `sources.source_type` permitted ten values
-- (commentary, sermon, historian, theology, father, confession, lexicon, hymn,
-- poetry, art) and a devotional is none of them: it is neither exegesis on a
-- passage nor a sermon preached, and filing Morning and Evening under either
-- would put daily readings into a lane that composes them as commentary.
--
-- WHY A CHECK CONSTRAINT AND NOT A LOOKUP TABLE. The existing column is a CHECK
-- and every tool in the repo reads source_type as a bare string; converting to a
-- reference table here would be a schema change rippling through the register
-- writer, the routing lists, the catalogs and the copier, for no gain today. The
-- cost of the CHECK is that adding a type needs a migration, which is this file,
-- and that is the correct amount of friction for a decision that changes what
-- kinds of thing the product claims to hold.
--
-- NOT CONCURRENT, and it does not need to be: ALTER TABLE ... DROP/ADD CONSTRAINT
-- on `sources` takes an ACCESS EXCLUSIVE lock on a table of 47 rows for the
-- duration of one validating scan. The register tables are the large ones; this
-- is not one of them.
--
-- Reversal: restore the previous ARRAY without 'devotional'. That will FAIL while
-- any row uses it, which is the desired behaviour — a type cannot be un-declared
-- out from under live data.

-- TWO TABLES, TWO CONSTRAINTS, AND THE SECOND ONE BIT. `sources.source_type` and
-- `embeddings.source_type` are independently CHECK-constrained over DIFFERENT
-- value sets, and register-writer writes the work's type into both. The first
-- version of this migration extended only `sources`, so all ten devotional works
-- quarantined on `embeddings_source_type_check` — the adapter loop's 30%
-- circuit-breaker halted the run at 4/4, which is the breaker doing its job.
--
-- The two lists genuinely differ and are not being unified here: `sources` uses
-- 'art' where the flat store uses 'bible'/'note'/'document', because one names
-- what a work IS and the other names what a retrieval row is FOR. Reconciling
-- them is a bigger change than declaring one new type, and doing it inside this
-- migration would hide that decision inside an unrelated one.

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_source_type_check;

ALTER TABLE sources ADD CONSTRAINT sources_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'commentary'::text,
    'sermon'::text,
    'historian'::text,
    'theology'::text,
    'father'::text,
    'confession'::text,
    'lexicon'::text,
    'hymn'::text,
    'poetry'::text,
    'art'::text,
    'devotional'::text
  ]));

-- The flat retrieval store's own list. Same addition, different permitted set —
-- see the note above on why the two are not being unified here.
ALTER TABLE embeddings DROP CONSTRAINT IF EXISTS embeddings_source_type_check;

ALTER TABLE embeddings ADD CONSTRAINT embeddings_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'commentary'::text,
    'bible'::text,
    'sermon'::text,
    'father'::text,
    'theology'::text,
    'confession'::text,
    'lexicon'::text,
    'hymn'::text,
    'poetry'::text,
    'note'::text,
    'document'::text,
    'devotional'::text
  ]));
