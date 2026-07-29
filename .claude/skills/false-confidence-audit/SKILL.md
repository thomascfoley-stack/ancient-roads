---
name: false-confidence-audit
description: >
  Adversarial audit of a TEST SUITE for tests that pass without proving anything — the tests that make
  `npm run audit` green while the guarantee they name is unenforced. Use whenever asked to "audit the
  tests", "are these tests real", "do the tests actually test anything", after writing a batch of tests,
  before trusting a green gate, or as a standing overnight/pre-deploy hygiene pass. Hunts: can't-fail
  assertions, tautologies (constant-against-itself), over-mocking (mocking the thing under test),
  skipIf/skip that silences the check in CI, structure-not-behavior tests (grep the source instead of
  running it), weak assertions (toBeDefined/toBeTruthy/not.toThrow on a boolean), and try/catch that
  swallows the assertion. The bar for every finding: FIX the test so it CAN fail, PROVE it by seeding the
  bug and watching it go red, THEN fix (or restore) the code. A test you never watched fail is not a test.
---

# False-Confidence Audit — tests that buy unearned green

> **The principle is in [`docs/THE_LOOP.md`](../../../docs/THE_LOOP.md): the verifier is the bottleneck; no
> work is "done" without a check that could have failed.** That page is the index; this skill is the deep
> procedure for rule 4 (seeded-bug proof) — how to tell a real check from theatre, and the seed→red→revert→green
> loop that proves one.

