# W-SEC-CURSOR — `after=1e21` → 500 on the sections route

**Workstream:** swarm/W-T3-cursor-ccel-ux · **Base:** origin/main `9dce273`
**Status: AUDIT-GREEN** (awaiting Wave 7 independent verification)

Transitions: CLAIMED → RED-PROVEN → FIXED → AUDIT-GREEN

## The defect

WORKLOG 2026-08-21 deferred security finding: `after=1e21` → 500 on
`/api/work/[slug]/sections`. Root cause measured, not inferred: `Number('1e21')` passes
`Number.isInteger`, and `sections.ordinal` is INT (int4, migration 006), so the bound value
reached SQL as `"1e+21"` → `NeonDbError: invalid input syntax for type integer` → 500.

## Fix

`web/src/app/api/work/[slug]/sections/route.ts` — the existing `after` validation gains an
upper bound at int4 max (2,147,483,647); over-range returns the standard
`apiError('INVALID_REQUEST')` 400 envelope, matching the route's own param-handling idiom and
the sibling `/api/search/commentaries` bounded-integer pattern. One condition added; no new
mechanism.

Cost of not fixing: an unauthenticated 500 on a public read route, one line to trigger.

## Tests

`web/test/invariants/work-reader.test.ts` — the existing "malformed params are a 400, never a
500" case now covers `?after=1e21` and `?after=99999999999`, executed against the real dev DB
through the shipped route handler.

## Evidence (docs/evidence/swarm-2026-08-22/w-sec-cursor/)

- `red-after-1e21.log` — watched RED before the fix: NeonDbError, int4 overflow, at route.ts:29.
- `green-after-1e21.log` — full work-reader suite green after the fix (7/7).
- `redproof-seeded.log` — red-proof: the bound removed from the route → the test goes RED with
  the identical int4 overflow. Seed reverted; fix re-confirmed green.

## Spend (A1)

$0 — no provider calls (DB reads only, dev `ep-tiny-hat`).
