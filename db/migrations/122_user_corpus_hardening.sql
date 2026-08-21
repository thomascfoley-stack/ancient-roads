-- ============================================================
-- 122: user-corpus hardening — FORCE RLS + verb-narrowed grants (D10, D12; D11 REFUTED)
-- ============================================================
-- Uploader deep dive 2026-08-20 (docs/pm/orders/2026-08-20-uploader-deep-dive.md), findings
-- D10, D11, D12. Two fixes and one refutation, one migration, deliberately: all three are the
-- same posture — the 100-block tables were built to the letter of the user-data rules and
-- drifted from their spirit in ways only a table-by-table audit could see. Every statement
-- here is idempotent (FORCE / REVOKE are natural no-ops on re-run), so re-applying is safe.
-- Red-proof: docs/evidence/uploader-deep-dive-2026-08-20/migration-12x-redproof.log — run
-- against a throwaway local Postgres 17 by replaying 100 → 101 → 102 → 103 → 105 → 122
-- (the chain that defines these tables and grants, per the C3 precedent of replaying only the
-- defining migrations rather than all of 001+).
--
-- ─── D10: FORCE ROW LEVEL SECURITY on all five user tables ─────────────────────────────────
--
-- 100/105 ENABLEd RLS. ENABLE binds every role EXCEPT the table's owner: the owner (and any
-- role with BYPASSRLS, and superusers) reads and writes every user's rows unconfined. FORCE
-- closes the OWNERSHIP exemption — the owner is policy-bound like everyone else.
--
-- THE NUANCE, STATED SO NOBODY OVER-CLAIMS THIS: FORCE does NOT confine superusers, and does
-- NOT confine any role carrying the BYPASSRLS attribute. On lane-b-uploader, neondb_owner was
-- MEASURED carrying rolbypassrls=true (scripts/redproof-user-corpus-rls.mjs, precondition leg),
-- so on that branch a neondb_owner session still bypasses these policies after this migration.
-- What FORCE closes is the ownership-based path: a non-superuser, non-BYPASSRLS role that owns
-- these tables — the shape Neon provisions for project owner roles, and the shape neondb_owner
-- itself takes if the attribute is ever dropped — stops seeing other users' rows. Defense in
-- depth, not a completed confinement of the owner connection; the BYPASSRLS attribute is a
-- separate owner decision and is deliberately not touched here. The red-proof exercises exactly
-- the closed path: a non-BYPASSRLS owner sees both seeded users' rows before this migration and
-- is policy-bound after it.
--
-- ─── D11: "no index on user_document_readings(document_id)" — REFUTED, no index added ──────
--
-- The finding said every document delete seq-scans the global readings table because no index
-- covers the FK column (036's class). MEASURED FALSE on the replayed chain: 105:45 declares
-- PRIMARY KEY (document_id, category, author, work) — the FK column is the PK's LEADING
-- column, so the referential scan the ON DELETE CASCADE trigger runs is index-served today:
--
--   EXPLAIN SELECT count(*) FROM user_document_readings WHERE document_id = 'docA'
--   -> Index Only Scan using user_document_readings_pkey
--        Index Cond: (document_id = 'docA'::text)          (50,001-row table, throwaway PG17)
--
-- (Referential-integrity checks bypass row security by design, so the RLS-injected user_id
-- qual seen in app-role plans does not reach the RI scan; the red-proof also times the cascade
-- of a 50,000-row document in single-digit ms.) 036's defect was PARTIAL indexes that cannot
-- serve the RI scan; a total PK btree can. An idx_user_document_readings_document_fk here
-- would be a second index on a prefix the PK already serves — pure write cost. Same verdict
-- shape as the audit's own M4: refuted, do not fix. If a future migration ever changes that
-- PK's column order, THIS is the note that says the FK index becomes necessary.
--
-- ─── D12: grants narrowed to the code's verbs ──────────────────────────────────────────────
--
-- 100:153 granted SELECT, INSERT, UPDATE, DELETE on all four original tables in one statement,
-- undoing 032's narrowing posture for this table family. The code's actual verbs, MEASURED
-- 2026-08-21 by grepping every statement in web/src/lib/user-corpus/*.ts, web/src/app/api/
-- user-corpus/**, and the tree-wide sweep for these table names (verifying the audit's table,
-- not quoting it):
--
--   user_documents           INSERT documents.ts:130 · UPDATE documents.ts:139,155,168,
--                            queue.ts:74,103, readings-store.ts:28,45, api …/documents/[id]/
--                            route.ts:100 · DELETE documents.ts:187          → keeps all four
--   user_sections            INSERT sections.ts:93 · DELETE sections.ts:91 (the atomic
--                            re-store)                                       → UPDATE revoked
--   user_section_embeddings  INSERT sections.ts:99                           → UPDATE, DELETE revoked
--   user_section_anchors     INSERT sections.ts:103                          → UPDATE, DELETE revoked
--   user_document_readings   INSERT readings-store.ts:63 · DELETE readings-store.ts:59
--                            → keeps SELECT, INSERT, DELETE. Its UPDATE grant (105:59) is used
--                            by NO code path, but the audit's D12 table did not name it and this
--                            migration executes that table exactly — surplus REPORTED as a
--                            WARNING below (106's pattern: reported, not raised), owner call.
--
-- WHY THE REVOKES CANNOT BREAK THE DELETE CASCADES: referential actions (the ON DELETE CASCADE
-- chain document → sections → embeddings/anchors, document → readings) execute with the
-- privileges of the REFERENCING table's owner, not the caller's (106:49-51 records the same
-- fact for plans). So app_runtime deleting a user_documents row still cascades everywhere,
-- with DELETE on user_section_embeddings/user_section_anchors revoked. Asserted rather than
-- assumed: the red-proof deletes a document as app_runtime AFTER the revokes and confirms zero
-- orphans in all four child tables.

-- D10 — FORCE (idempotent: re-running is a no-op)
ALTER TABLE user_documents          FORCE ROW LEVEL SECURITY;
ALTER TABLE user_sections           FORCE ROW LEVEL SECURITY;
ALTER TABLE user_section_embeddings FORCE ROW LEVEL SECURITY;
ALTER TABLE user_section_anchors    FORCE ROW LEVEL SECURITY;
ALTER TABLE user_document_readings  FORCE ROW LEVEL SECURITY;

-- D11 — nothing. See the refutation above; the PK already serves the FK scan.

-- D12 — narrow to the measured verbs (idempotent: REVOKE of an absent privilege is a no-op)
REVOKE UPDATE         ON user_sections           FROM app_runtime;
REVOKE UPDATE, DELETE ON user_section_embeddings FROM app_runtime;
REVOKE UPDATE, DELETE ON user_section_anchors    FROM app_runtime;

-- Verification, in the same file, so a typo'd table name fails the migration instead of being
-- reported as applied (106's pattern). This block CAN fail: run it against a database without
-- the statements above and it raises.
DO $$
DECLARE
  t TEXT;
BEGIN
  -- D10: all five forced
  FOR t IN SELECT unnest(ARRAY['user_documents','user_sections','user_section_embeddings',
                               'user_section_anchors','user_document_readings'])
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class
                   WHERE relname = t AND relrowsecurity AND relforcerowsecurity) THEN
      RAISE EXCEPTION '122 FAILED: % does not have RLS ENABLED+FORCED', t;
    END IF;
  END LOOP;

  -- D11 (refuted): the PRECONDITION of the refutation must still hold — the PK's leading
  -- column is the FK column. If a future migration reorders that PK, this raises, and the
  -- FK index the refutation waved off becomes necessary (see header).
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid AND c.relname = 'user_document_readings_pkey'
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
    WHERE a.attname = 'document_id'
  ) THEN
    RAISE EXCEPTION '122 FAILED: user_document_readings_pkey no longer leads with document_id — the D11 refutation no longer holds; add the FK index';
  END IF;

  -- D12: the revoked verbs are really gone
  IF has_table_privilege('app_runtime', 'user_sections', 'UPDATE') THEN
    RAISE EXCEPTION '122 FAILED: app_runtime still has UPDATE on user_sections';
  END IF;
  IF has_table_privilege('app_runtime', 'user_section_embeddings', 'UPDATE')
     OR has_table_privilege('app_runtime', 'user_section_embeddings', 'DELETE') THEN
    RAISE EXCEPTION '122 FAILED: app_runtime still has UPDATE/DELETE on user_section_embeddings';
  END IF;
  IF has_table_privilege('app_runtime', 'user_section_anchors', 'UPDATE')
     OR has_table_privilege('app_runtime', 'user_section_anchors', 'DELETE') THEN
    RAISE EXCEPTION '122 FAILED: app_runtime still has UPDATE/DELETE on user_section_anchors';
  END IF;

  -- …and the verbs the code USES are all still present (this migration must not over-revoke).
  IF NOT (has_table_privilege('app_runtime', 'user_documents', 'SELECT')
      AND has_table_privilege('app_runtime', 'user_documents', 'INSERT')
      AND has_table_privilege('app_runtime', 'user_documents', 'UPDATE')
      AND has_table_privilege('app_runtime', 'user_documents', 'DELETE')) THEN
    RAISE EXCEPTION '122 FAILED: app_runtime lost a needed verb on user_documents';
  END IF;
  IF NOT (has_table_privilege('app_runtime', 'user_sections', 'SELECT')
      AND has_table_privilege('app_runtime', 'user_sections', 'INSERT')
      AND has_table_privilege('app_runtime', 'user_sections', 'DELETE')) THEN
    RAISE EXCEPTION '122 FAILED: app_runtime lost a needed verb on user_sections (INSERT/DELETE are the re-store, sections.ts:91-93)';
  END IF;
  IF NOT (has_table_privilege('app_runtime', 'user_section_embeddings', 'SELECT')
      AND has_table_privilege('app_runtime', 'user_section_embeddings', 'INSERT')) THEN
    RAISE EXCEPTION '122 FAILED: app_runtime lost SELECT/INSERT on user_section_embeddings';
  END IF;
  IF NOT (has_table_privilege('app_runtime', 'user_section_anchors', 'SELECT')
      AND has_table_privilege('app_runtime', 'user_section_anchors', 'INSERT')) THEN
    RAISE EXCEPTION '122 FAILED: app_runtime lost SELECT/INSERT on user_section_anchors';
  END IF;
  IF NOT (has_table_privilege('app_runtime', 'user_document_readings', 'SELECT')
      AND has_table_privilege('app_runtime', 'user_document_readings', 'INSERT')
      AND has_table_privilege('app_runtime', 'user_document_readings', 'DELETE')) THEN
    RAISE EXCEPTION '122 FAILED: app_runtime lost a needed verb on user_document_readings';
  END IF;

  -- The surplus D12 did not name: no code path updates a readings row (rebuilds are
  -- DELETE + INSERT, readings-store.ts:59-63). Reported, not raised — 106's rule: blocking a
  -- migration on a pre-existing unrelated grant is bad ops, and the audit's table is executed
  -- exactly, not extended.
  IF has_table_privilege('app_runtime', 'user_document_readings', 'UPDATE') THEN
    RAISE WARNING '122: app_runtime has UPDATE on user_document_readings, which no code path uses — owner call whether to narrow (not in the D12 table)';
  END IF;

  RAISE NOTICE '122 OK: 5 tables FORCE RLS · grants narrowed to measured verbs · D11 refutation precondition holds (pkey leads with document_id)';
END $$;
