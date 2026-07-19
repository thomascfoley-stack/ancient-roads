-- ============================================================
-- 024: sections.unit_ordinal — first-class reading-unit grouping (ADR-026)
-- ============================================================
-- `sections` is the RETRIEVAL unit (embedding-sized chunks); the Book Reader must
-- reconstruct a readable work. ADR-026: add a durable `sections.unit_ordinal`
-- grouping column — a stable reading-unit key, populated at ingest and backfilled
-- here for existing sources. The reader orders by (unit_ordinal, ordinal);
-- annotation anchoring is unchanged (still section_id + offset into sections.body).
--
-- Backfill rule (set-based, per source, dense gapless 1..N in reading order) —
-- the three real data shapes on dev (verified 2026-07-19):
--   1. SERMON-SHAPED (ingest-sermon.ts): headings like "TITLE — ref (1/3)". All
--      chunks of one multi-chunk title = ONE unit, keyed by the heading with the
--      trailing " (i/n)" stripped — grouped per KEY (not per consecutive run), so
--      a mis-ordered/interleaved chunk set still reassembles (the ADR-026
--      red-first). Dev-verified 2026-07-19: zero stripped keys span separated
--      runs in the real corpus, so key-grouping and run-grouping coincide there.
--   2. REGISTER-SHAPED (repoint-sections-work.ts): multi-chunk logical sections
--      share an identical heading ("To Maecenas" x3); a lone section with a
--      unique heading is its own unit. Bare (non-suffixed) headings group by
--      CONSECUTIVE RUN only — dev-verified 2026-07-19: 136 bare headings repeat
--      across separated runs (owen-works has "Chapter III." in each of its 11
--      books — 509 sections; milton "THE ARGUMENT." x3), so global merging would
--      weld refrains into false mega-units. (repoint's "<title> — chunk N"
--      fallback headings are unique per ordinal → one-section-per-unit.)
--   3. VERSE-ANCHORED (migrate-sections-slice.ts: keil-delitzsch, matthew-henry):
--      heading IS NULL, section_anchors.verse_id_start present (book*1e6 + ch*1e3
--      + v). Unit = the chapter (min(verse_id_start)/1000 per section), units
--      ordered by chapter — canonical verse order, so this REPAIRS any ordinal
--      drift (a work ingested in slices); well-formed ingests are unaffected
--      (their ordinal already follows verseId, so runs == chapters).
--   FALLBACK: a section matching none of these (no heading, no anchor) is its own
--      unit at its ordinal position. Zero such rows exist on dev today; the rule
--      exists so the backfill can never leave a NULL.
--
-- ZERO-WINDOW-SAFE (ADR-025), why:
--   * ADD COLUMN with NO DEFAULT is catalog-metadata-only in Postgres — an instant
--     ACCESS EXCLUSIVE for the catalog bump, NO table rewrite (nothing to backfill
--     at the storage layer). The 307k-row table is never rewritten.
--   * The backfill is ONE set-based UPDATE: RowExclusive table lock + row locks on
--     updated rows. MVCC — SELECTs (the serving path) are NEVER blocked; readers
--     see the pre- or post-update snapshot, never a torn state. No long lock:
--     nothing queues behind a table rewrite because there isn't one.
--   * The index is a BRAND-NEW index built with CREATE INDEX CONCURRENTLY — no
--     serving index is dropped or rebuilt (the 009 failure mode ADR-025 bans does
--     not arise; there is no old index to drop). Reads/writes continue during the
--     build. It is created AFTER the backfill so the UPDATE pays no index
--     maintenance and the build scans populated data once.
-- Nullable during/after backfill by design (ingest populates it going forward);
-- there is deliberately no CHECK/NOT NULL yet — that is a later migration's call
-- once the reader contract is live.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS; the backfill recomputes only sources that
-- still have a NULL unit_ordinal (a no-op re-run); CREATE INDEX CONCURRENTLY
-- IF NOT EXISTS (the concurrent runner pre-cleans INVALID leftovers and
-- post-asserts VALID+READY).
--
-- RUN (owner, dev-guarded):  node db/apply-migration-concurrent.mjs db/migrations/024_sections_unit_ordinal.sql
-- (CONCURRENTLY cannot run inside a txn block — the runner splits on --SPLIT--
-- and autocommits each part, exactly like 018/019.)
--
-- ROLLBACK (safe: nothing references the column — the reader code that will read
-- it lands after this migration; the app_runtime grant is table-level SELECT on
-- sections, so no column-level grant to unwind):
--   DROP INDEX CONCURRENTLY IF EXISTS sections_unit_ordinal_idx;
--   ALTER TABLE sections DROP COLUMN IF EXISTS unit_ordinal;
-- ============================================================

