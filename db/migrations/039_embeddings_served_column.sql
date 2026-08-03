-- ============================================================
-- 039: `embeddings.served` — publishing a work is what makes it served
-- ============================================================
-- WHAT THIS REPLACES. Four partial HNSW index predicates and four routing.ts constants each
-- inline a hand-typed list of work slugs. Adding a served work therefore costs a code edit AND a
-- rebuild migration AND an HNSW graph rebuild, kept in lockstep by two guard tests. That treadmill
-- is why 76 of the 77 works published to production on 2026-08-03 are readable on the shelf and
-- invisible to /ask: `sources.status='published'` and "served" are two unrelated facts, and only
-- the second one is wired to retrieval.
--
-- The lists are the twelfth instance of this repo's most frequent defect class (MASTER.md
-- failure-mode watchlist, artefact 1: a hand-maintained expected set). The others were closed by
-- DERIVATION. This one cannot be derived in the query, because a partial index predicate may not
-- contain a subquery — so it is MATERIALIZED instead: one boolean, maintained by the publish flip,
-- which is the only thing entitled to decide that a work is served.
--
-- ── WHY THIS IS SAFE, WHICH IS THE ONLY INTERESTING QUESTION ─────────────────────────────────
--
-- `LEGAL_CORPUS_FILTER` is an ALLOWLIST, and it is load-bearing in the licensing sense. The flat
-- table carries 124,955 rows with no `metadata->>'work'` key at all, and that cohort includes
-- Tyndale Study Notes (13,455), CS Lewis (745) and Origen of Alexandria (794) — copyrighted or
-- under a standing MUST_NOT_SERVE ruling (docs/AUTHOR_TRIAGE.md, docs/OWNER_ACTIONS.md). They are
-- unserved today for exactly one reason: their author string is not written in the allowlist.
-- Measured before this migration: the current filter admits 0 of their rows.
--
-- Replacing an allowlist with anything looser would be a licensing regression, so:
--
--   DEFAULT false.   A row is unserved unless something explicitly says otherwise. The failure
--                    direction is a work that does not serve, never a work that serves and
--                    should not. `NOT NULL` so there is no third state to reason about.
--   BACKFILL = TODAY. The UPDATE below reproduces the four current filters verbatim, so the
--                    served set immediately after this migration is byte-identical to the served
--                    set immediately before it. This migration changes the MECHANISM and changes
--                    no answer. Admitting the already-published works is a separate, measured
--                    step, run against the accuracy eval — not a side effect of a schema change.
--   NO WORK KEY,     A row with no `metadata->>'work'` can never be reached by the publish flip
--   NO PATH IN.      (which addresses rows by slug), so the Lewis/Tyndale/Origen cohort cannot be
--                    flipped true by any future publish. Under the old scheme they were excluded
--                    by not being named; under this one they are excluded by being unreachable.
--                    That is strictly stronger.
--
-- The verification that this migration is behaviour-preserving is NOT this comment: it is
-- scripts/verify-served-backfill.mjs, which diffs the row-id sets of old-filter vs new-filter on
-- both sides and fails on any difference. Run it before and after. Its red-proof seeds a single
-- flipped bit and watches the diff report it.
--
-- ── LOCKSTEP, WHICH IS THE POINT ─────────────────────────────────────────────────────────────
-- After this migration NO index predicate and NO routing constant names a work slug, so
-- legal-hnsw-index-sync.test.ts inverts: it stops asserting "the predicate lists every served
-- slug" and starts asserting "no predicate lists ANY slug". A future slug list in either place is
-- the regression, and the guard names it.
--
-- The surface a served row reaches is now its REGISTER, read off `source_type`, not its slug:
--   commentary, father    -> the composed /ask exegetical pool   (idx_embeddings_vector_legal)
--   sermon                -> the sermon lane                     (idx_embeddings_vector_sermon)
--   theology, confession  -> the theology lane                   (idx_embeddings_vector_theology)
--   hymn, poetry          -> the song/verse lane                 (idx_embeddings_vector_song_verse)
--   lexicon               -> served by nothing, deliberately (no lane exists; A8 decision list)
-- That IS the register wall, expressed once, in the column the ingest already writes.
--
-- ZERO-WINDOW, the 018 v3 / 011 pattern. Never drop-and-rebuild under the same name: while an
-- HNSW graph rebuilds there is no partial index, the planner falls back to the full-table index
-- at the default ef_search, and the selective register filter post-guts the neighbour list until
-- the base pool starves — silently, no error. That is how migration 009 died. Build under a new
-- name, let it go VALID, drop the old, rename in. A usable index exists at every instant.
--
-- CONCURRENTLY: run via db/apply-migration-concurrent.mjs (splits on --SPLIT--). Each statement
-- is sent separately in its OWN implicit transaction — neither CREATE INDEX CONCURRENTLY nor
-- DROP INDEX CONCURRENTLY may run inside a txn block. Run as neondb_owner.
--
-- Rollback: the column is additive and the backfill is reproducible from the filters it copies.
--   To revert, rebuild the four indexes from 018/037 predicates by the same zero-window pattern,
--   restore the routing constants, then `ALTER TABLE embeddings DROP COLUMN served`. The DROP is
--   last and is the only destructive step.
-- ============================================================

ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS served boolean NOT NULL DEFAULT false;
--SPLIT--
-- ── the backfill: EXACTLY the four filters as they stand today ───────────────────────────────
-- Leg 1 — the exegetical pool (LEGAL_CORPUS_FILTER ∧ PROSE_TYPE_SQL). Copied verbatim from
-- routing.ts, including the book-scoped Chrysostom/Augustine legs and the crosswire-URL leg,
-- because "verbatim" is the property being preserved and a tidied-up equivalent is not it.
UPDATE embeddings SET served = true
 WHERE user_id IS NULL
   AND source_type IN ('commentary','sermon','father','theology','confession','lexicon')
   AND (
        metadata->>'author' IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry')
     OR (metadata->>'author'='John Chrysostom'    AND (metadata->>'verseId')::int/1000000 IN (40,43,44))
     OR (metadata->>'author'='Augustine of Hippo' AND (metadata->>'verseId')::int/1000000 IN (19,43))
     OR (metadata->>'author' IN ('Albert Barnes','John Wesley','John Calvin') AND metadata->>'sourceUrl' ILIKE '%crosswire%')
     OR metadata->>'work' IN ('keil-delitzsch','catena-aurea','chrysostom-homilies','augustine-homilies')
   );
