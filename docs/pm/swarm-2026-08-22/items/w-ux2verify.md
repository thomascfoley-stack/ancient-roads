# W-UX2VERIFY — browser-verify the UX-2 explainer line

**Workstream:** W-SEC-CURSOR (branch `swarm/W-SEC-CURSOR-sections-cursor`, base `origin/main` 9dce273)
**Status:** AUDIT-GREEN but for one pre-existing baseline red owned by swarm/w-basefix-thayers-guard (see Audit section). The UX-2 claim itself: **browser-VERIFIED** (transitions: CLAIMED → AUDIT-GREEN; VERIFIED/MERGED = Wave 7/8).
**A1 provider spend:** $0.00.

## What was verified
UX-2 (`e196e4b`, 2026-08-07) shipped typecheck-and-lint only: the line
"Tap a work to read it, or + to open it beside what is on your desk."
(`web/src/app/library/[catalog]/page.tsx:191`) had never been seen in a browser
(MASTER.md UX-2 row; WORKLOG 2026-08-07 NOT DONE).

## Method and result
`next dev` from this worktree (dev DB ep-tiny-hat), real Google Chrome driven headless
(`--headless=new --screenshot`, no new dependencies) at 1280x1000 on `/library/historians`
(renders with no extra fixtures — dev serves 1 published historian, josephus-whiston).
The explainer line renders visibly ABOVE the work list, beside the item count. The crop
was read back at native resolution to confirm the exact string.

## Evidence (docs/evidence/swarm-2026-08-22/w-ux2verify/)
- `library-historians-ux2.png` — full-page screenshot; the line is legible in the
  native-resolution crop (region x=350 y=340 w=750 h=45).
- `VERDICT.md` — method note.

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