ALTER TABLE sections ADD COLUMN IF NOT EXISTS unit_ordinal INTEGER;
--SPLIT--
-- Set-based backfill (no per-row JS). Scoped to sources that still have a NULL
-- unit_ordinal, so a re-run after a full backfill is a no-op, and a re-run with a
-- fresh partially-filled source recomputes exactly that source.
WITH need AS (
  SELECT DISTINCT source_id FROM sections WHERE unit_ordinal IS NULL
),
base AS (
  SELECT s.id, s.source_id, s.ordinal, NULLIF(s.heading, '') AS heading, an.vstart
  FROM sections s
  JOIN need n ON n.source_id = s.source_id
  LEFT JOIN LATERAL (
    SELECT min(a.verse_id_start) AS vstart
    FROM section_anchors a
    WHERE a.section_id = s.id
  ) an ON (NULLIF(s.heading, '') IS NULL)
),
keyed AS (
  SELECT id, source_id, ordinal, vstart,
         CASE
           -- 'h|': chunk-suffixed title — whole group per stripped key
           WHEN heading ~ ' \([0-9]+/[0-9]+\)$'
             THEN 'h|' || regexp_replace(heading, ' \([0-9]+/[0-9]+\)$', '')
           -- 'r|': bare heading — run-scoped below (refrains must not merge)
           WHEN heading IS NOT NULL THEN 'r|' || heading
           -- 'c|': verse-anchored — the chapter
           WHEN vstart IS NOT NULL THEN 'c|' || (vstart / 1000)
           -- 's|': fallback singleton
           ELSE 's|' || id
         END AS grp
  FROM base
),
islands AS (
  -- gaps-and-islands: adjacent equal-grp runs in ordinal order
  SELECT id, source_id, ordinal, grp, vstart,
         row_number() OVER (PARTITION BY source_id ORDER BY ordinal)
       - row_number() OVER (PARTITION BY source_id, grp ORDER BY ordinal) AS island
  FROM keyed
),
units AS (
  -- Unit membership: bare-heading ('r|') groups are a CONSECUTIVE RUN (island);
  -- chunk-suffix ('h|') groups are the whole stripped key (interleave-tolerant);
  -- chapter ('c|') groups are the chapter itself; 's|' keys are already unique.
  SELECT id, source_id, ordinal, grp, vstart,
         CASE WHEN grp LIKE 'r|%' THEN grp || '|' || island ELSE grp END AS unit_key
  FROM islands
),
unit_sort AS (
  -- Unit order: headed/singleton units by first appearance (min ordinal);
  -- chapter units by canonical chapter (the *1e6 keeps chapter-major order and
  -- sorts chapter units after same-source headed units in mixed sources).
  SELECT source_id, unit_key,
         min(CASE WHEN grp LIKE 'c|%' THEN (vstart / 1000)::bigint * 1000000 + ordinal
                  ELSE ordinal::bigint END) AS sort_key
  FROM units
  GROUP BY source_id, unit_key
),
numbered AS (
  SELECT source_id, unit_key,
         dense_rank() OVER (PARTITION BY source_id ORDER BY sort_key, unit_key)::int AS unit_ordinal
  FROM unit_sort
)
UPDATE sections s
SET unit_ordinal = n.unit_ordinal
FROM units u
JOIN numbered n ON n.source_id = u.source_id AND n.unit_key = u.unit_key
WHERE s.id = u.id
  AND s.unit_ordinal IS DISTINCT FROM n.unit_ordinal;
--SPLIT--
CREATE INDEX CONCURRENTLY IF NOT EXISTS sections_unit_ordinal_idx
  ON sections (source_id, unit_ordinal, ordinal);
