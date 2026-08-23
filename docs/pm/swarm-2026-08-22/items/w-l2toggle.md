# W-L2TOGGLE — plan mark-as-read optimistic toggle (L2 step 2)

Workstream: W-UX1 · Branch: `swarm/W-UX1-ux1-desk-bible` · Base: `9dce273` (origin/main)

## Status: FIXED — audit green except one PRE-EXISTING baseline red (2026-08-23)

`npm run audit` in the worktree: every leg green, all new/changed tests pass inside the suite
(web 1625 passed | 128 skipped; root 847 passed) EXCEPT
`test/publish-flip-toolchain.test.ts > thayers evidence gate > the SHIPPED CLI refuses…` — a
BASELINE red on origin/main 9dce273 (test 256701e asserts the absence of
`docs/evidence/thayers-source-verification.md`, which abe5252 later committed). Proven
pre-existing: a pristine-base audit of the same worktree fails identically (1 failed | 847
passed, same counts). Owned by W-BASEFIX (`swarm/w-basefix-thayers-guard`, pushed) — deliberately
NOT duplicated here. Logs: `docs/evidence/swarm-2026-08-22/w-ux1-workstream/audit-*.log`.
Expect green at Wave 8 once basefix merges.

Transitions: CLAIMED → RED-PROVEN → FIXED → AUDIT-GREEN* (*see baseline-red note above). VERIFIED/MERGED: Wave 7/8 (not this agent).

## Presence check (the brief's first step)

ABSENT. `web/src/components/plans-client.tsx` `toggle()` awaited the POST and the re-read before
moving the tick (its own comment recorded the "dead tap on phones" complaint). MASTER.md C3/C4
contradiction resolves to: step 2 was NOT built. So: implemented.

## The change (store's existing mutation idiom + rollback)

`PlanDetail` gains an optimistic overlay: `flips: Record<day_index, completed_at>`; every derived
view (`doneCount`, `upNext`, the progress grid, the day list) reads the effective `days`, never
`open.days` directly. Toggle: flip instantly → POST → on success reconcile via `onChanged()` then
lift the overlay; on `!res.ok`/throw roll the overlay back and show the existing standard error
line ("That change could not be saved. Please try again."). `busyDay` still serializes taps on
the same day, so two flips cannot race. Verified against the real component (not just the store)
per the A7b dual-theme caution — all `completed_at`-conditional classes are fed by the effective
days, both themes unchanged.

## Red / green / red-proofs (all driven against the real PlansClient, deferred POST)

- `docs/evidence/swarm-2026-08-22/w-l2toggle/red-unit.log` — `web/test/plan-optimistic-toggle.test.tsx`
  against the unfixed component: the tick never flips before the server answers (2/2 red).
  (An earlier red run was INVALID — jsdom lacked `matchMedia` and the render crashed before the
  assertion; discarded and re-captured properly with the stub in place.)
- `green-unit.log` — 2/2 green with the fix.
- `redproof-rollback.log` — seeded removal of the rollback in the `!res.ok` branch → the
  rollback test red, optimistic test still green (the two legs are independently guarded).
  The stash-revert red above doubles as the red-proof for the optimistic write itself.

## Notes

- No new state surfaces outside `PlanDetail`; `OpenPlan` prop flow untouched.
- Provider spend (A1): $0.00.
