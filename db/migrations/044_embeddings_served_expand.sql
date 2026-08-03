-- ============================================================
-- 044 (EXPAND): `embeddings.served` — publishing a work is what makes it served
-- ============================================================
-- HISTORY. This file was first committed as 039_embeddings_served_column.sql at 4f14f17. A
-- 16-agent audit on 2026-08-03 confirmed two defects and this rewrite closes both:
--
--   1. NUMBER COLLISION. The concurrent /plans slice already occupies 039, 040 and 041
--      (039_plans_coverage_topical, 040_source_type_topical_index, 041_plans_delivery_fields —
--      applied to dev and ci under those filenames per their session records — NOTE the schema_migrations ledger table does NOT exist on those targets, the runner warns NOT RECORDED, so the filenames are pinned by git and the records, not by any database). Two documents saying
--      "apply 039 to prod" meant different files. This migration is 044; the contract half is 045.
--
--   2. DROP-WHILE-LIVE. The 4f14f17 version built the new indexes, then DROPped the old serving
--      indexes and RENAMEd the new ones into their names — in the same file. Between that apply
--      and the web deploy, the live bundle still filters on the author allowlist, which the
--      planner cannot prove implies `served`; with the old indexes gone it walks the full-table
--      HNSW and the selective filter starves the pool. Silently. The migration-009 mechanism,
--      reintroduced by the migration whose header explains it. THIS file therefore creates the
--      new indexes under NEW FINAL NAMES and DROPS NOTHING: both index sets coexist across the
--      deploy window. 045_embeddings_served_contract.sql drops the old set, and may run ONLY
--      after the new bundle is confirmed live.
--
-- WHAT THIS REPLACES. Four partial HNSW index predicates and four routing.ts constants each
-- inlined a hand-typed list of work slugs. Adding a served work therefore cost a code edit AND a
-- rebuild migration AND an HNSW graph rebuild, in lockstep, forever. That treadmill is why 76 of
-- the 77 works published to production on 2026-08-03 are readable on the shelf and invisible to
-- /ask: `sources.status='published'` and "served" were two unrelated facts.
--
-- The lists were the thirteenth instance of the hand-maintained-expected-set class (MASTER.md
-- watchlist, artefact 1). The others were closed by DERIVATION. This one cannot be derived in the
-- query, because a partial index predicate may not contain a subquery — so it is MATERIALIZED:
-- one boolean, written by the publish flip in the same transaction that moves `sources.status`.
--
-- SCOPE OF THE CLAIM (the 2026-08-03 audit caught the original overclaim): after this migration
-- no VECTOR-RETRIEVAL predicate — the four HNSW partial indexes and the four *_CORPUS_FILTER /
-- LEGAL_CORPUS_FILTER constants — names a work slug. Three OTHER surfaces still consume the
-- frozen slug lists as LIVE gates and are NOT moved by this cutover: the commentary_entries FTS
-- predicate, the static-reader PUBLISHED_WORKS filter, and EXEGETICAL_FTS_EXCLUSION
-- (web/src/lib/legal-corpus.ts). Their cutover is separate, filed work.
--
-- ── WHY THE BACKFILL IS SAFE, WHICH IS THE ONLY INTERESTING QUESTION ─────────────────────────
--
-- The old LEGAL_CORPUS_FILTER was an ALLOWLIST, load-bearing in the licensing sense. The flat
-- table carries ~125k rows with no `metadata->>'work'` key, and that cohort includes Tyndale
-- Study Notes, CS Lewis and Origen of Alexandria — copyrighted or under a standing
-- MUST_NOT_SERVE ruling. They were unserved because their author string was not in the list.
--
--   DEFAULT false.   A row is unserved unless something explicitly says otherwise. NOT NULL, so
--                    there is no third state.
--   BACKFILL = the four pre-cutover filters VERBATIM. The served set immediately after this
--                    migration is byte-identical to the served set immediately before it. The
--                    mechanism changes; no answer changes. Serving the 88 published-but-unserved
--                    works is a separate, owner-gated, measured flip — never a schema side effect.
--   NO WORK KEY, NO PATH IN. The publish flip addresses rows by slug; the work-less cohort has
--                    none, so no future flip can reach it. Unreachable, not merely unnamed.
--
-- The backfill legs below are the FROZEN RECORD of the pre-cutover filters. They exist in one
-- other place: scripts/lib/served-backfill-frozen.mjs, which verify-served-backfill.mjs uses as
-- its EXPECTED set (it must never re-derive the expectation from the live routing.ts — the
-- original verifier did, the same commit rewrote routing.ts to `(served)`, and every licensing
-- check in it went circular or vacuous; audit finding 1, CONFIRMED). A sync test asserts this
-- file and the frozen module carry identical predicates.
--
-- ── LOCK AND COST DISCIPLINE (audit finding 5) ───────────────────────────────────────────────
-- ADD COLUMN takes ACCESS EXCLUSIVE for an instant, but with no lock_timeout it QUEUES behind
-- any long reader and everything else queues behind IT. The session SET below caps that. On PG11+
-- ADD COLUMN ... DEFAULT false NOT NULL is a catalog-only change (no table rewrite).
-- maintenance_work_mem is raised for the HNSW builds — tune DOWN if the target compute is small.
-- NOBODY HAS TIMED an HNSW build at this scale in this repo: time the dev apply and set the prod
-- session budget from that number, not from hope.
--
-- CONCURRENTLY: run via db/apply-migration-concurrent.mjs (splits on --SPLIT--; single client
-- session, so the SETs persist across groups; CIC groups must stay single-statement). Run as
-- neondb_owner. Dev first, per the filed order.
--
-- Rollback: the column is additive; nothing is dropped here. To revert: DROP the five new
-- indexes CONCURRENTLY, then ALTER TABLE embeddings DROP COLUMN served. The old serving indexes
-- are untouched by this file, so the old bundle keeps working throughout.
-- ============================================================

