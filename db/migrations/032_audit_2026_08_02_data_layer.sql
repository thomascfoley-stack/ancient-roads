-- ============================================================
-- 032: the 2026-08-02 deep audit's data-layer findings — H14, H15, M18, M20
-- ============================================================
-- Idempotent. Run as neondb_owner:
--   DATABASE_URL=<owner-url> node db/apply-migration.mjs db/migrations/032_audit_2026_08_02_data_layer.sql
--
-- AUTHORED, NOT APPLIED. Applying a migration to production is an owner action; this file exists
-- so the decision is reviewable before it runs. Nothing here drops or rewrites data.
-- ============================================================


-- ── H14: `waitlist` holds email PII with no RLS and full DML for app_runtime ────────────────
--
-- Migration 014 argued the case and the argument is real: a post-creation REVOKE is not reliably
-- picked up by Neon's connection pooler (cached backends keep a stale relcache ACL), so the table
-- deliberately keeps its create-time default grant. But the cost was stated as "full DML on this
-- ONE public, non-sensitive signup table", and it is neither non-sensitive nor DML-shaped: it is
-- live email addresses on production, and the grant includes UPDATE and DELETE where the design
-- needs only INSERT. This repo's own derivation (scripts/lib/user-data-invariant.mjs:73-80)
-- classifies it as a user table.
--
-- RLS is the fix that does NOT depend on the pooler: policies are evaluated per query against the
-- current role, not cached in the relcache alongside table ACLs. So the grant can stay exactly as
-- migration 014 needs it, and the POLICY does the narrowing.
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waitlist_insert_only ON waitlist;
CREATE POLICY waitlist_insert_only ON waitlist
  FOR INSERT TO app_runtime
  WITH CHECK (true);
-- No SELECT, UPDATE or DELETE policy, deliberately. With RLS enabled and no policy for a command,
-- that command matches zero rows for app_runtime. The app never reads this table — the owner does,
-- via BYPASSRLS — so a compromised runtime credential can add a row and cannot enumerate, alter or
-- destroy the list.


-- ── H14 (second instance): `api_rate_limit` ────────────────────────────────────────────────
--
-- 8 distinct user ids on production, no RLS, full DML. Documented as deliberate, and the counters
-- are not secret — but the LIMITER now fails CLOSED on the spend path (web/src/lib/rate-limit.ts),
-- which makes this table's integrity load-bearing in a way it was not before: a runtime credential
-- that can DELETE from it can reset anyone's quota, and one that can UPDATE can set it anywhere.
ALTER TABLE api_rate_limit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_rate_limit_own_rows ON api_rate_limit;
CREATE POLICY api_rate_limit_own_rows ON api_rate_limit
  FOR ALL TO app_runtime
  USING (true)
  WITH CHECK (true);
-- Permissive for now, because the limiter's upsert runs OUTSIDE runAsUser (it is the one write in
-- web/src/lib that does not go through the transaction-local app.current_user_id), so a
-- user-scoped policy would deny it. Enabling RLS with an explicit permissive policy is still worth
-- doing: it makes the table's posture a DECISION recorded in SQL rather than an omission, and
-- narrowing the policy later is a one-line change once the limiter moves onto runAsUser.


-- ── H15: every future table is born fully writable by the web role ─────────────────────────
--
-- 001:49-50 set ALTER DEFAULT PRIVILEGES ... GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES, and
-- 010:19-21 explicitly declined to change it. So the ONLY protection against a new table being
-- writable by app_runtime is a human remembering a per-table REVOKE — which has already failed
-- twice: 010 missed section_anchors and section_embeddings, repaired four migrations later by 016
-- and re-issued as 021 because 016 was dev-only.
--
-- Narrowed to SELECT + INSERT. UPDATE and DELETE are the two that make a mistake destructive, and
-- no current design needs them by default; a table that genuinely needs them says so in its own
-- migration, which is the point. This does NOT affect existing tables — ALTER DEFAULT PRIVILEGES
-- applies only to relations created after it.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE UPDATE, DELETE ON TABLES FROM app_runtime;


