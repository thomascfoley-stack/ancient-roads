# Study Docs P2 — W1 stream evidence (data invariants S-11, S-4, S-7, S-14)

Suites: `web/test/invariants/studies-{grants,tenancy,bounds,order}.test.ts`.
Env recipe (per docs/pm/SWARM_PARALLEL_BRIEF.md): `APP_DATABASE_URL` = the app_runtime dev
URL (root `.env.local`'s `DATABASE_URL`), `DATABASE_URL` = the dev owner URL from
`~/.neon_dev_owner_url` (teardown deletes only; app_runtime holds no DELETE by design).
Both point at dev (ep-tiny-hat); values never printed. Runs from `web/`:
`npx vitest run test/invariants/studies-<suite>.test.ts`.

Every red run seeded the violation in the real fixture (a temporary, reverted mutation to
`web/src/lib/studies.ts`, or the BYPASSRLS owner role standing in as the runtime
connection) and was watched failing. After every reversion `studies.ts` was verified
byte-identical to its pre-work state: sha256
`5d2298b191a244e615404afc4959685ac2423ce1e54d8b2f859f7f2dfa848d05`.

## studies-grants-red.log → studies-grants-green.log (S-11)

Seeded: an op appended to `lib/studies.ts` issuing `DELETE FROM study_blocks` (a verb 110
deliberately withholds). RED: the suite derived `(study_blocks, DELETE)` from source and
named it ungranted. Reverted; GREEN 2/2. This is the UX_REMEDIATION §9 check, built.

## studies-tenancy-red.log → studies-tenancy-green.log (S-4)

Two logged runs:
- **Run A (RED):** runtime connection = dev owner role (BYPASSRLS) → RLS inert. The two
  belt-removed control cases (raw unbelted SQL as user B) went RED; the belted cases stayed
  GREEN — one run proving the controls catch an RLS failure AND that the H1/H2 belts alone
  isolate.
- **Run B (expected GREEN — the C5 measurement):** `user_id` belt temporarily removed from
  `getStudy` and `updateStudy`, suite run under app_runtime. GREEN 6/6: with only RLS
  stopping B, B still could not read or rename A's study. **RLS binds under Neon's
  user-id format** (GUC-set TEXT ids) on all three tables — C5 measured positive on dev.
Final GREEN 6/6 with belts restored.

## studies-bounds-red.log → studies-bounds-green.log (S-7)

Red run, four seeded mutations, all watched failing in one run: (1) listStudies clamp
removed → 61 rows returned past the 50 cap; (2) listBlocks clamp removed → 250 past 200;
(3) softDeleteStudy block-tombstone cascade removed → the deleted study's blocks still
readable; (4) the stated byte ceiling removed from the module header → source assertion
RED. Reverted; final run 4/5 green.

**The fifth case is RED BY FINDING — F-W1-1 (P1 core defect, not patched per brief rule
4):** the studies-list cursor is lossy. The neon driver returns `updated_at` as a JS Date
(and route JSON serializes millis), so the cursor binds truncated
(`…11.290151+00` → `…11.290Z`) and the `(updated_at, id)` tuple comparison drops every row
sharing the cursor's stored millisecond — bulk-created studies vanish at the page seam.
Probed directly (full-precision cursor text finds the rows; the driver Date finds 0).
Fix belongs to P3 (full-precision cursor serialization, e.g. `updated_at::text`).

## studies-order-red.log → studies-order-green.log (S-14)

Red run, two seeded mutations: (1) `ORDER BY position, id` flipped to DESC in the block
reads → the order assertions RED; (2) the 23505 retry removed from `insertTextBlock` → the
concurrent same-midpoint case RED with the raw
`duplicate key value violates unique constraint "idx_blocks_order"` — the collision is real
and the retry is what resolves it. Reverted; GREEN 6/6.

## Teardown

Every suite deletes its rows owner-side by user prefix (`qa-w1-…%`, ON DELETE CASCADE reaps
blocks and revisions). Verified after the final runs: zero `qa-w1-%` rows remain on dev.
