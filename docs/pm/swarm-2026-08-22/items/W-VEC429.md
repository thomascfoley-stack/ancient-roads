# W-VEC429 — `section-vector-pairing` provider-429 nondeterminism

Status: AUDIT-GREEN (see note on the one pre-existing base red) — pending Wave 7 verification
Branch: `swarm/W-VEC429-provider-429-retry` · Worktree: `/tmp/swarm-W-VEC429`
Base: `9dce273ef09dffb03bc547cead0431f48fb71ffe` (origin/main, Wave-0 baseline)
Commit: `f352512` (single commit; explicit pathspecs; `Model: kimi-code/k3` trailer;
pre-commit eslint + licensing ratchet + credential guard all passed). No push, no merge.

## Finding: the defect was already fixed at base; the brief's jitter requirement was not

The core fix the brief describes — bounded retry on 429/5xx, else an explicit loud NOT RUN —
already exists at base, landed 2026-08-01 in `f462114` ("T4: a provider outage is NOT RUN,
never a failure and never a pass"):

- `web/test/helpers/provider-availability.ts` — `probeProvider` (bounded retry, ≤3 attempts,
  exponential backoff) + `isProviderUnavailable` (429/5xx/network = unavailable; 400/401/403/404
  = genuine failure, stays RED).
- `web/test/invariants/section-vector-pairing.test.ts:166-171` — probe wired in; persistent
  outage goes through `announceSkip` with `kind: 'provider'` + `ctx.skip()` (never a pass,
  never a red), the same taxonomy as a missing secret/artifact.
- `web/test/invariants/provider-availability.test.ts` — the brief's three red-proofs already
  committed at base: (a) "RETRIES a transient 429 and then succeeds" (attempt count asserted,
  calls=3); (b) "reports NOT RUN (present=false) when 429 persists — never a failure";
  (c) "RE-THROWS a genuine failure immediately — no retry, no skip" plus the classifier legs
  covering 400/401/403/404. Baseline run: 8/8 green
  (`docs/evidence/swarm-2026-08-22/w-vec429/baseline-provider-availability.log`).

What the brief's procedure lists that base did NOT have: **jitter**. `probeProvider` slept the
raw exponential schedule (`baseDelayMs * 2**(i-1)`), so every concurrent retrier re-collides on
the same tick — the thundering herd a 429 already is. This item therefore completed the
procedure's remaining requirement instead of forcing redundant work (§2.6).

## Transitions

- **CLAIMED** 2026-08-22 — worktree `/tmp/swarm-W-VEC429` from base `9dce273`, branch
  `swarm/W-VEC429-provider-429-retry`; both env files silently checked
  (`grep -qE 'odd-fog|CUTOVER_'`): root `.env.local` clean, `web/.env.local` clean (booleans
  only). Bootstrap per §2.7 plus `web/node_modules`.
- **RED-PROVEN** 2026-08-22 — two jitter tests written first and watched RED on the
  un-jittered base code: injected jitter factor 0.75 → expected sleeps [75, 150], got
  [100, 200]; default-jitter bounds leg → `expected 100 to be less than 100`. Transcript:
  `docs/evidence/swarm-2026-08-22/w-vec429/red-jitter-absent.log`. This log is also the
  red-proof of the new checks (§2.2): they fail exactly when the jitter scaling is absent.
- **FIXED** 2026-08-22 — `web/test/helpers/provider-availability.ts`: backoff now
  `baseDelayMs * 2**(i-1) * jitter()` with default `jitter = () => 0.5 + Math.random() * 0.5`
  (factor in [0.5, 1), injectable for tests). Two lines of implementation plus a comment.
  No new exports, no new config/env, no new dependencies. Green transcript:
  `docs/evidence/swarm-2026-08-22/w-vec429/green-jitter.log` (10/10).
- **AUDIT-GREEN** 2026-08-22 — `npm run audit` in the worktree: 847/848 tests green, every
  leg green except ONE failure that is the documented Wave-0 baseline red owned by W-BASEFIX:
  `test/publish-flip-toolchain.test.ts:473` "the SHIPPED CLI refuses at the same gate"
  (asserts `docs/evidence/thayers-source-verification.md` absent; the file is legitimately
  tracked at base since `abe5252`). Identical failure signature to the W-PRE baseline record;
  W-BASEFIX's repair is VERIFIED and pending Wave 8 merge (see
  `/tmp/swarm-status-seed/items/w-basefix.md`). The failing test does not import anything this
  branch touches (grep evidence below). Logs:
  `docs/evidence/swarm-2026-08-22/w-vec429/npm-run-audit.log` (run 1) and
  `npm-run-audit-rerun.log` (run 2, same single failure — stable, not flake).

## Live run against the real API (done-when leg)

`docs/evidence/swarm-2026-08-22/w-vec429/live-section-vector-pairing.log` —
`npx vitest run test/invariants/section-vector-pairing.test.ts` against the dev DB
(`ep-tiny-hat`, read-only) and the live DeepInfra API: PASSED, 98/129 published works probed
(31 NOT COVERED, all "no section of sampleable length", zero vectorless), 41s.

## Doc falsehood fixed in place (§2.9)

`docs/pm/MASTER.md` watchlist (the unearned-RED entry) said "Not fixed here" — false since
`f462114` (2026-08-01). Rewritten to record the closure: bounded retry ≤3 attempts with
exponential backoff + jitter, persistent outage = loud NOT RUN (`kind: 'provider'`,
`ctx.skip()`), genuine failure stays RED.

## Red-proof index (§2.2)

- (a) transient 429 ×2 then success, attempt count asserted — at base,
  `provider-availability.test.ts` "RETRIES a transient 429…" (green in baseline log).
- (b) persistent 429 → NOT RUN, not FAIL — at base, "reports NOT RUN (present=false)…".
- (c) 400-class → immediate FAIL, no retry — at base, "RE-THROWS a genuine failure
  immediately" + classifier legs for 400/401/403/404.
- jitter — this branch: `red-jitter-absent.log` (RED on un-jittered code) →
  `green-jitter.log` (GREEN after).

## Cost of not fixing it (§2.5)

Without jitter, concurrent CI reruns of a 429'd provider retry on identical schedules and
re-collide — the skip path fires far more often than necessary, and a check that skips often
is a check nobody reads (the loud-skip ceiling's whole concern, per the helper's own header).

## Notes for the verifier (Wave 7)

- Re-run: `cd web && npx vitest run test/invariants/provider-availability.test.ts` (10/10),
  then the live leg `npx vitest run test/invariants/section-vector-pairing.test.ts` (needs dev
  `DATABASE_URL` + `DEEPINFRA_API_KEY` from the env files; ~41s, read-only).
- Red-proof the jitter tests by reverting the one-line change in
  `web/test/helpers/provider-availability.ts` (drop `* jitter()`) and watching both jitter
  tests fail.
- The one audit red is W-BASEFIX's, not this branch's: `git diff 9dce273...HEAD --stat`
  touches only `web/test/helpers/provider-availability.ts`,
  `web/test/invariants/provider-availability.test.ts`, `docs/pm/MASTER.md`, and
  `docs/evidence/swarm-2026-08-22/w-vec429/`; `test/publish-flip-toolchain.test.ts` imports
  none of them.

## R6 (2026-08-22, recovery order)

Status revised to **DONE-UNVERIFIED**: this work is self-certified; Wave 7 independent
verification never ran (provider quota kill). Under §2.3 of the approved order it is NOT done
until a verifier re-executes the red-proofs and the audit.
