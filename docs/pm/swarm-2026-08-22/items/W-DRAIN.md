# W-DRAIN — Drain failure-semantics defects (2)

Status: AUDIT-GREEN (847/848; the one red is the documented pre-existing base red owned by
W-BASEFIX — see below) — pending Wave 7 verification
Branch: `swarm/W-DRAIN-drain-failure-semantics` · Worktree: `/tmp/swarm-W-DRAIN`
Commit: `5190014` on base `9dce273ef09dffb03bc547cead0431f48fb71ffe` (origin/main, Wave-0 baseline)
Spec: `docs/pm/orders/2026-08-22-drain-failure-semantics.md` (both defects real at base; no
precondition was false)

## What was done

**Defect 1 — a permanent config error was retried as if transient.** `processOne`'s catch
(`web/src/lib/user-corpus/queue.ts`) parked everything that was not an `UploadRefused` back at
'queued', so `EmbeddingUnavailable('DEEPINFRA_API_KEY is not set')` was retried toward
MAX_ATTEMPTS while reading as "waiting its turn". Fix, per the order's shape (permanent/transient
distinction, NOT "mark EmbeddingUnavailable terminal"): `EmbeddingUnavailable`
(`web/src/lib/user-corpus/embed.ts`) gains a `permanent` flag set only at the missing-key throw
site — a provider 429/5xx keeps `permanent = false`, the line `retryable()` already draws one
layer down — and the catch fails permanent errors immediately, with the reason shown.

**Defect 2 — `drain()` reported work it did not do.** `DrainResult.processed` counted every
outcome. Renamed to `attempted` with a real `completed` count (outcome 'ready' only), per the
order's first suggested shape. All readers of `processed` were tests (both API routes ignore the
return value — verified by grep over `web/src`); every caller swept in the same commit:
`queue-never-drops.test.ts` (→ `attempted`, its assertions are about claims attempted),
`pipeline-to-ready.test.ts` (→ `completed`, the doc reaches ready), `blob-round-trip.test.ts`
(→ `attempted` + the failure-message string now carries both counters; adjacent comments that
described the old catch/counter behavior rewritten to the new behavior, §2.5 comment sweep).

New suite `web/test/user-corpus/drain-failure-semantics.test.ts` (pipeline-to-ready idiom:
`getUserDocument` substituted from memory, everything else real; deletes the key for exactly one
drain, so it needs no DeepInfra key and never spends one).

## Transitions (§2.9)

- **CLAIMED** 2026-08-22 — worktree `/tmp/swarm-W-DRAIN` from base `9dce273`, branch
  `swarm/W-DRAIN-drain-failure-semantics`. Env files silently checked
  (`grep -qE 'odd-fog|CUTOVER_'`): root `.env.local` clean = true, `web/.env.local` clean = true
  (booleans only; both copied). Bootstrap per §2.7 plus `web/node_modules`.
- **RED-PROVEN** 2026-08-22 — both new tests watched RED on the unmodified base against dev
  (`ep-tiny-hat`): defect 1 → `expected 'queued' to be 'failed'`; defect 2 →
  `expected undefined to be 1` (`result.attempted`). Transcript:
  `docs/evidence/swarm-2026-08-22/w-drain/red-initial.txt`.
- **FIXED** 2026-08-22 — green transcript:
  `docs/evidence/swarm-2026-08-22/w-drain/green-after-fix.txt` (2/2). Red-proofs (§2.2), each
  seeded then restored:
  - defect 1: permanent branch deleted from the catch → 1 failed / 1 passed —
    `redproof-defect1-seeded.txt`;
  - defect 2: `completed++` made unconditional (the old `processed++` semantics) → 2 failed —
    `redproof-defect2-seeded.txt`.
  Post-restore green: `green-restored.txt` (2/2). Existing touched suites re-run green:
  `queue-never-drops` + `pipeline-to-ready` 18 passed / 1 skipped (the SKIP LOCK case, same as
  baseline idiom).
- **AUDIT-GREEN** 2026-08-22 — `npm run audit` in the worktree, run twice (second run full log):
  `docs/evidence/swarm-2026-08-22/w-drain/npm-run-audit.log`. 847/848 tests; every leg green
  except ONE failure that is the documented Wave-0 baseline red owned by W-BASEFIX:
  `test/publish-flip-toolchain.test.ts:473` "the SHIPPED CLI refuses at the same gate" — asserts
  `docs/evidence/thayers-source-verification.md` absent, and that file is tracked at base
  (verified: `git ls-files --error-unmatch` exits 0 at this branch's base). Identical failure
  signature to W-VEC429's baseline record (`/tmp/swarm-status-seed/items/W-VEC429.md`); W-BASEFIX's
  repair is VERIFIED and pending Wave 8 merge (`/tmp/swarm-status-seed/items/w-basefix.md`). Not
  bootstrap-transient; a rerun cannot change it, and this branch touches nothing that test
  imports. This is NOT a claim that the audit is green at base — it is green modulo the one
  pre-existing, separately-owned red.

## NOT RUN (declared, §2.8)

- `blob-round-trip.test.ts` — loud-skipped: `BLOB_READ_WRITE_TOKEN` is not present in
  `web/.env.local` (the suite's own announceSkip reports it). My edits there are message/
  assertion lines only; they are covered by the typecheck/lint legs and by the audit's compile.
  Same skip behavior as baseline.

## Notes for the verifier (Wave 7)

- Re-run: `cd web && npx vitest run test/user-corpus/drain-failure-semantics.test.ts`
  (needs dev `DATABASE_URL` from the env files + the gitignored `web/public/bible/kjv` asset;
  makes NO DeepInfra call — the first test deletes the key around one drain).
- Red-proofs to re-execute: (1) delete the `if (e instanceof EmbeddingUnavailable && e.permanent)`
  branch in `queue.ts` → first test RED; (2) change `if (outcome === 'ready') completed++;` to an
  unconditional `completed++;` → both tests RED.
- Diff surface: `git diff 9dce273...HEAD --stat` — `embed.ts`, `queue.ts`, three existing
  user-corpus test files, one new test file, evidence logs. Nothing else.

## Cost of not fixing it (§2.5)

A deployment missing `DEEPINFRA_API_KEY` parks every upload silently — queue depth grows,
`queueStats` reports healthy-looking `queued` documents, and users see "queued" rather than an
error they could act on — while every caller asserting `processed` reads a stalled document as
work done.

## Owner packet

Nothing required. No prod touch, no migration, no config/env/dependency change; prod deploy
carries the code change whenever the owner next deploys.

## R6 (2026-08-22, recovery order)

Status revised to **DONE-UNVERIFIED**: this work is self-certified; Wave 7 independent
verification never ran (provider quota kill). Under §2.3 of the approved order it is NOT done
until a verifier re-executes the red-proofs and the audit.
