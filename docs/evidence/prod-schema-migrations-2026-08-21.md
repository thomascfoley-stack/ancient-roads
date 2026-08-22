# Production schema_migrations — first committed record (2026-08-21, owner-directed read)

Read via ~/.neon_prod_url at the owner's explicit 'knock all of these out' directive; the
read this repo's docs called 'the highest-leverage single read available'. Settles:
SECURITY.md:194 ('100-104 applied to ep-odd-fog') is TRUE; :266 ('lane-b only') is FALSE.
112/119/120/123 are applied; 122/124 were NOT at read time (applied minutes later, below).
NOTE: prod's ledger carries the SAME 13 wrongly-named backfill rows as dev (002_teacher.sql
etc, 2026-08-01 backfill, NULL checksums) — inert on prod (nothing runs apply-pending there)
but the same class corrected on dev today; see WORKLOG.

```
host: ep-odd-fog-atnykudm.c-9.us-east-1.aws.neon.tech
rows: 65
001_sec2_least_priv_role.sql	2026-08-01T21:49:01.373Z	NULL
002_teacher.sql	2026-08-01T21:49:01.373Z	NULL
003_commentary_fts.sql	2026-08-01T21:49:01.373Z	NULL
004_hybrid_search.sql	2026-08-01T21:49:01.373Z	NULL
005_annotations.sql	2026-08-01T21:49:01.373Z	NULL
006_sources_sections.sql	2026-08-01T21:49:01.373Z	NULL
007_section_embeddings.sql	2026-08-01T21:49:01.373Z	NULL
008_api_rate_limit.sql	2026-08-01T21:49:01.373Z	NULL
009_commentary_fts_legal_partial.sql	2026-08-01T21:49:01.373Z	NULL
010_revoke_dml_corpus.sql	2026-08-01T21:49:01.373Z	NULL
011_commentary_fts_legal_rebuild.sql	2026-08-01T21:49:01.373Z	NULL
012_source_anchors.sql	2026-08-01T21:49:01.373Z	NULL
014_waitlist.sql	2026-08-01T21:49:01.373Z	NULL
015_channels.sql	2026-08-01T21:49:01.373Z	NULL
016_history_sections.sql	2026-08-01T21:49:01.373Z	NULL
017_source_type_registers.sql	2026-08-01T21:49:01.373Z	NULL
018_section_history_anchors.sql	2026-08-01T21:49:01.373Z	NULL
019_register_columns_fts.sql	2026-08-01T21:49:01.373Z	NULL
020_source_type_check.sql	2026-08-01T21:49:01.373Z	NULL
021_revoke_dml_section_tables.sql	2026-08-01T21:49:01.373Z	NULL
022_embeddings_write_policy.sql	2026-08-01T21:49:01.373Z	NULL
023_sources_status_ingesting.sql	2026-08-01T21:49:01.373Z	NULL
024_sections_unit_ordinal.sql	2026-08-01T21:49:01.373Z	NULL
025_notes_highlights.sql	2026-08-01T21:49:01.373Z	NULL
026_bookmarks.sql	2026-08-01T21:49:01.373Z	NULL
027_library_items.sql	2026-08-01T21:49:01.373Z	NULL
028_reading_progress.sql	2026-08-01T21:49:01.373Z	NULL
029_tags.sql	2026-08-01T21:49:01.373Z	NULL
030_annotation_constraints_tighten.sql	2026-08-01T21:49:01.373Z	NULL
031_sections_source_url.sql	2026-08-01T21:49:01.373Z	NULL
032_audit_2026_08_02_data_layer.sql	2026-08-01T21:49:01.373Z	NULL
033_waitlist_revoke_dml.sql	2026-08-01T21:55:01.701Z	NULL
034_waitlist_rls.sql	2026-08-01T22:53:38.991Z	NULL
035_fts_legal_forbidden_provenance.sql	2026-08-01T22:33:28.907Z	sha
036_annotation_section_fk_indexes.sql	2026-08-01T22:43:18.254Z	sha
037_sermon_index_add_talks_to_farmers.sql	2026-08-02T07:21:24.562Z	sha
038_devotional_source_type.sql	2026-08-02T22:49:49.638Z	sha
039_plans_coverage_topical.sql	2026-08-03T05:48:21.541Z	sha
040_source_type_topical_index.sql	2026-08-03T06:10:02.513Z	sha
041_plans_delivery_fields.sql	2026-08-03T05:48:22.623Z	sha
042_plan_day_readings.sql	2026-08-03T05:48:23.741Z	sha
044_embeddings_served_expand.sql	2026-08-04T05:46:18.072Z	sha
045_embeddings_served_contract.sql	2026-08-04T21:50:01.345Z	sha
100_user_corpus.sql	2026-08-05T15:46:06.508Z	sha
101_revoke_embeddings_writes.sql	2026-08-05T15:46:07.700Z	sha
102_user_documents_parse_metadata.sql	2026-08-05T15:46:08.734Z	sha
103_user_anchors_channel_pk.sql	2026-08-05T15:46:09.784Z	sha
104_better_auth_schema.sql	2026-08-05T15:46:10.868Z	sha
105_suggested_readings.sql	2026-08-06T17:16:37.470Z	sha
106_plan_write_grants.sql	2026-08-08T00:24:49.931Z	sha
107_prayers.sql	2026-08-08T17:18:09.012Z	sha
108_fts_legal_unserve_talks_to_farmers.sql	2026-08-11T17:15:20.243Z	sha
109_fts_legal_serve_gill_song.sql	2026-08-12T05:31:22.707Z	sha
110_studies.sql	2026-08-12T22:26:08.993Z	sha
111_study_block_trim.sql	2026-08-15T12:01:48.157Z	sha
112_embeddings_source_type_historian.sql	2026-08-13T09:38:16.083Z	sha
113_fts_legal_serve_corpus_backlog.sql	2026-08-13T09:37:59.463Z	sha
114_hnsw_served_historian.sql	2026-08-13T09:38:18.931Z	sha
115_fts_legal_rejoin_gill_song.sql	2026-08-15T10:58:20.745Z	sha
116_ask_outcomes.sql	2026-08-16T00:52:10.623Z	sha
117_fts_legal_must_not_serve_veto.sql	2026-08-18T21:10:03.524Z	sha
118_fts_legal_veto_pseudo_origen.sql	2026-08-18T21:24:06.540Z	sha
119_fts_legal_drop_dead_work_clause.sql	2026-08-20T05:23:27.949Z	sha
120_history_embeddings.sql	2026-08-20T06:59:38.525Z	sha
123_sections_strongs_heading_idx.sql	2026-08-21T17:41:07.768Z	sha
```