--SPLIT--
-- Leg 2 — the song/verse lane (SONG_VERSE_CORPUS_FILTER ∧ SONG_VERSE_TYPE_SQL).
UPDATE embeddings SET served = true
 WHERE user_id IS NULL
   AND source_type IN ('hymn','poetry')
   AND metadata->>'work' IN ('olney-hymns','scottish-psalter-1650','neale-eastern-hymns','watts-hymns','watts-psalms','keble-christian-year','herbert-temple','montgomery-sacred-poems','rossetti-verses','traherne-poems','milton-poetical-works','hopkins-poems','tennyson-in-memoriam','dante-divine-comedy','wheatley-poems');
--SPLIT--
-- Leg 3 — the sermon lane (SERMON_CORPUS_FILTER). NO source_type leg here, deliberately: the
-- shipped `lanePoolSql` has none either, and the backfill copies the shipped predicate rather
-- than an improved one. The index below DOES add `source_type='sermon'`; that is a tightening,
-- and it is safe only because every row this leg sets is already source_type='sermon' — asserted
-- by scripts/verify-served-backfill.mjs, not assumed.
UPDATE embeddings SET served = true
 WHERE user_id IS NULL
   AND metadata->>'work' IN ('spurgeon-sermons','maclaren-expositions','watson-works','flavel-works','edwards-works','wesley-sermons','spurgeon-talks-to-farmers');
--SPLIT--
-- Leg 4 — the theology lane (THEOLOGY_CORPUS_FILTER). Same note as leg 3.
UPDATE embeddings SET served = true
 WHERE user_id IS NULL
   AND metadata->>'work' IN ('owen-works','hodge-systematic','calvin-institutes','schaff-creeds');
--SPLIT--
-- ── idx_embeddings_vector_legal — the composed /ask exegetical pool ──────────────────────────
-- commentary + father ONLY. The six-type PROSE_TYPE_SQL it replaces was never the real pool
-- boundary: every row the author legs admitted was source_type='commentary', and the work leg
-- named commentary + father works, so `sermon/theology/confession/lexicon` were carried in the
-- type list and then excluded again by the allowlist. Naming the two registers that actually
-- compose makes the register wall structural instead of incidental.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_vector_legal_v7
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE (user_id IS NULL AND served AND source_type IN ('commentary','father'));
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_vector_legal;
--SPLIT--
ALTER INDEX idx_embeddings_vector_legal_v7 RENAME TO idx_embeddings_vector_legal;
--SPLIT--
-- ── idx_embeddings_vector_song_verse — the song/verse lane ───────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_vector_song_verse_v7
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE (user_id IS NULL AND served AND source_type IN ('hymn','poetry'));
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_vector_song_verse;
--SPLIT--
ALTER INDEX idx_embeddings_vector_song_verse_v7 RENAME TO idx_embeddings_vector_song_verse;
--SPLIT--
-- ── idx_embeddings_vector_sermon — the sermon lane ───────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_vector_sermon_v7
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE (user_id IS NULL AND served AND source_type = 'sermon');
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_vector_sermon;
--SPLIT--
ALTER INDEX idx_embeddings_vector_sermon_v7 RENAME TO idx_embeddings_vector_sermon;
--SPLIT--
-- ── idx_embeddings_vector_theology — the theology/confession lane ────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_vector_theology_v7
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE (user_id IS NULL AND served AND source_type IN ('theology','confession'));
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_vector_theology;
--SPLIT--
ALTER INDEX idx_embeddings_vector_theology_v7 RENAME TO idx_embeddings_vector_theology;
--SPLIT--
-- ── the served-row verseId btree, for the on-range injection paths ───────────────────────────
-- `idx_embeddings_verseid_registers` (018) stays as it is: it is register-scoped with no slug
-- list, so it is not on the treadmill this migration removes. This ADDS a served-scoped twin so
-- the injection CTE, which now carries `served`, has an index whose predicate it matches.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_verseid_served
  ON embeddings (((metadata->>'verseId')::int))
  WHERE (user_id IS NULL AND served);