**The failure this exists to prevent:** a suite that reports green while the thing it claims to guarantee is
broken. A wrong test is worse than no test — no test is an honest gap; a wrong test is a gap with a light on
top of it saying "covered." On this repo the existential guarantees (never interpret Scripture, never serve a
forbidden translation, never leak another tenant's data) are defended *by tests*. A test that can't fail is a
hole in the hull painted to look like steel.

**The one discipline that separates a real test from theatre:** you have watched it fail for the right reason.
If you cannot point to the moment the assertion went red when the code was wrong, you do not know that it
tests the code — you know only that it passes. Every fix in this audit ends with a **seed-the-bug proof**.

## The taxonomy — what to hunt

Grep-and-read the suite for each of these. Each entry: the smell, why it's false confidence, the fix.

1. **Tautology / constant-against-itself.** `expect(baseline).toBe(263496)` where `baseline` was loaded from
   the same source the assertion re-states; `expect(x).toBe(x)`; asserting a value equals the literal it was
   just assigned. *Why fake:* nothing about the system can make it fail. *Fix:* assert the value against an
   **independent** expectation (a hand-computed number, a second derivation, the real artifact), or delete it.

2. **Can't-fail structurally.** Assertion lives after an early `return`, inside an `if` that's never true in
   the test, or in a loop over an empty collection (`for (const x of []) expect(...)`). A "sanity" pre-check
   that guarantees the collection is non-empty is *required* before a for-each assertion, or the whole check
   is vacuous. *Fix:* assert the collection is non-empty first; make the branch reachable.

3. **Over-mocking — mocking the thing under test.** If the module you're testing is replaced by `vi.mock`, or
   its collaborators are mocked so completely that the mock *is* the behavior under assertion, the test proves
   the mock, not the code. (Mocking a *peripheral* dependency — a reranker in a licensing test, the clock — is
   fine; mocking the *subject* is not.) *Fix:* unmock the subject; mock only the expensive/nondeterministic
   edge, and assert the subject's real logic runs.

4. **skipIf / skip that silences the check in the gate.** `describe.skipIf(!dbUrl)`, `it.skip`, `ctx.skip()`
   — legitimate for genuinely environment-bound tests, but a landmine when the environment they need is
   **absent in CI**, because the gate then reports green having run *zero* of those assertions. The tell:
   the most important invariant in the file is behind a `skipIf` that is *always true in CI*. *Fix options,
   in order:* (a) provide the environment in CI so it runs; (b) enforce the same invariant at another
   automatic gate that *does* have the environment (e.g. the deploy gate); (c) at minimum make the skip
   **loud and auditable** — a banner naming exactly which guarantee is unenforced here — so nobody reads the
   green as coverage. A silent skip is the propped-open gate.

5. **Structure-not-behavior.** The test greps the source (`readFileSync(...).toMatch(/WHERE EXISTS/)`) or
   asserts a query STRING contains a column name (`sql.toMatch(/user_id/)`) instead of running the code and
   observing the outcome. *Why fake:* it passes on plausible-broken code — `user_id` present as
   `AND user_id IS NOT NULL` (not compared to the caller), `requireUser` present but called *after* the money
   is spent, the pattern present in a comment. *Fix:* run the behavior and assert the outcome (two users →
   B can't see A's rows). If a full behavioral test needs an environment CI lacks, strengthen the structural
   assertion so it can't pass on the *specific* decoy (bind to `= $n`, assert call-ordering by index) AND
   record that the real proof is the (skipped/deploy-time) behavioral test — see #4.

6. **Weak assertion.** `toBeDefined()`, `toBeTruthy()`, `not.toThrow()`, `toBeGreaterThan(-1)` where a
   precise assertion is available. `toBeTruthy()` on a function that returns a failure-reason string passes
   for the *wrong* reason too. *Fix:* assert the specific value/shape (`toBe(null)` for pass, `toContain(
   'verdict')` for the specific failure).

7. **try/catch that swallows the assertion.** An `expect` inside a `try` whose `catch` is empty or just logs;
   a `.catch(() => {})` on the promise under test. A thrown assertion is caught and the test passes.
   *Fix:* remove the catch, or `expect(...).rejects` / assert in the catch with a guaranteed-reached fail.

## The loop (in order)

1. **Enumerate.** `grep -rnE` the suite for each smell (`skipIf|\.skip\(`, `toBeTruthy\(|toBeDefined\(|
   not\.toThrow`, `vi\.mock`, `readFileSync.*test|toMatch\(/`, `try \{`, `toBe\((\w+)\)` self-compares).
   List every hit; read the file around it — a smell in isolation is not a verdict (a `not.toThrow` on
   malformed-input handling is legitimate).

2. **Classify each hit: real or theatre.** The question is always the same: *can this assertion go red if the
   code it names is wrong?* If you can't immediately say yes, it's a suspect.

3. **For every confirmed finding, run the seed-the-bug proof — this is not optional:**
   - Strengthen/rewrite the test so it *should* catch the specific bug.
   - **Introduce that exact bug in the source** (a decoy edit: swap `= caller` for `IS NOT NULL`, move
     `requireUser` after `teach()`, flip a boundary).
   - Run the test. **Watch it go red.** If it stays green, your test still doesn't test — iterate.
   - **Revert the decoy.** Run again. **Watch it go green.** Now you know the test tracks the code.
   - Commit the strengthened test. Never commit a decoy — verify `git diff` shows only the test change.

4. **Where the real fix is an environment/infra/policy decision** (CI has no DB; a guarantee needs a test
   branch + secret), do not fake a pass and do not silently break the gate overnight. Make the gap **loud**
   (#4c), document it with the evidence, and PARK the infra decision for the owner. An honest red-or-banner
   beats a dishonest green.

5. **Report.** For each finding: file:line · which smell · the failure scenario it *should* catch but didn't ·
   what you changed · the seed-the-bug proof (what you broke, that it went red, that revert went green) ·
   or, if parked, why and the recommended real fix.

## Rails (this repo)

- **Never loosen an assertion to make a suspect pass.** The direction of a fix is always *stronger*.
- **Never touch the verifier/compose path** to make a test go green — escalate.
- The two existential guarantees (faithfulness ≥99% via the live bait loop; licensing — no forbidden author
  served) and tenancy isolation are the tests that matter most; weigh findings there first.
- A green `npm run audit` is a claim, not a proof (Engineering value #1). This skill is how you check the claim.