## Addendum 2026-08-21 (late) — the root fixed, not just the copy

Kimi's root-cause flag, confirmed: **prod's ledger was the SOURCE of the 13 phantom rows** — dev is
periodically reset from `production` (e.g. 08-10, `br-cool-flower`), so fixing dev alone meant the
next reset re-inherits the wall and CI breaks again at 020. Any future CI branch cut from
`production` inherits it the same way.

**Executed on prod, same sitting as the authorized item-1 ledger work:** the 13 rows renamed to the
filenames whose effects were verified present (the dev probe, above — same schema lineage; prod's
schema predates none of the 13). Transactional; collision-checked first (none of the correct names
pre-existed on prod); `checksum IS NULL` guard restricted the UPDATE to the 032-backfill signature;
all-or-nothing (13 expected, 13 renamed, else ROLLBACK); `applied_by` carries the audit note. Row
count unchanged: **67 before and after** (the 65 at read time + 122/124's own rows). The table is
inert on prod — nothing runs apply-pending there — so this changes no behavior today; it exists so
the NEXT reset-from-production seeds dev with a truthful ledger.

**Exact inverse**, should the owner want it back: the same 13 UPDATEs with the pairs reversed
(each row is unique by filename; the renamed rows are identifiable by the `[renamed 2026-08-21…]`
suffix in `applied_by`).

| was (032's wrong name) | now (effect-verified) |
|---|---|
| 002_teacher.sql | 002_notes_unique_active.sql |
| 004_hybrid_search.sql | 004_hybrid_search_v2.sql |
| 005_annotations.sql | 005_commentary_entry_index.sql |
| 007_section_embeddings.sql | 007_verseid_index.sql |
| 010_revoke_dml_corpus.sql | 010_revoke_corpus_writes.sql |
| 011_commentary_fts_legal_rebuild.sql | 011_rebuild_fts_legal_predicate_drift.sql |
| 012_source_anchors.sql | 012_partial_legal_hnsw.sql |
| 015_channels.sql | 015_highlight_subverse.sql |
| 018_section_history_anchors.sql | 018_register_partial_indexes.sql |
| 020_source_type_check.sql | 020_embeddings_source_type_registers.sql |
| 021_revoke_dml_section_tables.sql | 021_revoke_app_runtime_anchor_writes.sql |
| 022_embeddings_write_policy.sql | 022_embeddings_write_policy_user_scope.sql |
| 025_notes_highlights.sql | 025_annotations_polymorphic.sql |
