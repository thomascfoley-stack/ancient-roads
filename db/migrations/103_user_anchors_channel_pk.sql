-- ============================================================
-- 103: anchors keyed by CHANNEL too, and the two quantities in `confidence` separated
-- ============================================================
-- Fixes two defects in migration 100 (mine, 2026-08-03), found while planning step 3. Both had to
-- land BEFORE step 3, because step 3 is the first writer of anchor rows and neither is repairable
-- from the data afterwards.
--
-- DEFECT 1 — THE PK CANNOT REPRESENT ONE VERSE FOUND BY TWO CHANNELS.
-- 100 declared PRIMARY KEY (section_id, verse_id_start). A chunk that cites Romans 8:28 explicitly
-- AND quotes it verbatim is found by BOTH the explicit and uncited channels. Under the old key
-- those are one row: the second write either loses to ON CONFLICT DO NOTHING or overwrites the
-- first. Either way the per-channel measurement step 3 owes -- "measure the three channels
-- separately", SERMON_SEARCH_DESIGN §13 -- becomes unreconstructable from the table, and the
-- agreement between channels (the strongest signal there is that an anchor is real) is destroyed
-- precisely where it occurs. The key now carries `channel`.
--
-- DEFECT 2 — `confidence` HELD TWO DIFFERENT QUANTITIES, and three documents disagreed on which:
--   * SLICE_1_DATA_MODEL.md:68      -- "carries the shingle count K"
--   * UPLOADER_DESIGN.md:162-164    -- K recorded in confidence; the surface filters at K>=3
--   * DECISIONS.md ADR-100 §3       -- carries the translation-detection fallback signal
-- The first two want an integer count of matching 6-gram shingles. The third wants a 0-1 confidence
-- that the document's translation was identified. Storing both in one REAL means any reader has to
-- guess which one a row holds, and the K>=3 surface filter would silently compare against a
-- detection score. Split:
--   match_count INT   -- how many distinct 6-gram shingles of this verse appeared (the K of the
--                        Slice 0 trade curve). NULL for channels where it is meaningless: an
--                        explicit citation is not a shingle count, and writing 1 there would make
--                        `match_count >= K` filters silently admit every citation.
--   confidence  REAL  -- 0-1, how confident we are in the TRANSLATION FAMILY used to find it
--                        (ADR-100). 1.0 when detection was unambiguous; lower on the fallback.
--
-- Safe as a rewrite: the table is EMPTY (0 rows, verified against lane-b-uploader immediately
-- before applying). No backfill is possible or needed.
--
-- 'prose' stays in the CHECK for now. Whether Slice 1 ships that channel at all is step 3c's
-- decision (nothing implements it today, and the design's "three channels" are really 1.5);
-- churning the constraint twice is worse than deciding once, with the rows still at zero.
--
--   DATABASE_URL="$(cat ~/.neon_lane_b_owner_url)" MIGRATE_TARGET_ENDPOINT=ep-snowy-bird-atmdsv3g \
--     node db/apply-migration.mjs db/migrations/103_user_anchors_channel_pk.sql
--
-- REVERSE (exact inverse; only valid while the table is empty):
--   ALTER TABLE user_section_anchors DROP CONSTRAINT user_section_anchors_pkey;
--   ALTER TABLE user_section_anchors ADD PRIMARY KEY (section_id, verse_id_start);
--   ALTER TABLE user_section_anchors DROP COLUMN match_count;
-- ============================================================

ALTER TABLE user_section_anchors DROP CONSTRAINT user_section_anchors_pkey;
ALTER TABLE user_section_anchors ADD PRIMARY KEY (section_id, verse_id_start, channel);

ALTER TABLE user_section_anchors ADD COLUMN IF NOT EXISTS match_count INT;

COMMENT ON COLUMN user_section_anchors.match_count IS
  'Distinct 6-gram shingles of this verse found in the chunk (the K of the Slice 0 trade curve). '
  'NULL where meaningless -- an explicit citation is not a shingle count.';
COMMENT ON COLUMN user_section_anchors.confidence IS
  'Confidence 0-1 in the TRANSLATION FAMILY used to find this anchor (ADR-100), not a match count. '
  '1.0 when detection was unambiguous; reduced on the KJV-family fallback.';

-- The presence fast-path index is unchanged and still covers (user_id, verse range); the new PK
-- column does not participate in it, because the scan asks "has this user written on X" without
-- caring which channel found it.
