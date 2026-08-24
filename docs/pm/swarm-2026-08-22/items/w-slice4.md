# W-SLICE4 — /ask integration of the user corpus (sub-design gated, Wave 3)

Status: **HELD-FOR-OWNER** (pre-reg withdrawal path, §2.4 step 3: defective control bar failed
every run including baseline → ADR proposal written, behavior change reverted, measurements kept)
Branch: `swarm/w-slice4-ask-integration` · Worktree: `/tmp/swarm-slice4`
Base: `9dce273ef09dffb03bc547cead0431f48fb71ffe` (origin/main, Wave-0 baseline)

## Transitions

- **CLAIMED** 2026-08-23 — design phase per the §8 sub-design gate.
- **DESIGN-FILED** 2026-08-23 — `docs/pm/swarm-2026-08-22/w-slice4/DESIGN.md` (a256082).
- **DESIGN-APPROVED-WITH-CONDITIONS** 2026-08-23 — verdict
  `docs/pm/swarm-2026-08-22/verdicts/w-slice4-design.md`; all six conditions folded into
  DESIGN.md + PRE-REG.md and committed BEFORE any measurement (49dcbc6), incl. the ported
  `scripts/served-pool-snapshot.mjs` (from swarm/w-adrv4rerun @ 0abbd5b).
- **RED-PROVEN** 2026-08-23 — additive-not-load-bearing: H4 defect re-introduced in
  normalize-contract → 2 red → revert green (`additive-redproof.log`). Two-account RLS: lane
  fed the wrong user (both bindings weakened at the wiring level — predicate-removal alone
  cannot go red under FORCE RLS, verdict condition 2) → red → revert green
  (`rls-redproof.log`). FORCE-RLS binding red reused from
  `docs/evidence/uploader-deep-dive-2026-08-20/migration-12x-redproof.log`.
- **FIXED** 2026-08-23 — build per the amended design (9f35cb6): lane (RLS double-bound via
  the existing semanticSearch/runAsUser + anchor-span query, parallel, fail-soft, K=3),
  teach opts.userId (/api/eval/bait stays bare), user_library lookup namespace, "From your
  library" cards + tombstone bypass, BAIT_USER_ID harness hook. 13 unit + 3 dev-DB tests green.
- **AUDIT-GREEN** 2026-08-23 — `npm run audit` 847 passed / 1 failed; the one failure is
  `test/publish-flip-toolchain.test.ts` thayers evidence gate, reproduced IDENTICALLY at base
  9dce273 (W-BASEFIX's baseline red — noted, not fixed).
- **MEASURED** 2026-08-23 — pre-registered run complete (5ddd853): bait faithfulness 100% in
  all three runs (0 prod-screen leaks), frozen control hijacks 0/0, lane-active delta inside
  the pipeline's own 9% churn, pool drift zero. The pre-reg's teach-level control pin failed
  every run INCLUDING the pre-change baseline (7/10 composed everywhere) — defective bar,
  reported not redefined. RESULT.md has the full numbers.
- **HELD-FOR-OWNER** 2026-08-23 — per the withdrawal bar: behavior change reverted (5c8ab31;
  restore with `git revert 5c8ab31` if the owner rules the frozen-definition reading), ADR
  proposal at `docs/pm/orders/2026-08-22-w-slice4-adr-proposal.md`. Ruling sought: read the
  control bar as the frozen ADR-028 floor-based definition (all bars then cleared) or stand
  on the literal pin (change stays reverted).

## Spend (A1)

- Compose calls (Qwen/Qwen3.5-35B-A3B): 449 (134+122+143 bait, 18+18+14 control).
- Query embeddings (BAAI/bge-large-en-v1.5): 330 measurement + ~40 seeder/smoke/RLS-test.
- Estimated total ≈ **$0.20–0.40** (≈1.5M compose input / ≈0.5M output tokens, ~370 small
  embeddings). No console reading taken; call counts are exact from the run logs.
  Far under the $25 ceiling.

## Left behind on dev (owner/verifier note)

- Seed user `slice4-eval-seed` with document `slice4-eval-doc` (4 sections/embeddings/
  anchors) remains in dev for Wave-7 re-runs of AFTER(b). Cleanup:
  `DELETE FROM user_documents WHERE user_id = 'slice4-eval-seed';` (cascades).
- Orchestrator note: W-ADRV4RERUN's live-loop control leg may hit the same calibration wall
  (shipped pipeline composes 7/10 v4 controls; the floor-based definition is the clean one).

## Env bootstrap (§2.7)

Both env files silently checked CLEAN before copying; no values printed. Baseline worktree
`/tmp/swarm-slice4-base` (detached at 9dce273) created for the pre-change runs; remove with
`git worktree remove /tmp/swarm-slice4-base` when the swarm closes.
