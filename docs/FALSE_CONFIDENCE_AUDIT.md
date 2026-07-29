# False-Confidence Audit — run 2026-07-12 (overnight §4)

Applied the [`false-confidence-audit`](../.claude/skills/false-confidence-audit/SKILL.md) skill across the
whole suite (26 test files, root `test/**` + `web/test/**`). Goal: find tests that pass without proving
anything — the ones that keep `npm run audit` green while the guarantee they name is unenforced. Every fix
below was verified with a **seed-the-bug proof** (break the code → watch the test go red → revert → watch it
go green), so the strengthened test is known to track the code, not merely to pass.

## Summary

| # | File | Smell | Severity | Status |
|---|---|---|---|---|
| F1 | `web/test/invariants/{licensing,tenancy}.test.ts` | skipIf-in-CI: the two behavioral existential invariants never run in the gate | **HIGH** | **PARKED — owner infra decision** |
| F2 | `web/test/regression/get-messages-filters-by-user-id.test.ts` | structure-not-behavior (`sql.toMatch(/user_id/)` passes on a decoy) | MED | **FIXED + proven** |
| F3 | `web/test/invariants/wallet.test.ts` | structure-not-behavior (`includes('requireUser')` = presence, not call/order) | MED | **FIXED + proven** |
| F4 | `test/evals.test.ts` | weak assertion (`toBeTruthy()` on a failure-reason string) | LOW | **FIXED** |
| F5 | `web/test/regression/add-message-rejects-foreign-channel.test.ts` (test 2) | structure-only source-grep, redundant with the behavioral test 1 | LOW | Noted — can fail; left as belt-and-suspenders |

Prior offender named by the owner — `licensing.test.ts` asserting `expect(baseline).toBe(263496)` (a constant
against itself) — was **already fixed** before this run by the QA-harness session; it is now an honest
`ctx.skip()` with a banner explaining the static ratchet is enforced at deploy time, not in CI. Verified, no
action needed. That fix is what led to F1: the *behavioral* half of the same file is silenced the same way.

---

## F1 (HIGH) — the two existential behavioral invariants never execute in CI. PARKED.

