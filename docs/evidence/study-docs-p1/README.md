# Study Docs P1 — build evidence (Fable 5 core, `docs/pm/FABLE5_CORE_BRIEF.md`)

Branch `feat/study-docs-p1`. Dev target `ep-tiny-hat` (verified by `db/describe-target.mjs`
before anything ran: ledger through 109, no studies tables). Production untouched.

## 110-grant-redproof.log — the migration's DO block, watched RED

`db/migrations/110_studies.sql` applied clean as `neondb_owner` via
`node db/apply-migration.mjs` (ledger row `110_studies.sql`, sha256 `5f32cbc1e5b4…`).

The self-verifying tail was then red-proofed per the brief ("watch the DO block raise on a
deliberately wrong grant before trusting it"): a script extracted **the DO block from the
migration file itself** (not a copy — test the real code path), and for each of six seeded
defects ran `BEGIN; <seed>; <DO block>` expecting the exact RAISE, then `ROLLBACK`:

1. `REVOKE UPDATE ON studies` → RED (the 039/106 outage class)
2. `REVOKE INSERT ON study_block_revisions` → RED
3. `GRANT DELETE ON study_blocks` → RED (soft-delete-only posture)
4. `GRANT UPDATE ON study_block_revisions` → RED (append-only by grant)
5. `ALTER TABLE studies DISABLE ROW LEVEL SECURITY` → RED
6. `DROP POLICY study_blocks_policy` → RED

All six raised as expected; a final unseeded run is GREEN; `information_schema` afterwards shows
grants exactly as the migration states (studies/blocks: SELECT,INSERT,UPDATE; revisions:
SELECT,INSERT). Every seed was rolled back — the red-proof left no state.

Reproduce: the script body is reproducible from this description — extract the DO block with
`/DO \$\$[\s\S]*?END \$\$;/` from the migration, run each seed + block + rollback as owner
against a dev branch.
