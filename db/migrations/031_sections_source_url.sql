-- ============================================================
-- 031: sections.source_url — row-level CONTENT provenance (SECTION_PROVENANCE_DESIGN R1)
-- ============================================================
-- E4 (migrate-sections-slice) copies flat `embeddings` rows into `sections` under a
-- `sources` row whose provenance comes from the manifest. The flat row's own
-- metadata->>'sourceUrl' was NOT carried across, so text whose real origin is a
-- forbidden aggregator (biblehub.com et al., ADR-008) landed under a source whose
-- DECLARED provenance is clean — provenance laundering, invisible to every gate
-- because sources.provenance is exactly the field that lies (measured on a fresh
-- prod fork 2026-07-28: 6,257 rows across 6 works; see
-- docs/SECTION_PROVENANCE_DESIGN.md §2). This column records where the TEXT of a
-- section came from, independently of what its source claims. The gate's G8
-- provenance leg joins the two and fails on any row where the content provenance
-- is forbidden and the declared provenance is not.
--
-- NULLable BY DESIGN, and NULL means "no row-level signal recorded", NOT "clean":
-- the four clean helloao works carry no sourceUrl on their flat rows, and the
-- other three section writers (ingest-sermon.ts, ingest-historian.ts,
-- repoint-sections-work.ts) ingest from declared-clean adapters and do not
-- populate it. G8 states this limit in its own output. Making it NOT NULL at
-- ingest is the infra/content-separation program, not this migration.
--
-- ZERO-WINDOW-SAFE (ADR-025): ADD COLUMN with no default is catalog-metadata-only
-- in Postgres — no table rewrite, no serving index touched, SELECTs never blocked.
ALTER TABLE sections ADD COLUMN IF NOT EXISTS source_url TEXT;

COMMENT ON COLUMN sections.source_url IS
  'Row-level CONTENT provenance carried from embeddings.metadata->>''sourceUrl'' at slice time (031, SECTION_PROVENANCE_DESIGN R1). NULL = no row-level signal recorded (helloao works and the non-slice section writers), NOT "clean".';
