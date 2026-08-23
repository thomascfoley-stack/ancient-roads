# W-T3 — Lane C T3 (device-bound)

**Workstream:** W-SEC-CURSOR (branch `swarm/W-SEC-CURSOR-sections-cursor`, base `origin/main` 9dce273)
**Status:** ALREADY-DONE (code) + NOT RUN (device leg) + AUDIT-GREEN but for one pre-existing baseline red owned by swarm/w-basefix-thayers-guard (see Audit section). Housekeeping fix applied (below).
**A1 provider spend:** $0.00.

## Verification of the code-complete claim
`docs/UX_REMEDIATION.md` line ~201 marks T3 "CODE COMPLETE, DEVICE OPEN … now has a
regression guard". Checked:
- The guard exists: `web/test/invariants/t1-t3-first-run.test.ts` (T3 block) asserts the
  page scroll container in `app-shell.tsx` reserves
  `pb-[calc(3.75rem+env(safe-area-inset-bottom))]` on mobile and `md:pb-0` on desktop.
- It runs in `npm run audit`: the audit's `qa` gate runs
  `vitest run --config web/vitest.config.ts`, which includes `web/test/**`; the file was
  run directly and is green (6/6).
- The T3 block's own honesty holds: `env(safe-area-inset-bottom)` is 0 on desktop, so the
  notched-device case is provable only on hardware — the `DEVICE` exit tests
  (docs/UX_REMEDIATION.md:1704-1709) stay open and are owner/hardware-bound. No code
  change made; T3 was not reinterpreted into something bigger.
**Device leg: NOT RUN** — no device access in this environment (the block itself says
desktop verification is useless for the notched case).

## Housekeeping (§2.9 discovered falsehood)
MASTER.md line ~127 pointed "sequencing and blockers" at a nonexistent
`UX_REMEDIATION_ROADMAP.md`. There is no such file; the spec, sequencing and blockers all
live in `docs/UX_REMEDIATION.md`. Pointer corrected in place
("dead pointer corrected 2026-08-23"); repo-wide grep confirms no remaining reference.

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
