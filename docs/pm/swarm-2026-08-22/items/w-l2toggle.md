# W-L2TOGGLE — plan mark-as-read optimistic toggle (L2 step 2)

**Workstream:** W-SEC-CURSOR (branch `swarm/W-SEC-CURSOR-sections-cursor`, base `origin/main` 9dce273)
**Status:** AUDIT-GREEN but for one pre-existing baseline red owned by swarm/w-basefix-thayers-guard (see Audit section) (transitions: CLAIMED → RED-PROVEN → FIXED → AUDIT-GREEN; VERIFIED/MERGED = Wave 7/8)
**A1 provider spend:** $0.00.

## Presence/absence check (the board contradicted itself — brief step 1)
MASTER.md C3: "Step 2 (optimistic toggle) deferred to the next deploy." C4's deploy row is
titled "ships L1's retry, L2 step 2, and UX-5". Verified against the DEPLOYED sha: the
toggle at `2611e1f` (and at origin/main before this change) was the AWAITED shape — POST,
then await a full re-fetch, busyDay held throughout. C4's title was the deploy's intended
manifest, not its content; step 2 never shipped. So: ABSENT → implemented.
Cost of not fixing: on a phone on low signal (this app's core use context, CLAUDE.md) a
mark-as-read tap shows nothing until POST + refetch return — reads as a dead tap.

## Fix (the codebase's own optimistic idiom)
`web/src/components/plans-client.tsx` only:
- the toggle paints the day immediately (new `onDayToggled` prop — the parent owns `open`,
  so the paint lives there), persists through `persistWrite` (L1's retry policy, already
  unit-tested in persist-write-retry.test.ts), and on failure ROLLS THE DAY BACK and
  surfaces the component's standard error — the optimistic-rollback contract
  use-annotation-writes.ts already keeps. On success the paint stands and the plan is
  re-read (unawaited) to converge on the server's row. busyDay still prevents same-day
  double-tap races; the stale comments describing the awaited shape were rewritten.

## Evidence (docs/evidence/swarm-2026-08-22/w-l2toggle/)
- `RED-test.txt` — the optimistic-paint case watched red pre-fix (no flip while the POST
  is in flight).
- `REDPROOF-seeded.txt` — rollback line seeded out → the rollback case fails; restored → green.

## Tests
`web/test/components/plan-day-toggle.test.tsx` (new, 3 tests, real PlansClient against a
faithful fake server — a successful POST flips the stub's own state): paints before the
network answers; rolls back + error line on a failed write; keeps the paint and re-reads
on success. Existing plan suites re-run green (plan-route-states, plans-builder-preview,
plan-reschedule). Verified against the REAL component, not just the store (the A7b
dual-theme caution). Signed-in browser verification was not possible (no agent credential —
the standing gap); the jsdom drive covers the full path.

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
