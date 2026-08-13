# Phase 6a evidence — delete unserved forbidden-provenance flat embeddings

Corpus-backlog decision #8 (RULED 2026-08-13). Runner:
`scripts/phase6a-delete-unserved-forbidden.mjs`.

Scope: flat `embeddings` rows with `user_id IS NULL AND served = false` whose
`metadata->>'sourceUrl'` belongs to a forbidden-provenance domain
(`src/ingest/forbidden-provenance.mjs` — the one body of the domain list; JS-side
classification, no SQL ILIKE). These rows serve nothing today. The forbidden
`served=true` rows are ADR-044 inventory (Phase 6b) and are NOT touched.

Snapshot files here (`<env>-snapshot-<ts>.jsonl.gz`) hold every deleted row's id +
all non-vector columns + metadata, gzipped JSON lines. They exist for audit, not
restore.

**NO INVERSE. Irreversible by owner ruling #8 (2026-08-13); rows are forbidden
provenance and must not be re-materialised.**