-- lock_timeout guards ONLY the ALTER: it is the statement that takes ACCESS EXCLUSIVE and can
-- wedge a live database behind a long reader. It is then reset to 0 BEFORE the CIC builds,
-- because CONCURRENTLY legitimately waits out long transactions in its final phases — a 5s cap
-- there makes the build flaky-by-design on exactly the busy database it defends (bylaw-4
-- refuter, 2026-08-03). If the ALTER aborts on the timeout: re-run this migration; the ALTER is
-- IF NOT EXISTS and the backfill UPDATEs are idempotent (they re-run in full — accepted cost).
-- The runner refuses pooled (-pooler) hosts, so these session SETs provably reach one backend.
SET lock_timeout = '5s';
SET maintenance_work_mem = '256MB';
--SPLIT--
ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS served boolean NOT NULL DEFAULT false;
--SPLIT--
SET lock_timeout = 0;
--SPLIT--
-- ── the backfill: EXACTLY the four pre-cutover filters (frozen record; see header) ───────────
-- Leg 1 — the exegetical pool (old LEGAL_CORPUS_FILTER ∧ old PROSE_TYPE_SQL), verbatim,
-- including the book-scoped Chrysostom/Augustine legs and the crosswire-URL leg.
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
-- Leg 2 — the song/verse lane (old SONG_VERSE_CORPUS_FILTER ∧ SONG_VERSE_TYPE_SQL).
UPDATE embeddings SET served = true
 WHERE user_id IS NULL
   AND source_type IN ('hymn','poetry')
   AND metadata->>'work' IN ('olney-hymns','scottish-psalter-1650','neale-eastern-hymns','watts-hymns','watts-psalms','keble-christian-year','herbert-temple','montgomery-sacred-poems','rossetti-verses','traherne-poems','milton-poetical-works','hopkins-poems','tennyson-in-memoriam','dante-divine-comedy','wheatley-poems');
--SPLIT--
-- Leg 3 — the sermon lane (old SERMON_CORPUS_FILTER). NO source_type conjunct, deliberately: the
-- shipped lanePoolSql had none, and the backfill copies the shipped predicate, not an improved
-- one. The index below adds `source_type='sermon'`; that tightening is safe only because every
-- row this leg sets is already sermon-typed — asserted by verify-served-backfill.mjs, not assumed.
UPDATE embeddings SET served = true
 WHERE user_id IS NULL
   AND metadata->>'work' IN ('spurgeon-sermons','maclaren-expositions','watson-works','flavel-works','edwards-works','wesley-sermons','spurgeon-talks-to-farmers');
--SPLIT--
-- Leg 4 — the theology lane (old THEOLOGY_CORPUS_FILTER). Same note as leg 3.
UPDATE embeddings SET served = true
 WHERE user_id IS NULL
   AND metadata->>'work' IN ('owen-works','hodge-systematic','calvin-institutes','schaff-creeds');
--SPLIT--
-- ── idx_embeddings_served_legal — the composed /ask exegetical pool ──────────────────────────
-- commentary + father ONLY. The six-type PROSE_TYPE_SQL was never the pool's real boundary:
-- every row the author legs admitted was commentary, and the work leg named commentary + father
-- works. Naming the two composing registers makes the register wall structural.
-- NEW FINAL NAME — no rename, no drop. The old idx_embeddings_vector_legal keeps serving the old
-- bundle until 045.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_served_legal
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE (user_id IS NULL AND served AND source_type IN ('commentary','father'));
--SPLIT--
-- ── idx_embeddings_served_song_verse — the song/verse lane ───────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_served_song_verse
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE (user_id IS NULL AND served AND source_type IN ('hymn','poetry'));
--SPLIT--
-- ── idx_embeddings_served_sermon — the sermon lane ───────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_served_sermon
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE (user_id IS NULL AND served AND source_type = 'sermon');
--SPLIT--
-- ── idx_embeddings_served_theology — the theology/confession lane ────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_served_theology
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE (user_id IS NULL AND served AND source_type IN ('theology','confession'));
--SPLIT--
-- ── the served-row verseId btree, for the on-range injection and diversity-backfill paths ────
-- `idx_embeddings_verseid_registers` (018) stays: register-scoped, no slug list, not on the
-- treadmill. This ADDS a served-scoped twin whose predicate the rewritten CTEs imply.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_verseid_served
  ON embeddings (((metadata->>'verseId')::int))
  WHERE (user_id IS NULL AND served);
--SPLIT--
-- ── the work-key btree, for the flip's own writes and every reconcile/census read ────────────
-- The flip (served UPDATE, servedBefore census, banned-author gate) and the reconciliation
-- instrument all address rows by metadata->>'work'; without this every one is a full-table scan
-- inside the flip's transaction, times 10-20 planned catch-up batches (bylaw-4 refuter). NOT
-- served-predicated: un-serve targets rows in BOTH states.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_work
  ON embeddings ((metadata->>'work'))
  WHERE (user_id IS NULL);
