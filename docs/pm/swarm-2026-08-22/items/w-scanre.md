# W-SCANRE — SCAN_RE false-floor class

**Status:** HELD-FOR-OWNER (pre-registered bar not cleared: leg 1 = 34/36; behavior change
reverted and verified) · **Wave:** 2 (ADR-gated retrieval)
**Worktree:** /tmp/swarm-scanre · **Branch:** swarm/w-scanre-false-floor · **Base:** origin/main 9dce273
**Provider spend (A1):** $0.00 — routing-level measurement only; no embeddings, no model calls, no DB.

## Transitions

- CLAIMED 2026-08-23 — worktree cut from origin/main 9dce273 (never primary-tree HEAD), full
  bootstrap per §2.7 plus `web/node_modules`; both env files silently verified clean (dev only,
  `ep-tiny-hat` present; no `odd-fog`/`CUTOVER_` match) and copied.
- PRE-REGISTERED 2026-08-23 — `docs/evidence/swarm-2026-08-22/w-scanre/PRE-REG.md`, commit
  918e2c2, with the frozen dataset (`evals/cases/reference_floors.yaml`: 36 adversarial
  non-citations + 31 genuine-citation controls) and harness (`scripts/probe-scan-floors.mts`)
  BEFORE any measurement run (§2.4 step 1). Bar: 0/36 false floors AND 31/31 preserved floors
  AND no movement on ADR-115's existing fixtures.
- RED-PROVEN 2026-08-23 — pre-fix probe run watched RED: **33/36 non-citations floor on shipped
  code** (`RED-prefix-probe.txt`; the class is far wider than the n=2/10 sample). New tier-level
  vitest cases watched RED pre-fix: exactly the 6 idiom cases fail (`RED-prefix-tests.txt`; a
  first draft with two wrong verse-level anchors in my own control expectations was caught by
  the RED run itself, corrected, re-run — draft kept as `RED-prefix-tests-draft-anchors.txt`).
- MEASURED 2026-08-23 — implemented the pre-registered candidate exactly as registered (ADR-015
  corroboration extended to numerics with book word ∈ {mark,james,job,acts,numbers,kings}).
  Legs: **1 FAILS (2/36 residual)**, 2 passes (31/31), 3 passes (probe-reference-routing
  byte-identical pre/post, `fixture-*.txt`; all pre-existing vitest assertions unchanged).
  Residuals are two distinct owner-level design questions: (a) two false candidates corroborate
  each other (`is 1`→Isaiah 1 corroborates `mark 5`; the `is`→Isaiah alias is itself a fourth,
  separate false-floor class — reported, not fixed); (b) the major-figure lexicon token `paul`
  corroborates a people-listing idiom. Full record: `../evidence/swarm-2026-08-22/w-scanre/RESULT.md`.
- REVERTED 2026-08-23 — per §2.4 step 3 the behavior change (pericopes.ts/ref-parse.ts, both
  mirrors, + the new test block) was reverted; verified: tree diff empty on the touched files,
  probe back to the pre-fix 33-false-floor state. ADR proposal at
  `docs/pm/orders/2026-08-22-w-scanre-adr-proposal.md` (recommends option B: high-confidence
  corroborators + excluding major-figure tokens from the numeric gate, re-measured under a
  fresh pre-registration against the committed frozen set).
- **HELD-FOR-OWNER** 2026-08-23 — measurement infrastructure merges regardless (brief step 5):
  the n=67 frozen eval set + probe harness + evidence directory. This also discharges the
  standing "adversarial eval set is n=10; should grow" note for this class (now 36
  non-citations + 31 controls).

## Recorded deviations / doc corrections

- The brief (§7) says "minimal diff in the routing code (`web/src/lib/teacher/`)". The
  corroboration gate lives in `resolveIntent`, defined in `web/src/bible/pericopes.ts`
  (imported by `web/src/lib/teacher/retrieve.ts`), and `src/bible/` ↔ `web/src/bible/` are
  byte-identical mirrors under the `bible-sync` guard — so the (now reverted) fix landed in
  `pericopes.ts` + a `scanReferenceSpans` accessor in `ref-parse.ts`, in BOTH mirrors. The
  teacher directory needed no edit. A future implementer should follow the same path.
- Newly surfaced, REPORTED NOT FIXED (out of scope): the `is` → Isaiah alias floors
  unconditionally on `is 1` / `is 5`-shaped text — a fourth false-floor class distinct from the
  six common-noun book words. Visible in `RED-prefix-probe.txt` (nc-001 floors 23:1 alongside
  41:5) and the ADR proposal.

## Audit

- `npm run audit` in the worktree: see below (filled at completion). Known pre-existing red:
  the thayers baseline (W-BASEFIX's item) — noted, not fixed.
