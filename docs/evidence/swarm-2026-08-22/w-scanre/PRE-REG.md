# W-SCANRE PRE-REGISTRATION — SCAN_RE false-floor class (ADR-gated, §2.4)

**Committed before any measurement runs.** Committed together with the dataset
(`evals/cases/reference_floors.yaml`) and the harness
(`scripts/probe-scan-floors.mts`); neither may be edited after this commit
(§2.4 step 4 — no tuning to the demo). Base: `origin/main`
`9dce273ef09dffb03bc547cead0431f48fb71ffe`.

## Claim

`SCAN_RE`'s bare `([a-z]{2,})\s+(\d…)` path floors idiomatic non-citations
whose "book word" is a common English noun (`she is 1 mark 5 points from
winning` → Mark 5 floors; measured n=2/10 on 2026-08-21, WORKLOG known-issue).
Because the floor reserves the top two answer slots, a false floor displaces
correct voices on a topical query (ADR-015's hijack class surviving in the
un-corroborated numeric path). Extending ADR-015's corroboration gate to
numerics whose book word is a common English noun —
`{mark, james, job, acts, numbers, kings}` — eliminates the false-floor class
without losing genuine floors: such numerics still **inject** (soft-boost is
false-positive-safe) but **floor** only when biblically corroborated.
Corroboration mirrors ADR-015's pericope rule: a second named passage (a
second scanned numeric reference) corroborates, or a `BIBLICAL_LEXICON` token
must survive after the matched span is stripped from the normalized query.
Every other numeric reference keeps flooring unconditionally.

## Dataset (frozen at this commit)

`evals/cases/reference_floors.yaml`, suite `reference_floors`:

- **36 adversarial non-citations** (`scanre-nc-001…036`): 6 per gated book
  word (mark/james/job/acts/numbers/kings), idiomatic uses with digits, no
  biblical-lexicon token and no pericope alias outside the matched span.
  Includes the two cases measured on 2026-08-21 (`scanre-nc-001`,
  `scanre-nc-007`). Grows the standing n=10 adversarial set ("should grow").
- **31 genuine-citation controls** (`scanre-gc-001…031`): 18 with a gated
  book word PLUS explicit biblical corroboration (a lexicon token or a second
  scanned reference — checked case-by-case against the lexicon before
  freezing), and 13 un-gated numerics whose floor mechanism is untouched.

## Measurement method

1. `npx tsx scripts/probe-scan-floors.mts` — runs every case through
   `resolveIntent` (tier-level, per ADR-115: the hijack lives in the
   `{inject, floor}` output, not in whether a string parses). Run **pre-fix**
   (the watched RED: documents how many non-citations floor today) and
   **post-fix**.
2. Fixture leg (no movement on ADR-115's existing reference-routing
   fixtures): `cd web && npx tsx src/scripts/probe-reference-routing.mts`
   output captured pre-fix and post-fix must be **byte-identical**, and the
   existing vitest assertions in `test/ref-parse.test.ts` and
   `test/reference-intent.test.ts` (pre-change assertions) must pass
   unchanged. New tier-level tests added with the fix are red-proven against
   the pre-fix code before they are seen green.
3. Full `npm run audit` in the worktree before the fix is called done.

## Pass/fail bar (merge-if-clear — ALL three legs)

1. **0 false floors** post-fix on the 36 non-citation cases.
2. **100% preserved floors** post-fix on the 31 genuine-citation controls.
3. **No movement** on the existing reference-routing fixtures (leg 2 above).

## Withdrawal bar (§2.4 step 3)

If any leg fails: write the ADR proposal at
`docs/pm/orders/2026-08-22-w-scanre-adr-proposal.md`, **revert the behavior
change**, keep the measurement, mark the item **HELD-FOR-OWNER**. The bar is
not redefined after this commit; a defective bar is reported, not moved
(W-SLICE4 precedent). The enlarged eval set and the probe harness merge
regardless of outcome — they are measurement infrastructure.
