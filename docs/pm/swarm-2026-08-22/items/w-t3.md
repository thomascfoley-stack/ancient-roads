# W-T3 — Lane C T3 (device-bound)

Workstream: W-UX1 · Branch: `swarm/W-UX1-ux1-desk-bible` · Base: `9dce273` (origin/main)

## Status: ALREADY-DONE (code) + NOT RUN (device leg) — as the brief predicted

Transitions: CLAIMED → ALREADY-DONE / NOT RUN.

## Verification of the code-complete claim

- `docs/UX_REMEDIATION.md` (T3 block, ~line 1670; board line ~201): "CODE COMPLETE, DEVICE OPEN"
  — the page-level fix is in `app-shell.tsx` with a regression guard.
- The guards exist and pass: `web/test/invariants/t1-t3-first-run.test.ts` (its own header says
  it is a regression guard, "deliberately NOT a claim that T3 is verified" — desktop
  `env(safe-area-inset-bottom)` is 0) and `tab-bar-reserved-once.test.ts`. Run:
  `docs/evidence/swarm-2026-08-22/w-t3/guard-runs.log` (10/10 green).
- Audit wiring: `scripts/audit.sh` runs the full vitest suite (include `test/**/*.test.{ts,tsx}`)
  plus `qa`, so the guards run in `npm run audit`.
- Device leg: NOT RUN — no device access; the spec's Do-NOT section forbids calling a resized
  desktop browser verification. Goes to the owner packet.

## Housekeeping premise — FALSE at base; MOOT, no edit made

The order (and W-T3's brief) said MASTER.md ~line 127 points at a nonexistent
`UX_REMEDIATION_ROADMAP.md`. At base `9dce273` the pointer is LIVE: it resolves to
`docs/pm/UX_REMEDIATION_ROADMAP.md`, a real committed file (last touched `3579fc6`) whose
content is exactly what the sentence claims (sequencing, sizing, blockers). "Correcting" it to
`docs/UX_REMEDIATION.md` would have REPLACED a live pointer with a wrong one — the spec and the
roadmap are different docs. Evidence: `docs/evidence/swarm-2026-08-22/w-t3/EVIDENCE.md`.

## Provider spend (A1)

$0.00.
