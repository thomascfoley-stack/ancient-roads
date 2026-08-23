# W-SEC-CURSOR — sections route `after=1e21` → 500

**Workstream:** W-SEC-CURSOR (branch `swarm/W-SEC-CURSOR-sections-cursor`, base `origin/main` 9dce273)
**Status:** AUDIT-GREEN but for one pre-existing baseline red owned by swarm/w-basefix-thayers-guard (see Audit section) (transitions: CLAIMED → RED-PROVEN → FIXED → AUDIT-GREEN; VERIFIED/MERGED = Wave 7/8)
**A1 provider spend:** $0.00 — no DeepInfra/LLM calls; dev-DB reads and local HTTP only.

## Defect
`GET /api/work/[slug]/sections?after=1e21` returned 500. `Number('1e21')` passes
`Number.isInteger`, reaches SQL as the string `"1e+21"`, and Postgres throws
`invalid input syntax for type integer` — `sections.ordinal` is INT (db/migrations/006, int4).
The route validated integer/non-negative but never bounded the value to the column's range.
Cost of not fixing: an unauthenticated 500 on a public read route — noisy, and a standing
invitation to probe param handling elsewhere.

## Fix (least code, route's own idiom)
`web/src/app/api/work/[slug]/sections/route.ts` — one conjunct added to the existing
`after` check: `after > 2147483647` (int4 max) → `apiError('INVALID_REQUEST', …)` 400,
the standard error shape (docs/API_ERRORS.md). `limit` needed nothing: the data layer
already clamps it to `WORK_SECTIONS_MAX_LIMIT` (web/src/lib/work.ts:276).

## Evidence (docs/evidence/swarm-2026-08-22/w-sec-cursor/)
- `RED-after-1e21.txt` — live dev-server transcript: `after=1e21` → HTTP 500 (empty body);
  control `after=5&limit=2` → 200. Server log root cause quoted (no secrets in log, scanned).
- `REDPROOF-seeded.txt` — the new suite watched red with the conjunct removed (2 failed).
- `GREEN-after-1e21.txt` — live transcript after the fix: `after=1e21` → 400
  `{"error":{"code":"INVALID_REQUEST",…}}`; boundary `after=2147483647` → 200; control → 200.

## Tests
`web/test/invariants/work-sections-cursor.test.ts` (new, 5 tests, api-hardening.test.ts idiom —
throttle mocked, data layer spied): `after=1e21` → 400 and the data layer never called;
int4-max+1 → 400; pre-existing invalid shapes still 400; valid cursor forwarded (positive
control); int4 max accepted (boundary inclusive). Watched RED before the fix (2 failed),
GREEN after (5 passed).

## Adjacency note
W-SEC-CSRF touched many API routes; this diff is 4 lines in one route file and does not
overlap the CSRF guard's concern (method/Content-Type). Wave 8 merge should be clean.

## Audit (2026-08-23, worktree /tmp/swarm-W-SEC-CURSOR)
`npm run audit` full log: docs/evidence/swarm-2026-08-22/audit-full-W-SEC-CURSOR.log.
Every leg green EXCEPT `tests + coverage — vitest`, which fails on exactly one test:
`test/publish-flip-toolchain.test.ts > thayers evidence gate` — a PRE-EXISTING BASELINE RED
at base 9dce273 (the evidence file it asserts absent, docs/evidence/thayers-source-verification.md,
is tracked at the base commit; verified via `git ls-files`), owned by the separate pushed
workstream `swarm/w-basefix-thayers-guard` ("repair stale thayers evidence-gate guard
(baseline audit red)"). Not caused by, and not fixed by, this branch (no opportunistic fixes).
One earlier failure of my own (web/test tsc on plan-day-toggle.test.tsx) was fixed and the
leg rerun green. NOT RUN inside the audit: `protected-branches-exist` (missing NEON_API_KEY —
declared loudly by the harness itself).
