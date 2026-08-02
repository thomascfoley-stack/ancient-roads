-- ============================================================
-- 037: TWO partial indexes follow one served-work addition
-- ============================================================
-- One slug was added to SERVED_SERMON_WORKS. TWO index predicates depend on that list and each
-- has its own guard, at different strictness — which is why this file has two halves:
--
--   idx_embeddings_vector_sermon  (HNSW, `embeddings`)          <- legal-hnsw-index-sync.test.ts
--       caught by a per-slug membership check.
--   idx_commentary_fts_legal      (GIN, `commentary_entries`)   <- fts-legal-index-sync.test.ts
--       caught by a BYTE-EXACT comparison against LEGAL_COMMENTARY_ENTRIES_PREDICATE. The
--       hnsw guard's own FTS case only checks prose + song/verse slugs and stayed green here;
--       the exact-comparison guard is what found the second index. Two guards over the same
--       file, and only the stricter one saw it.
--
-- BOTH HALVES SHIP IN ONE FILE ON PURPOSE. Applying one and not the other leaves exactly the
-- half-lockstep state these guards exist to prevent.
--
-- Note what the FTS half does NOT do: it makes the work's rows INDEXABLE, not SEARCHABLE in
-- commentary search. `EXEGETICAL_FTS_EXCLUSION` excludes every lane work at query time, so a
-- sermon still cannot surface as exegesis. The register wall is unaffected by this migration.
-- ============================================================
-- WHY. `spurgeon-talks-to-farmers` was added to SERVED_SERMON_WORKS on 2026-08-02 by owner
-- decision ("add it so all sermons are live"). It was the only clean, unquarantined sermon-type
-- work in `ingest/sources.config.json` absent from that list, with nothing on record explaining
-- the omission.
--
-- The served lists and these partial-index predicates MUST stay in lockstep
-- (`018_register_partial_indexes.sql:4-6`). They are not documentation of each other: if the
-- lane filter names a slug the index predicate does not, the planner cannot use the partial
-- index for that work and falls back to the full-table index, where the selective register
-- filter post-guts the neighbour list and the base pool starves — silently, with no error. That
-- is exactly how migration 009 died. `web/test/invariants/legal-hnsw-index-sync.test.ts` caught
-- this change and named the missing slug before this migration was written; that guard firing
-- is the reason this file exists.
--
-- ZERO-WINDOW, the 018 v3 / migration-011 pattern. Do NOT drop-and-rebuild under the same name:
-- while an HNSW graph rebuilds there is no partial index at all, which reopens the starvation
-- window on a live database. Build the replacement under a NEW name with the SAME opclass and
-- the new predicate, let it go VALID, drop the old serving index, then rename the new one into
-- the serving name. A usable index exists at every instant.
--
-- SCALE, so nobody plans a maintenance window for this: production carries ZERO register rows
-- today (`docs/STATE_OF_TRUTH.md`, G5 recorded VACUOUS — register ingest has never run on prod).
-- Building an HNSW index over an empty predicate is effectively instantaneous. On dev, where the
-- register corpus does exist, it is a real build.
--
-- CONCURRENTLY: run via `db/apply-migration-concurrent.mjs` (splits on --SPLIT--). Each statement
-- is sent separately in its OWN implicit transaction — neither CREATE INDEX CONCURRENTLY nor
-- DROP INDEX CONCURRENTLY may run inside a txn block. Run as neondb_owner.
--
-- Rollback: this is additive to a predicate and reversible by the same pattern in the other
--   direction (rebuild with the 6-slug list). The destructive step is the DROP, and it only ever
--   runs after the replacement is VALID.
--   Emergency: DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_vector_sermon_v6;
-- ============================================================

-- ── half 1: the sermon lane HNSW index ────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_vector_sermon_v6
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE (user_id IS NULL AND metadata->>'work' IN ('spurgeon-sermons','maclaren-expositions','watson-works','flavel-works','edwards-works','wesley-sermons','spurgeon-talks-to-farmers'));
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_embeddings_vector_sermon;
--SPLIT--
ALTER INDEX idx_embeddings_vector_sermon_v6 RENAME TO idx_embeddings_vector_sermon;
--SPLIT--
-- ── half 2: the legal FTS index ───────────────────────────────────────────────────────────
-- Byte-identical to LEGAL_COMMENTARY_ENTRIES_PREDICATE, including the provenance condition 035
-- added (deep audit H4/H5) — that condition is carried forward verbatim here, not re-derived.
-- 035 built _v6; this builds _v7 and renames it into the serving name.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commentary_fts_legal_v7
  ON commentary_entries USING GIN (tsv)
  WHERE ((author IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry','Barnes'' Notes','Albert Barnes','John Wesley','John Calvin')
   OR (author = 'John Chrysostom' AND book IN (40, 43, 44))
   OR (author = 'Augustine of Hippo' AND book IN (19, 43))
   OR work IN ('keil-delitzsch','catena-aurea','chrysostom-homilies','augustine-homilies','olney-hymns','scottish-psalter-1650','neale-eastern-hymns','watts-hymns','watts-psalms','keble-christian-year','herbert-temple','montgomery-sacred-poems','rossetti-verses','traherne-poems','milton-poetical-works','hopkins-poems','tennyson-in-memoriam','dante-divine-comedy','wheatley-poems','spurgeon-sermons','maclaren-expositions','watson-works','flavel-works','edwards-works','wesley-sermons','spurgeon-talks-to-farmers','owen-works','hodge-systematic','calvin-institutes','schaff-creeds'))
  AND (source_url IS NULL OR (source_url NOT ILIKE '%biblehub.com%' AND source_url NOT ILIKE '%studylight.org%' AND source_url NOT ILIKE '%historicalchristian.faith%')));
--SPLIT--
DROP INDEX CONCURRENTLY IF EXISTS idx_commentary_fts_legal;
--SPLIT--
ALTER INDEX idx_commentary_fts_legal_v7 RENAME TO idx_commentary_fts_legal;
