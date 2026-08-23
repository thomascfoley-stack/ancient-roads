# W-SCANRE — SCAN_RE false-floor class

**Status:** PRE-REGISTERED (measurement next) · **Wave:** 2 (ADR-gated retrieval)
**Worktree:** /tmp/swarm-scanre · **Branch:** swarm/w-scanre-false-floor · **Base:** origin/main 9dce273

## Transitions

- CLAIMED 2026-08-23 — worktree cut from origin/main 9dce273 (never primary-tree HEAD), full
  bootstrap per §2.7 plus `web/node_modules`; both env files silently verified clean (dev only,
  `ep-tiny-hat` present; no `odd-fog`/`CUTOVER_` match) and copied.
- PRE-REGISTERED 2026-08-23 — `docs/evidence/swarm-2026-08-22/w-scanre/PRE-REG.md`, committed
  with the frozen dataset (`evals/cases/reference_floors.yaml`: 36 adversarial non-citations +
  31 genuine-citation controls) and the harness (`scripts/probe-scan-floors.mts`) BEFORE any
  measurement run (§2.4 step 1). Bar: 0/36 false floors AND 31/31 preserved floors AND no
  movement on ADR-115's existing fixtures (probe-reference-routing output byte-identical +
  existing ref-parse/reference-intent assertions unchanged).

## Recorded deviations / doc corrections

- The brief (§7) says "minimal diff in the routing code (`web/src/lib/teacher/`)". The
  corroboration gate lives in `resolveIntent`, which is defined in `web/src/bible/pericopes.ts`
  (imported by `web/src/lib/teacher/retrieve.ts`), and `src/bible/` ↔ `web/src/bible/` are
  byte-identical mirrors under the `bible-sync` guard — so the fix lands in `pericopes.ts`
  (plus the `scanReferenceSpans` accessor in `ref-parse.ts`), in BOTH mirrors. The teacher
  directory itself needs no edit.
