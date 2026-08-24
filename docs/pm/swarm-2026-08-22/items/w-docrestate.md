# W-DOCRESTATE — Doc-restatement guard

Order: docs/pm/orders/2026-08-22-autonomous-swarm-closeout.md §6 (W-DOCRESTATE brief).
Finished by workstream **W-DOCRESTATE-finish** (2026-08-23): the guard was substantially
built on `swarm/W-DOCRESTATE-doc-restatement-guard` @ c476a8c but its session was killed
(2026-08-22 provider-quota event) before the audit leg completed; the commit is labeled
"partial — audit NOT verified green". This workstream fetched the branch, re-verified the
committed work against the code, and completed the remaining legs.

## Transitions (§2.9)

- **CLAIMED** — 2026-08-22 (original W-DOCRESTATE session); re-claimed 2026-08-23 by
  W-DOCRESTATE-finish on branch `swarm/W-DOCRESTATE-finish-docrestate` (from c476a8c).
- **RED-PROVEN** — 2026-08-22 (original session): live-file red at
  `docs/evidence/swarm-2026-08-22/w-docrestate/red-baseline.txt` +
  `red-live-first-run.txt`; seeded-defect red-proofs at `redproof-live-seeds.txt`.
  **Re-executed 2026-08-23 by W-DOCRESTATE-finish** (fresh context): pre-fix docs → the
  identical five violations; CLAUDE.md HIT@2→HIT@1 seed on the ADR-naming line → fires
  exactly as committed; restores → green, tree clean. Transcript:
  `docs/evidence/swarm-2026-08-22/w-docrestate/verify-finish-rerun.txt`.
- **FIXED** — 2026-08-22 (c476a8c): guard at `test/invariants/doc-restatement.test.ts`
  (ruled values parsed out of DECISIONS.md, never hardcoded — the design's anti-watchlist-
  fourteen requirement); doc fixes in `docs/HELDOUT_EVAL_DESIGN.md` (two stale HIT@1
  gate-table rows → marked superseded + pointed) and `docs/STATE_OF_TRUTH.md` (faithfulness
  block → pointer). Wiring: the root vitest gate of `npm run audit` sweeps
  `test/**/*.test.ts`, so the guard runs in audit with zero audit.sh/package.json changes.
  Verified in the code 2026-08-23 (`vitest.config.ts` include pattern; `scripts/audit.sh`
  "tests + coverage — vitest" gate).
- **AUDIT-GREEN** — 2026-08-23, worktree `/tmp/swarm-W-DOCRESTATE-finish`: full
  `npm run audit` — every gate green (env, 4× typecheck, 2× lint, knip, deps, qa,
  hygiene, deploy.sh harness, Gate B licensing) except the vitest gate's ONE red leg:
  `test/publish-flip-toolchain.test.ts > thayers evidence gate` (1 failed |
  1618 passed | 128 skipped across 272 files; the doc-restatement guard itself ran green
  inside the gate, 16/16). That leg is the pre-existing red owned and VERIFIED by
  `swarm/w-basefix-thayers-guard` — proven not this item's two ways: (a) this branch's
  diff vs base 9dce273 touches only `docs/HELDOUT_EVAL_DESIGN.md`,
  `docs/STATE_OF_TRUTH.md`, `docs/evidence/swarm-2026-08-22/w-docrestate/*`, and
  `test/invariants/doc-restatement.test.ts`, while the failing test imports only
  `scripts/lib/publish-flip-*` and `scripts/lib/target-guard.mjs`; (b) the identical
  single failure (1 failed | 38 passed, same "thayers evidence gate" case) reproduces on
  a detached worktree at base 9dce273 with no W-DOCRESTATE content
  (run 2026-08-23, `/tmp/swarm-docrestate-basecheck`, removed after).
- **VERIFIED** — pending Wave 7 independent verifier (fixer ≠ verifier, §2.3). The
  W-DOCRESTATE-finish re-execution above is a same-workstream completion check, not the
  Wave 7 certification.

Terminal state: **DONE (pending Wave 7 verify + Wave 8 merge)**.

## Scope conformance (the brief's limits)

- Values guarded: exactly the three ADR-116 rulings (proper-noun gate metric HIT@2,
  interpretation_bait bar ≥99%, launch scope GATED BETA + SEC-1 open) — no speculative
  expansion; the ADR-118 HIT@2 bar is not restated outside DECISIONS.md so there is
  nothing to guard (test header, SCOPE paragraph).
- Files scanned: CLAUDE.md (may carry, must match) + STATE_OF_TRUTH.md,
  HELDOUT_EVAL_DESIGN.md, pm/MASTER.md (pointers only). Dated records not scanned.
- Expectations derived FROM DECISIONS.md at test time; a vacuity guard fails loudly if
  the ADR text stops parsing. No hardcoded ruled values anywhere in the check.
- No new dependencies, config flags, env vars, or migrations. No DB, no network, no prod.
- Least code: one test file + two one-line-class doc fixes. Cost of not fixing (§2.5):
  CLAUDE.md has advertised superseded ruled values as current twice in one day
  (2026-08-21 WORKLOG) — the defect recurs whenever a ruling lands.

## Spend (A1)

$0.00 — no provider calls of any kind (no embeddings, no eval runs, no LLM API use);
the guard is a static file-parse invariant. Cumulative workstream spend: $0.00.

## Branch / commits

- Original (as-found, committed by the 2026-08-22 recovery sweep): c476a8c on
  `swarm/W-DOCRESTATE-doc-restatement-guard`.
- Finish branch: `swarm/W-DOCRESTATE-finish-docrestate` — adds this item file and
  `verify-finish-rerun.txt` only; no code changes were needed (the committed guard and
  doc fixes verified as correct and complete against the brief).
