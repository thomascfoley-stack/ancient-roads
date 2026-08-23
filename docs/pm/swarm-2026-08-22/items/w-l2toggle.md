# W-L2TOGGLE — Plan mark-as-read optimistic toggle (L2 step 2)

**Workstream:** swarm/W-T3-cursor-ccel-ux · **Base:** origin/main `9dce273`
**Status: AUDIT-GREEN** (awaiting Wave 7 independent verification)

Transitions: CLAIMED → ABSENCE-VERIFIED → RED-PROVEN → FIXED → AUDIT-GREEN

## Presence check (per the brief, first)

No optimistic toggle existed: `PlanDetail.toggle` in `web/src/components/plans-client.tsx`
awaited the POST and then awaited the full re-read (`onChanged()`) before any state moved —
deliberately added 2026-08-07 to kill a silent-revert bug, but the tick sat visually unchanged
for the whole round trip, which is the dead-tap UX L2 step 2 exists to fix. So: not
ALREADY-DONE; implemented.

## Fix

- `PlansClient` gains `patchDay(dayIndex, completedAt)` — a `setOpen` updater over the existing
  `open.days` state — passed to `PlanDetail` as `onPatchDay`.
- `toggle` now paints the tick FIRST (`onPatchDay`), POSTs, and on `!res.ok`/throw ROLLS THE
  PAINT BACK and keeps the existing "That change could not be saved." error — the
  rollback-on-error idiom of `use-annotation-writes.ts` (the codebase's other optimistic
  writes). On success the server re-sync runs in the background (`void onChanged()`); the final
  state remains server-truth.
- The dual-theme class (A7b) was checked against the real component: the read/unread styling
  already keys off `d.completed_at` with `dark:` variants in both places, so the optimistic
  paint inherits both themes with no new classes.

Known narrow race (noted honestly): two rapid toggles on DIFFERENT days can make the first
day's background re-read briefly show the second day unpainted until its own re-sync lands.
Flicker-class, final state correct.

## Tests

`web/test/components/plan-optimistic-toggle.test.tsx` (new, 2 tests, jsdom + deferred-POST
fetch stub, `matchMedia` stubbed per `test/helpers/match-media.ts`'s rule):

1. the tick paints BEFORE the write resolves, and no error/rollback appears on success;
2. a failed write rolls the paint back and names the failure.

## Evidence (docs/evidence/swarm-2026-08-22/w-l2toggle/)

- `red-not-optimistic.log` — watched RED at base: the tick never appears while the POST is in
  flight (both tests fail at the optimistic-paint assertion).
- `green-optimistic.log` — green after the fix (4/4 incl. the existing plan-route-states suite).
- `redproof-seed-no-paint.log` — red-proof: the `onPatchDay` paint removed → both tests RED.
- `redproof-seed-no-rollback.log` — red-proof: the `!res.ok` rollback removed → test 2 RED.
  Both seeds reverted; green re-confirmed.

## Spend (A1)

$0 — no provider calls.
