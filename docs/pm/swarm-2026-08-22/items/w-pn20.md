# W-PN20 — ADR-118 proper-noun held-out set

**Status:** IN PROGRESS (measurement running) · **Wave:** 1a (background measurement)
**Worktree:** /tmp/swarm-pn20 · **Branch:** swarm/w-pn20-proper-noun · **Base:** origin/main 9dce273

## Transitions

- CLAIMED 2026-08-22 — worktree cut from origin/main 9dce273 (never primary-tree HEAD), full
  bootstrap incl. `web/node_modules`; both env files silently verified clean (dev only,
  `ep-tiny-hat` present; no `odd-fog`/`CUTOVER_` match) and copied.
- PRE-REGISTERED 2026-08-22 — `docs/evidence/swarm-2026-08-22/w-pn20/PRE-REG.md`, commit
  f910a7a, before any measurement (§2.4).
- RED-PROVEN 2026-08-22 — both new checks watched RED then GREEN:
  `red-proof-hash-pin.txt` (one-byte drift in the frozen set fails the pin test), and
  `red-proof-anchor-check.txt` (fabricated anchor phrase fails; label colliding with a burned
  v3 label fails both coverage and disjointness). Infrastructure commit 3e78c80.
  Mint-time, the anchor-check also caught REAL defects pre-freeze: 7 of my first-draft labels
  collided with v2/v3 pericope/epistle labels and 2 anchors were unverifiable (3 John verse
  format; KJV "Arimathæa" ligature) — replaced with verified-free chapters, re-checked green.
- MEASURING — `eval-heldout.mts --pn20` read-only vs dev; served-pool snapshotted at start
  (390,184 served rows, 124 works, host ep-tiny-hat) and will be re-snapshotted at end.

## Recorded deviations / doc corrections

- The brief's step 3 says "file them under `evals/cases/`". That directory holds YAML for a
  different runner (`src/evals/run.ts`); the held-out accuracy harness the v4 run used
  (`web/src/scripts/eval-heldout.mts`) consumes `Q[]` sets from `web/src/scripts/heldout-*.mts`.
  Per the brief's binding "reuse its format", the set is filed as
  `web/src/scripts/heldout-pn20-queries.mts`. Declared in PRE-REG §Measurement method.
- Harness gap found and fixed (brief step 2): the v4 label anchor-check script was genuinely
  absent (STATE_OF_TRUTH §1 caveat 4). Written as `web/src/scripts/heldout-anchor-check.mts`,
  committed with red-proof; v4's 16 quoted anchors verify green, 106 unquoted refs are declared
  uncheckable (no phrase recorded in `source`), not silently skipped.
- Harness gap NOT introduced: `--pn20` flag is 2 lines in `activeSet()`; no other harness
  behavior changed.

## Result

**LAUNCH-BLOCKER-CONFIRMED.** HIT@2 = **17/20 = 85.0%**, below the ADR-118 bar of ≥ 90%
(18/20). HIT@1 = 13/20 = 65.0%. Wilson 95% CIs (reported, not gated): HIT@1 [43.3%, 81.9%],
HIT@2 [64.0%, 94.8%]. Failure codes: pass 17 / `<2-voices` 1 (pn20-13, Luke 23) /
`wrong-passage` 2 (pn20-16 1 Cor 16, pn20-18 3 John 1) / `no-content` 0. Capture complete
20/20. Served pool identical at start and end (390,184 rows, 124 works, ep-tiny-hat).
Reported, never tuned — no retrieval change under this item; per ADR-118's no-softening
ruling the remedies (re-run with more cases, or explicit owner amendment) are the owner's.
Full record: `docs/evidence/swarm-2026-08-22/w-pn20/RESULT.md` (commit 8b088c6).

Merge rule applied: case set + harness + anchor-check merge regardless of outcome (commits
f910a7a, 3e78c80, 8b088c6 on swarm/w-pn20-proper-noun). No push, no merge.

Status: AUDIT PENDING (vitest leg red at 17:44Z under concurrent writer-lane load —
investigating; see audit-tail.log).
