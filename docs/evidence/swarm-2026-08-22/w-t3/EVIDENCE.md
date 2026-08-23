W-T3 evidence — 2026-08-23, base 9dce273

== guard files exist ==
web/test/invariants/t1-t3-first-run.test.ts
web/test/invariants/tab-bar-reserved-once.test.ts

== guards run green (vitest direct) ==
 Test Files  2 passed (2)
      Tests  10 passed (10)

== audit wiring: scripts/audit.sh runs full vitest (include: test/**/*.test.{ts,tsx}) + qa ==
59:gate "tests + coverage — vitest"          $PNPM exec vitest run --coverage
60:gate "qa — Layer 1 invariants + regressions" $PNPM run qa
62:# deploy.sh is bash, so vitest never saw it: every line of the gate in front of the irreversible

== UX_REMEDIATION.md:201 marks T3 CODE COMPLETE, DEVICE OPEN ==
| 3 | `T3` | Mobile — tab bar must not cover scripture | `~` **CODE COMPLETE, `DEVICE` OPEN.** The page-level fix is in `app-shell.tsx` and now has a regression guard. Its step 3 (duplicate Search tab

== housekeeping premise check: the "dead" pointer is LIVE ==
127:[`UX_REMEDIATION_ROADMAP.md`](UX_REMEDIATION_ROADMAP.md). **This lane had no row here until
-rw-r--r--  1 foley  wheel  9550 Aug 22 18:38 docs/pm/UX_REMEDIATION_ROADMAP.md
3579fc6 Doc hygiene: WORKLOG gap filled, stale deploy rows corrected, L1/N4 board-table disagreement resolved
