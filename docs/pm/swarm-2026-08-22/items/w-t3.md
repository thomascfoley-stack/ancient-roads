# W-T3 — Lane C T3 (mobile tab bar / scripture) + MASTER.md housekeeping

**Workstream:** swarm/W-T3-cursor-ccel-ux · **Base:** origin/main `9dce273`
**Status: ALREADY-DONE (code) + NOT RUN (device leg); housekeeping MOOT (§2.6 precondition false)**

Transitions: CLAIMED → ALREADY-DONE + NOT RUN (+ MOOT on the housekeeping sub-item)

## Code-complete claim — verified

`docs/UX_REMEDIATION.md` line 201 marks T3 "~ CODE COMPLETE, DEVICE OPEN" with a regression
guard; the full T3 block (line 1670) says the page-level fix is `padding-bottom` accounting
for the tab bar in `app-shell.tsx`. Verified:

- The guards exist: `web/test/invariants/t1-t3-first-run.test.ts` (SEED note: "remove the
  `pb-[calc(...)]` from app-shell.tsx → RED") and `web/test/invariants/tab-bar-reserved-once.test.ts`
  (DERIVES the reserve expression out of app-shell.tsx — "this check has gone blind" if removed).
- They run in the web vitest suite (i.e. inside `npm run audit`) and are green at base:
  10/10 — `docs/evidence/swarm-2026-08-22/w-t3/guard-green.log`.

Per the block's own Do-NOT, `env(safe-area-inset-bottom)` is 0 on desktop, so the notched
device case is unverifiable here — the device leg is honestly NOT RUN and goes to the owner
packet as "T3 device leg owed" (hardware required). T3 was not reinterpreted into anything
bigger; no code changed.

## Housekeeping sub-item — MOOT with evidence

The brief (and the order's §8 text: "there is no separate ROADMAP file") direct correcting a
"dead `UX_REMEDIATION_ROADMAP.md` pointer" in MASTER.md (~line 127). **The premise is false at
the build base:** `docs/pm/UX_REMEDIATION_ROADMAP.md` EXISTS at origin/main `9dce273` (153
lines, last touched `3579fc6`) and exists in the primary tree; `git log --diff-filter=D` shows
it was never deleted. The MASTER.md link `[UX_REMEDIATION_ROADMAP.md](UX_REMEDIATION_ROADMAP.md)`
resolves. "Fixing" the pointer would have CREATED a falsehood (deleting a live link), so
MASTER.md was left untouched for this sub-item. Recorded per §2.6 (precondition false → MOOT,
not FAILED). The order doc's parenthetical "(there is no separate ROADMAP file)" is itself the
stale claim; orchestrator/owner may wish to correct it there — not edited here (orders are
filed records).

## Evidence (docs/evidence/swarm-2026-08-22/w-t3/)

- `guard-green.log` — both T3 regression guards green (10/10).

## Spend (A1)

$0 — no provider calls.