**Finding.** `web/test/invariants/licensing.test.ts` ("Tyndale Study Notes is never returned from any served
path") and `web/test/invariants/tenancy.test.ts` (two-account: user B cannot read/write user A's data) are
both wrapped in `describe.skipIf(!dbUrl)`. `dbUrl` comes from `APP_DATABASE_URL`/`DATABASE_URL` or
`web/.env.local`. **CI (`.github/workflows/audit.yml`) runs `pnpm run audit` with no database configured**, so
both suites **skip entirely** and the gate reports green having executed *zero* of their assertions.

These are the two best behavioral tests in the repo — genuine outcome assertions of the licensing and tenancy
guarantees — and they are dark in the one place that gates every push. The deploy-time gate
(`scripts/predeploy-gate.ts`) enforces only the **static** forbidden-provenance ratchet, **not** these DB
invariants. Net: the licensing "never serve a forbidden author" guarantee and the tenancy isolation guarantee
run **nowhere automatically** — only if a human runs `npm run qa` locally with a `.env.local` DB.

This is textbook skipIf-in-CI false confidence: `npm run audit` prints `qa — Layer 1 invariants ✓` while the
invariants that matter most ran not at all. It is *not* a broken test — the tests are correct; the environment
that would let them run is absent from the gate.

**Why parked, not fixed tonight.** The honest fixes are an infra/policy decision that is the owner's to make,
and the wrong ones are worse than the gap:
- **(A) Provide a DB in CI** — a Neon test branch + an `APP_DATABASE_URL` GitHub secret wired into
  `audit.yml`. This is the real fix; it needs owner-held secrets and a throwaway branch. *Recommended.*
- **(B) Enforce the behavioral licensing invariant at the deploy gate**, where a real DB is present (deploy
  runs from the operator machine with `.env.local`). Extend `predeploy-gate.ts` to query the legal base pool
  and fail the deploy if any `MUST_NOT_SERVE` author is served-eligible. This is a real slice (module-graph /
  `server-only` import care; must warn-not-block if the DB is unreachable so it can't wedge a deploy) — a
  design-before-code item, not a 4am change.
- **(C) Make the skip loud** — a banner naming exactly which guarantee is unenforced, so nobody reads the
  green as coverage. Cheapest, weakest; does not actually run the check.

I did **not** unilaterally turn CI red overnight (that would block the owner's pushes without warning), and I
did **not** fake a pass. Recommend **(A)**, with **(B)** as defense-in-depth. Owner decision recorded in
`WORKORDER_OVERNIGHT.md` §7.

---

## F2 (MED) — H1 regression proved a string, not a filter. FIXED + proven.

`get-messages-filters-by-user-id.test.ts` asserted only `captured[0].sql.toMatch(/user_id/)`. That passes on
the decoy `WHERE user_id IS NOT NULL AND channel_id = $1` — the caller filter deleted, any authenticated user
reading any channel — because the string `user_id` is still present.

**Fix.** The mock now captures bound parameter **values**; the test asserts the CALLER's id (`user-abc`) is the
value bound to the `user_id = $N` predicate (helper `boundValueFor`), for both the channel and chat read paths.
This is a behavioral assertion at the mock layer — no DB needed.

**Seed-the-bug proof.** Correct code → green. Seeded `WHERE user_id IS NOT NULL` in `chat.ts` → the new test
went **red** (`expected undefined to be 'user-abc'`); the old `/user_id/` regex would have stayed green.
Reverted → green. `git diff` on `chat.ts` clean.

---

## F3 (MED) — wallet invariant checked presence, not the call or its order. FIXED + proven.

`wallet.test.ts` asserted `src.includes('requireUser')` / `src.includes('checkAskRateLimit')`. The string
matches the **import line**, so the test passes even if the call is deleted, or is placed **after** `teach()` —
i.e. after the money is spent — which is exactly what the test's name ("gated before teach()") promises to
prevent.

**Fix.** New `callIndex()` matches the CALL site (`name(`, which the import lacks) and the test asserts each
gate is (a) actually called and (b) called **before** the first `teach(` call. A `codeOnly()` pass strips
comments first — without it, the comment `// verifier runs inside teach()` in `ask/stream/route.ts` registered
as a `teach()` call and produced a false ordering failure (that false positive surfaced during the proof and
is itself an instance of source-grep fragility; the comment-strip closes it).

**Seed-the-bug proof.** Correct code → green. Replaced `await requireUser()` with a stub (import kept, call
removed) → new test went **red** (`never CALLS requireUser()`); confirmed `src.includes('requireUser')` still
returned 1 hit, i.e. the old assertion would have passed the decoy. Reverted → green. `git diff` on
`ask/route.ts` clean.

---

## F4 (LOW) — eval-check assertions were `toBeTruthy()` on a failure string. FIXED.

`test/evals.test.ts` used `toBeTruthy()` on `runExpectation(...)`, which returns `"<check>: <reason>"` on
failure or `null` on pass. `toBeTruthy()` also passes if the *wrong* check fired. Tightened to
`toContain('no_verdict')` / `'no_prescription'` / `'voices_min'` / `'traditions_min'` so each assertion pins
the specific check. Pass side (`toBeNull()`) already precise. Green after change.

## F5 (LOW) — noted, not changed.

`add-message-rejects-foreign-channel.test.ts` test 2 greps `chat.ts` for the `INSERT…WHERE EXISTS` pattern —
structure-only. Its sibling test 1 is genuinely behavioral (asserts `addMessage` throws when the INSERT
returns 0 rows). Test 2 *can* fail (rewrite the query and it goes red), so it is not false confidence, just
low-value; left as a cheap tripwire. The true cross-tenant-write proof is `tenancy.test.ts` — see F1.
