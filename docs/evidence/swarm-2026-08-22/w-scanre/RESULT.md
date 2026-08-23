# W-SCANRE RESULT — SCAN_RE false-floor class: bar NOT cleared (34/36), HELD-FOR-OWNER

Pre-registered at `PRE-REG.md` (commit 918e2c2, before any measurement). Dataset frozen:
`evals/cases/reference_floors.yaml` (36 adversarial non-citations + 31 genuine-citation
controls). Harness: `scripts/probe-scan-floors.mts` (tier-level, through `resolveIntent`).

## The three pre-registered legs, as measured

| Leg | Bar | Measured | Verdict |
|---|---|---|---|
| 1. False floors on the 36 non-citations | 0 | **2** (nc-001, nc-007) | **FAILS** |
| 2. Preserved floors on the 31 genuine controls | 31/31 | **31/31** | PASSES |
| 3. No movement on ADR-115's existing fixtures | identical | probe-reference-routing output **byte-identical** pre/post; all 85 pre-existing vitest assertions in `test/ref-parse.test.ts` + `test/reference-intent.test.ts` pass unchanged | PASSES |

**Bar NOT cleared (leg 1). Per §2.4 step 3: behavior change REVERTED, ADR proposal written
(`docs/pm/orders/2026-08-22-w-scanre-adr-proposal.md`), item HELD-FOR-OWNER.** Revert verified:
probe returns to the pre-fix state (33 false floors), tree diff on the four touched source/test
files is empty.

## What the measurement established (pre-fix RED)

The false-floor class is far wider than the n=2/10 known-issue sample suggested: **33 of 36**
adversarial idioms floor on the shipped code (`RED-prefix-probe.txt`) — 6/6 mark, 6/6 james,
6/6 job, 6/6 acts, 6/6 numbers, 3/6 kings (the three bare `kings N` forms die in parseRef as
ambiguous). Every false floor reserves the top two answer slots on a topical query.

## What the candidate direction achieved (post-fix measurement, then reverted)

Extending ADR-015's corroboration gate to numerics whose book word ∈ {mark, james, job, acts,
numbers, kings} took false floors **33 → 2** (`postfix-probe.txt`), with zero genuine-control
loss and zero fixture movement. The two survivors are two DISTINCT design questions, not
implementation bugs — the pre-registered rule was implemented exactly as registered:

1. **nc-001** `she is 1 mark 5 points from winning` → floors Isaiah 1 + Mark 5. The alias `is`
   (Isaiah) matches `is 1` — an un-gated false numeric — and under the registered rule "a
   second scanned numeric reference corroborates", the two false candidates **corroborate each
   other**. The registered design does not require the corroborating passage to itself be
   high-confidence. (The `is` → Isaiah alias is also itself a fourth false-floor class —
   un-gated, out of this item's scope, reported not fixed.)
2. **nc-007** `i counted 3 james 2 marys and a paul` → floors James 2. After the matched span
   is stripped, `paul` survives — and `paul` is a `BIBLICAL_LEXICON` token (major figures), so
   the registered rule reads the idiom as biblically corroborated. ADR-015's lexicon is working
   as designed for pericopes; for the numeric gate a person-name token is too loose.

Both residuals need an owner-visible design ruling (see the ADR proposal); neither was patched
after the measurement ran (§2.4 step 4 — no tuning to the demo).

## Test red-proof note

The new tier-level tests were watched RED pre-fix (exactly the 6 idiom cases failing,
`RED-prefix-tests.txt`). The first draft had two wrong verse-level anchors in MY OWN control
expectations (James 1:2, Numbers 6:24-26 — a verse/verse_range ref's range starts at the verse,
not the chapter), caught by the RED run itself, corrected, and re-run; the draft transcript is
kept (`RED-prefix-tests-draft-anchors.txt`). Post-fix, 85/87 passed — the 2 failures are the
same two residual cases (`postfix-tests.txt`). The new test block was reverted together with
the behavior change.

## What merges (measurement infrastructure, per the brief step 5)

- `evals/cases/reference_floors.yaml` — the n=67 frozen set (grows the standing n=10
  adversarial set to 36 non-citations + 31 controls; discharges "adversarial eval set is
  n=10; should grow" for this class).
- `scripts/probe-scan-floors.mts` — the tier-level harness. On the reverted tree it reports
  34/67 with the 33 known false floors — that IS the current measured state of the defect.
- This evidence directory (pre-reg, RED/GREEN transcripts, fixture diffs).

The behavior change itself does NOT merge (reverted, verified).
