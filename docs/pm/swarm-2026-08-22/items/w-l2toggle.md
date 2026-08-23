# W-L2TOGGLE — Plan mark-as-read optimistic toggle (L2 step 2)

**Branch:** `swarm/W-L2TOGGLE-plan-toggle` · **Base:** `origin/main` = `9dce273ef09dffb03bc547cead0431f48fb71ffe`
**Worktree:** `/tmp/swarm-W-L2TOGGLE` · **Brief:** `docs/pm/orders/2026-08-22-autonomous-swarm-closeout.md` §8

## Status: FIXED — audit green modulo the known W-BASEFIX baseline repair (awaiting Wave 7)

Transitions: CLAIMED 2026-08-22 → RED-PROVEN 2026-08-22 → FIXED 2026-08-22 → AUDIT-GREEN 2026-08-22
(caveat: see "Baseline red" below).

## Presence/absence check (the brief's FIRST step)

The toggle was ABSENT, so the item was not ALREADY-DONE. `web/src/components/plans-client.tsx`
`toggle` (pre-fix) awaited the POST and then awaited a full re-read of the plan
(`await Promise.resolve(onChanged())`) with `busyDay` holding the checkbox disabled the whole
time — the tick only moved after two server round-trips. MASTER.md C3's "step 2 (optimistic
toggle) deferred" was the true statement; C4's deploy-row claim that the deploy "ships L2
step 2" was the board contradicting itself, exactly as the brief said. No code claimed
optimism anywhere (`grep -i optimistic web/src` hits only the annotation-writes machinery and
unrelated components).

## What changed (least code)

`web/src/components/plans-client.tsx` only (+26/−9):

- `toggle` now paints the flip immediately via a new `onDayPainted(dayIndex, completedAt)`
  callback, then persists; on `!res.ok` or a fetch throw it rolls the paint back to the
  pre-tap value and surfaces the route's existing standard error ("That change could not be
  saved. Please try again."). On success there is no re-read: the write sends an ABSOLUTE
  value (`completed: !d.completed_at`, never "flip"), so the acknowledged paint IS the server
  state — the refetch would only re-learn it.
- `PlansClient` supplies `onDayPainted` as a `setOpen` updater over `open.days`; `PlanDetail`
  gained the prop. `busyDay` still locks the same day until the write resolves, so a rollback
  can never clobber a newer paint of that day; different days don't interact.
- Rollback idiom matches the codebase's other optimistic writes (`use-annotation-writes.ts`:
  paint → persist → revert + visible error), without importing that hook's banner/retry
  machinery — the plans screen's existing `writeError` line is the surface, per the brief's
  "do the simple thing".

Cost of not fixing: every mark-as-read on a slow connection reads as a dead tap (the recorded
C3 step-2 gap), and the board keeps claiming it shipped.

## Evidence (`docs/evidence/swarm-2026-08-22/w-l2toggle/`)

- `red-test-before-fix.txt` — the new suite against the UNMODIFIED component: 3 failed /
  1 passed (the absolute-body guard passes pre-fix by design; it is a regression guard).
- `green-test-after-fix.txt` — same suite after the fix: 4/4.
- `redproof-seeded-no-optimistic-paint.txt` — seeded removal of the optimistic paint →
  the 3 optimism cases fail (the check can fail).
- `redproof-seeded-no-rollback-on-refusal.txt` — seeded removal of the `!res.ok` rollback →
  exactly the refused-save case fails.
- `redproof-seeded-no-rollback-on-throw.txt` — seeded removal of the `catch` rollback →
  exactly the dropped-connection case fails.
- `audit.txt` — `npm run audit` in the worktree: **PASSED, exit 0** (with the W-BASEFIX
  caveat below).

## Baseline red (not mine, already owned — for the orchestrator)

The first audit run in this worktree FAILED one leg:
`test/publish-flip-toolchain.test.ts > thayers evidence gate > the SHIPPED CLI refuses at the
same gate` — the test asserts `docs/evidence/thayers-source-verification.md` is ABSENT, but
`abe5252` (ancestor of base `9dce273`) committed that file, so the premise is false at base.
Proven pre-existing: the same failure reproduces with all of this branch's changes stashed
(pristine `9dce273`) — transcript: `baseline-red-thayers-gate-not-mine.txt` in this evidence
directory. The defect is already owned by **W-BASEFIX**
(`origin/swarm/w-basefix-thayers-guard`, verified, evidence under
`docs/evidence/swarm-2026-08-22/w-basefix/`). The green `audit.txt` above was run with that
branch's `test/publish-flip-toolchain.test.ts` repair applied TRANSIENTLY (uncommitted,
reverted afterward — this branch does not carry it). At pristine base the audit is red on
exactly that one leg; every other leg is green with my change. Wave 8 merges W-BASEFIX
before/alongside this branch, so no action is needed from me — flagged so the orchestrator
does not read my worktree's first audit as my regression.

The tests drive the real `PlansClient` and assert the completed checkbox's light AND dark
class markers move on the same optimistic paint (the A7b dual-theme lesson — verified against
the component, not just state).

## Boundaries kept

No new dependencies/config/env. No DB writes (UI-only; migration 106's grants already ship).
No prod anything. Primary tree untouched. The `toggle` request shape and the API route are
unchanged; adjacency with `swarm/W-SEC-CSRF-csrf-floor` (route handlers) does not intersect
this diff (component + test files only).

## Note for W-BOARDHYGIENE / the owner packet

MASTER.md C4's deploy-row title ("Deploy — ships L1's retry, L2 step 2, and UX-5") asserted
L2 step 2 shipped with deploy `2611e1f`; the code at `origin/main` (`9dce273`) disproves it —
no deploy carried the optimistic toggle before this branch. C3's "deferred to the next
deploy" was the true statement. Row updates belong to W-BOARDHYGIENE (Wave 6 owns MASTER.md
rows for closed items), so the row is left untouched here; the C3/C4 rows should gain
"L2 step 2 implemented 2026-08-22 on `swarm/W-L2TOGGLE-plan-toggle`, deploy pending" when
this merges.

## Provider spend (A1)

$0.00. No embeddings, no eval runs, no provider calls — component test + local audit only.
