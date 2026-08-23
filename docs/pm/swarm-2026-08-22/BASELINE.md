# W-PRE BASELINE — Wave 0 pre-flight, swarm closeout 2026-08-22

Recorded: 2026-08-22T17:11Z by W-PRE (read-only everywhere + one scratch worktree).
Order: docs/pm/orders/2026-08-22-autonomous-swarm-closeout.md.

## VERDICT: **HALT** — §2.6 stop condition fired

`npm run audit` is RED at baseline. Per order §6 W-PRE step 4 and §2.6: halt the whole
swarm. Waves 1+ must NOT launch until this red is dispositioned (owner or a supervised
session). W-PRE did not work around it; nothing in the primary tree was mutated.

### The red (deterministic, reproduced 3×)

```
FAIL test/publish-flip-toolchain.test.ts > thayers evidence gate >
  the SHIPPED CLI refuses at the same gate (subprocess, no DB, no evidence file)
AssertionError: expected true to be false   (test/publish-flip-toolchain.test.ts:473)
Test Files 1 failed | 69 passed (70) · Tests 1 failed | 847 passed (848)
→ AUDIT FAILED (1): tests + coverage — vitest
```

- The test asserts `docs/evidence/thayers-source-verification.md` does NOT exist (so the
  subprocess red-proof runs with no evidence file). Commit `abe5252` ("Thayer's verified…
  relabel + unification launched") added that evidence file without updating the stale
  guard. The guard now fails on its own precondition.
- Introduced AFTER the last green CI: run 32562471249 @ 2012e03 did not contain the file
  (`git ls-tree` empty); `2012e03..origin/main` is 3 commits including abe5252.
- Present at BOTH HEAD (7633f3b) and origin/main (9dce273) — the swarm's build base
  carries the red. No CI run covers origin/main since.
- Full log: /tmp/swarm-baseline-audit-full.log (second, complete run). A first run also
  failed the three typecheck legs; those passed cleanly on rerun and are judged
  bootstrap-transient (scratch-worktree dependency settling), not baseline state. The
  vitest red is the persistent baseline failure.

## Baseline facts

| fact | value |
|---|---|
| primary-tree HEAD | `7633f3befc0248be5a2e915923f1c88e9561ab20` |
| branch | `fix/q1-signed-out-state` |
| origin/main (after fetch) | `9dce273ef09dffb03bc547cead0431f48fb71ffe` ("Deploy abe5252 live…") |
| tree state | clean EXCEPT the known staged deletion `D scripts/ci-fetch-bible-kjv.mjs` — no halt on step 1 |
| baseline audit | **RED** (1 test, above), run in scratch worktree `/tmp/swarm-baseline` @ HEAD, full §2.7 bootstrap |
| CI fallback run 32562471249 | SUCCESS @ `2012e03b` — audit ✓ 5m58s, db-invariants ✓ 9m15s — predates the red |
| env host tokens (.env.local, web/.env.local) | only `ep-tiny-hat` — all allowed (booleans below) |
| root .env.local odd-fog/CUTOVER_ match | false |
| web/.env.local odd-fog/CUTOVER_ match | false |
| unexpected (non-dev/lane-b) host token | false |

### Staged deletion (report-only, untouched)

`scripts/ci-fetch-bible-kjv.mjs` was created by `8c8b895` (kjv-only CI corpus fetch) and is
**superseded**: `scripts/ci-fetch-bible-assets.mjs` (all 18 translations, commits `1c5934a`,
`ad0f1f7`) replaced it; `.github/workflows/audit.yml` references only the new script. The
staged deletion is consistent with that supersession. Left exactly as staged — the owning
session or the returning owner decides.

## Dev-DB checks (read-only; host asserted ep-tiny-hat by the scripts' own guards)

- `scripts/dev-corpus-census.mjs`: positive control sources=203. Per-register works:
  published 129 (commentary 26, confession 8, devotional 15, father 7, historian 1,
  hymn 32, lexicon 15, poetry 13, sermon 6, theology 3, topical_index 3) ·
  staged 70 (commentary 7, father 1, historian 27, lexicon 1, poetry 2, sermon 5,
  theology 26, topical_index 1) · quarantined 3 (commentary 1, confession 2) ·
  ingesting 1 (father).
- §5.2 relabel landing (register='prose' remainder among the 16 lexicon works,
  `embeddings.metadata->>'register'`): **0 prose rows remaining — dev relabel LANDED.**
  16 works (15 published + 1 staged); 83,270 flat rows all register='lexicon'
  (pre-write census said 83,280; 10-row drift noted, not adjudicated here).
  Prod side NOT checked (forbidden); no prod batch observed or touched.
- §5.2 section-vector unification: `web/test/invariants/section-vector-pairing.test.ts`
  **PASS** on dev (22s) — 98/129 published works probed, 31 not covered (no
  sampleable-length section; list in transcript), no content↔vector mispairing.
- `scripts/ground-truth.mjs --env=dev` ran (via symlinked env layout — the script reads
  `web/.env.local`, which no longer carries DATABASE_URL; root `.env.local` does, dev-only).
  7 findings, ALL prod-shaped claims read against dev (9 legal authors→8, mig-012 index
  absent on dev, sources=203≠2, app user neondb_owner, etc.) — expected dev-vs-prod
  divergence, recorded not adjudicated.
- §5.1 collision-safety spot check: **CONFIRMED** — DB-writing suite
  `web/test/invariants/studies-tenancy.test.ts:47-48` mints per-run users
  (`qa-w1-ten-{a,b}-${Date.now()}-${randomUUID}`); seeding suites use the owner-URL
  discipline in `web/test/helpers/env.ts` (prod refused loudly). Later audit flakes on
  shared fixtures are NOT expected from user collisions.

## Observations for the record (not adjudicated)

- During the audit, `test/regression/annotations-routes.test.ts` logged
  "connection to ep-odd-fog failed: password authentication" — a fault-injection fixture
  that deliberately targets an unreachable prod-shaped URL to prove 500-never-401.
  Authentication failed; no connection was established; nothing was read. Noted because
  the order forbids prod connections — this is the repo's own test behavior at HEAD.
- `web/node_modules` is present in fresh worktree checkouts (tracked content); the §2.7
  bootstrap list (root node_modules + 5 corpus asset dirs + env files) was applied and
  sufficient after settling.

## Red-proof equivalent (step "Done when")

- Step 1 halt path (dirty tree beyond known deletion): CHECKED, did not fire.
- Step 4 halt path (env host mismatch / odd-fog): CHECKED, did not fire.
- Step 4 halt path (red baseline audit): **FIRED** — evidence above. Swarm halts here.
