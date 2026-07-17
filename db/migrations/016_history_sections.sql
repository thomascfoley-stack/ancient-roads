-- ============================================================
-- 016: history write-contract (docs/HISTORY_RETRIEVAL_DESIGN.md §3, §9)
-- ============================================================
-- ADDITIVE + idempotent. Applied to the DEV branch only in the 2026-07-16 run —
-- prod application is a deliberate later step with the 006 cutover.
--   DATABASE_URL=<dev-owner-url> node db/apply-migration.mjs db/migrations/016_history_sections.sql
--
-- 1. The history spine: section-level period range (signed; negative = BC),
--    the analogue of (verse_id_start, verse_id_end) for time.
-- 2. The routable key: entity anchors (person/place/event/institution),
--    verbatim-grounded facts only — the gazetteer joins on entity_slug.
-- 3. The tsv fix: sections.tsv was generated over body ONLY, so dated headings
--    (the anchor Schaff/Whiston print) were unsearchable. Regenerate over
--    heading || body. Conditional swap: only if the expression lacks heading.
-- ============================================================

ALTER TABLE sections ADD COLUMN IF NOT EXISTS period_start_year SMALLINT;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS period_end_year   SMALLINT;
CREATE INDEX IF NOT EXISTS sections_period_idx
  ON sections (period_start_year, period_end_year)
  WHERE period_start_year IS NOT NULL;

CREATE TABLE IF NOT EXISTS section_history_anchors (
  section_id   BIGINT NOT NULL REFERENCES sections(id),
  kind         TEXT NOT NULL CHECK (kind IN ('person','place','event','institution')),
  entity_slug  TEXT NOT NULL,
  entity_label TEXT NOT NULL,
  PRIMARY KEY (section_id, kind, entity_slug)
);
CREATE INDEX IF NOT EXISTS history_anchors_entity_idx
  ON section_history_anchors (kind, entity_slug);

-- least-privilege read for the app role. GRANT SELECT alone is a NO-OP here:
-- migration 001's ALTER DEFAULT PRIVILEGES makes every owner-created table born
-- with full DML for app_runtime, so the REVOKE below is the real gate (the 010
-- pattern). 010 revoked commentary_entries/sources/sections but missed the two
-- 006 satellite tables — repaired here alongside the new table (deep-audit
-- 2026-07-16, data-layer H1).
GRANT SELECT ON section_history_anchors TO app_runtime;
REVOKE INSERT, UPDATE, DELETE ON section_history_anchors FROM app_runtime;
REVOKE INSERT, UPDATE, DELETE ON section_anchors        FROM app_runtime;
REVOKE INSERT, UPDATE, DELETE ON section_embeddings     FROM app_runtime;

-- tsv heading fix — swap the generated column only when it is still body-only.
DO $$
DECLARE
  expr TEXT;
BEGIN
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO expr
    FROM pg_attribute a
    JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = 'sections'::regclass AND a.attname = 'tsv';
  IF expr IS NULL OR position('heading' in expr) = 0 THEN
    ALTER TABLE sections DROP COLUMN IF EXISTS tsv;
    ALTER TABLE sections ADD COLUMN tsv tsvector GENERATED ALWAYS AS
      (to_tsvector('english', coalesce(heading, '') || ' ' || body)) STORED;
    CREATE INDEX sections_tsv_idx ON sections USING GIN (tsv);
  END IF;
END $$;