-- ── M18: there is no migration ledger, anywhere ────────────────────────────────────────────
--
-- The only record is .cutover-checkpoint.json — a client-side file in the repo tree covering the
-- cutover-era subset, whose own ordering shows migrations were applied out of numeric sequence
-- (016, 017, 020..023, 025..031, THEN 018, 019, THEN 024). Nothing detects a skipped, out-of-order
-- or doubly-applied migration; per-statement IF NOT EXISTS is the only mitigation and it is not a
-- ledger. Already logged as REMEDIATION_CHECKLIST M9 and still open.
--
-- Server-side, so it survives a clone, a checkpoint clobber (AGENTS.md records two) and a machine.
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by  TEXT NOT NULL DEFAULT current_user,
  checksum    TEXT                                  -- sha256 of the file as applied, when known
);
COMMENT ON TABLE schema_migrations IS
  'One row per applied migration file. Written by db/apply-migration.mjs. Backfilled for 001-031 by 032 itself, which is why those rows carry a null checksum: they were applied before the ledger existed and their contents at apply time are not recoverable.';

-- Backfill what is already applied, so the ledger starts complete rather than starting empty and
-- implying nothing ran. Null checksum records honestly that these predate the ledger.
INSERT INTO schema_migrations (filename, applied_at, applied_by, checksum)
SELECT f, now(), 'backfill-032', NULL
FROM unnest(ARRAY[
  '001_sec2_least_priv_role.sql','002_teacher.sql','003_commentary_fts.sql','004_hybrid_search.sql',
  '005_annotations.sql','006_sources_sections.sql','007_section_embeddings.sql','008_api_rate_limit.sql',
  '009_commentary_fts_legal_partial.sql','010_revoke_dml_corpus.sql','011_commentary_fts_legal_rebuild.sql',
  '012_source_anchors.sql','014_waitlist.sql','015_channels.sql','016_history_sections.sql',
  '017_source_type_registers.sql','018_section_history_anchors.sql','019_register_columns_fts.sql',
  '020_source_type_check.sql','021_revoke_dml_section_tables.sql','022_embeddings_write_policy.sql',
  '023_sources_status_ingesting.sql','024_sections_unit_ordinal.sql','025_notes_highlights.sql',
  '026_bookmarks.sql','027_library_items.sql','028_reading_progress.sql','029_tags.sql',
  '030_annotation_constraints_tighten.sql','031_sections_source_url.sql'
]) AS f
ON CONFLICT (filename) DO NOTHING;

INSERT INTO schema_migrations (filename, applied_by)
VALUES ('032_audit_2026_08_02_data_layer.sql', current_user)
ON CONFLICT (filename) DO NOTHING;

GRANT SELECT ON schema_migrations TO app_runtime;


-- ── M20: the catalog page's per-source unit count went from 0 to ~71,563 tuples ────────────
--
-- web/src/lib/catalog.ts:48-59 runs
--   (SELECT count(DISTINCT COALESCE(sec.unit_ordinal, -sec.ordinal)) FROM sections sec
--     WHERE sec.source_id = s.id) AS units
-- as a SubPlan in the target list, evaluated once per PUBLISHED source, server-rendered per
-- visitor and uncached. Before the 2026-08-01 flip the outer WHERE s.status='published' matched
-- zero rows and it never ran. It now scans roughly 71,563 index tuples on every catalog render.
--
-- sections_unit_ordinal_idx (source_id, unit_ordinal, ordinal) already permits an index-only scan,
-- which is the only thing keeping this off the heap.
--
-- NO INDEX IS ADDED HERE, and the reason is worth recording rather than leaving as a silent gap.
-- The obvious shape — a partial index on sections restricted to published sources — CANNOT BE
-- WRITTEN: a partial-index predicate may not contain a subquery, and `status` lives on `sources`,
-- not on `sections`. The first draft of this migration tried
--     CREATE INDEX ... ON sections (...) WHERE source_id IN (SELECT id FROM sources WHERE ...)
-- which Postgres rejects outright. Shipping it would have failed the migration, not sped anything
-- up.
--
-- The real options, none of which belongs in an audit-remediation migration:
--   1. denormalise `status` (or a `published` boolean) onto `sections`, kept in step by the
--      publish flip — then the partial index is expressible;
--   2. materialise the per-source unit count on `sources` and maintain it at ingest;
--   3. cache the catalog page, which it currently is not (force-dynamic).
-- (2) is probably right — the count changes only at ingest, and the page recomputes it per
-- visitor — but it is a schema-plus-writer change with its own correctness question, and it is
-- filed as such rather than smuggled in here.
--
-- MEASURE FIRST. The audit derived this from index definitions and row counts, not from a plan;
-- nobody has run EXPLAIN (ANALYZE, BUFFERS) on it against production. That is the next step, and
-- it is read-only.
