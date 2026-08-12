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

## unit-test-mutation-redproof.log — the pure-module smoke tests, watched RED

`web/test/study-position.test.ts` + `web/test/study-export.test.ts`, red-proofed by seeding a
bug in each module and watching the suites refuse it. **Read the CORRECTION section**: the first
"reverted, green" claim in that log was false (`git checkout` cannot restore an untracked file);
the mutations were reverted by re-edit and re-proven green 15/15. The first honest run of the
position suite also caught a real defect — naive midpoint-toward-infinity appends grew keys to
167 chars per 1000 appends; fixed with the single-digit-increment append path (<40 asserted).

## handtest-harness.mts + handtest-run.log — the §4.1 hand-test (ownership · boundary · provenance)

**45/45 checks PASS** against dev (`ep-tiny-hat`) through the REAL data layer under the
least-privilege `app_runtime` role — so every grant 110 claims was exercised end-to-end, plus
RLS and the H1/H2 belts together. Covered: cross-tenant reads/writes refused on all three
tables (A's rows intact after B's attempts); block order under append/insert-after/insert-
before/move; revisions holding both outgoing bodies in order; the section clipping snapshotting
byte-exact `sections.body` with server-written attribution; STAGED work refused `not_servable`
(licensing gate IN the write); the ask leg snapshotting the lowest served chunk byte-exact;
UNSERVED embedding refused; whole-work append = one attributed block per reading unit
(bett-methhymns, 3/3) and `work_too_large` past the 500-unit cap (adam-clarke); servability
resolution + tombstone belt; export; the full Flow D round-trip via
`scripts/study-clipping-purge.mjs` (dry-run proven rolled back → execute tombstones the data
state → rehydrate restores byte-exact from the live corpus); soft-delete cascade proven by an
owner truth-read (0 live blocks); teardown to 0 residue rows (qa- prefixed ids, visible to
check-test-residue if it ever leaks).

First run was 44/45: the export check asserted a raw 40-char body substring, and section
631786's body starts `"CHAPTER I.\n\n…"` — blockquoting prefixes every line, so the raw slice
cannot appear. The module was right (its unit test pins exactly that shape); the harness check
was corrected to assert the first line behind `'> '`, and the harness notes it. NOT RUN on dev,
stated in-log: the forbidden-provenance section refusal (no published biblehub-provenance row
exists on this branch — the belt exists in the SQL and in `test/study-export.test.ts`'s belt
case, but this specific corpus shape was not exercisable here).

## web/test/regression/studies-routes.test.ts — the route contract, executed

8/8 against dev (session mocked at the requireUser seam, everything below real): 401
UNAUTHENTICATED only when signed out; 400 on malformed ids before any DB work; **404 (never
401) for a well-formed foreign id**; the golden path; **S-1 route guard — client-supplied
`quote`/`attribution` 400 on POST and PATCH whatever else the body carries**; validation 400s
(unknown kind/op, double keys, missing anchors); **409 NOT_SERVABLE distinct from 404** on a
staged section. Permanent suite (loud-skip without a DB URL, the house pattern); P2's S-suite
goes deeper, this pins the contract.

## Classification: the three new tables entered USER_TABLE_SPEC

`test/invariants/user-data-invariant.test.ts` was watched RED naming exactly
`studies, study_block_revisions, study_blocks` (the enforced-list mechanism working), then
GREEN after classifying all three as G1-digested AUTHORED content in
`scripts/lib/user-data-invariant.mjs` (tsv excluded as derived; `position` an anchor —
reordering someone's study is corruption; revisions tombstone-less by design). Absent-on-prod
is already modelled by that library's `ABSENT` shape — same lifecycle plans (039) and prayers
(107) followed.
