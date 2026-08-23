# W-BASEFIX — repair the stale thayers evidence-gate guard (baseline audit red)

Status: VERIFIED (Wave-7 independent verification 2026-08-22 → pending Wave 8 merge)
Branch: `swarm/w-basefix-thayers-guard` · Worktree: `/tmp/swarm-basefix`
Base: `9dce273ef09dffb03bc547cead0431f48fb71ffe` (origin/main, Wave-0 baseline)

## Transitions

- **CLAIMED** 2026-08-22 — launched against the W-PRE HALT: baseline `npm run audit`
  red on exactly one persistent failure, `test/publish-flip-toolchain.test.ts:473`
  ("the SHIPPED CLI refuses at the same gate"), which asserted
  `docs/evidence/thayers-source-verification.md` does NOT exist. That evidence file was
  legitimately committed in `abe5252` (Thayer's prod/dev verified byte-identical,
  sha256 e10b468b…; WORKLOG 2026-08-22 entry 1). Last green CI (32562471249 @ 2012e03)
  predates it. Same "fixture moves" class as MASTER.md Lane D1's three prior moves.
- **RED-PROVEN** 2026-08-22 — reproduced in the worktree before any change:
  `× thayers evidence gate > the SHIPPED CLI refuses at the same gate` —
  `AssertionError: expected true to be false` at :473; 38/39 pass, exactly the one
  baseline failure. Transcript committed at
  `docs/evidence/swarm-2026-08-22/w-basefix/red-transcript.txt`.
- **FIXED** 2026-08-22 — honest repair (see below), one test leg rewritten in
  `test/publish-flip-toolchain.test.ts`. No production code touched; the gate and the
  CLI are byte-identical to base.
- **AUDIT-GREEN** 2026-08-22 — full test file 39/39 green
  (`green-after-repair.txt`); full `npm run audit` green in the worktree
  (`audit-full.txt`, tail copied into the evidence dir).
- **VERIFIED** 2026-08-22 — independent Wave-7 verifier (fresh context, own worktree
  `/tmp/swarm-verify-basefix` @ 4b4a190, own transcripts at
  `/tmp/swarm-status-seed/verdicts/w-basefix-evidence/`): re-executed both red-proof
  legs (CLI refuses exit 2 with evidence absent; repaired test RED under the same
  seed, 39/39 green restored), full `npm run audit` green first run, honesty review
  confirmed the gate/CLI byte-identical to base and both directions genuinely
  asserted, forbidden-action sweep clean. Verdict:
  `/tmp/swarm-status-seed/verdicts/w-basefix.md` — VERIFIED, no blocking findings.

## What the honest repair was, and why

The guard's property is: **the flip toolchain refuses to publish thayers-lexicon without
committed source-verification evidence** (owner ruling 2026-08-21). That property is
still valid and still enforced — `scripts/lib/publish-flip-guard.mjs`
(`thayersEvidenceError`) and its wiring in `scripts/publish-flip.mjs:185-193` are
untouched.

What was stale was only the subprocess leg's *precondition*: it assumed the repo lacks
the evidence file. Thayer's is now verified on both databases (prod/dev byte-identical,
5,507/5,507 Greek headwords, sha256 e10b468b…), so the committed truth is that the CLI
**passes** the gate.

Re-pointing at a different unverified work was examined and rejected as dishonest: the
gate is thayers-specific by the owner ruling — `thayersEvidenceError` returns null for
every other slug and no other work has a verification gate (checked
`flip-reference-works.json` and the CLI's gate logic). A re-pointed leg would test
nothing.

The repair makes the leg hermetic: it **creates** each condition instead of assuming
repo state, and asserts both directions through the shipped CLI:

1. evidence present (the committed truth) → CLI passes the gate and dies later, on the
   missing connection string, never on the verification refusal;
2. evidence moved aside (atomic rename, restored in `finally`) → the same CLI refuses
   at the gate, exit 2, before any connection.

## Red-proof of the repaired check (§2.2)

`docs/evidence/swarm-2026-08-22/w-basefix/redproof-seeded.txt` — evidence file seeded
absent, then:

- Part 1: the shipped CLI refuses: `STOP: thayers-lexicon may not be published without
  source verification`, exit 2.
- Part 2: the repaired test goes RED under the same seed (leg 1 correctly detects the
  refusal where it expects passage), then the seed was restored and the file is green.

## Cost of not fixing it (§2.5)

Baseline audit stays red on a stale precondition, every swarm workstream's green claim
is unearned, and CI never re-covers origin/main.

## Notes for the verifier (Wave 7)

- Re-run: `npx vitest run test/publish-flip-toolchain.test.ts` in the worktree, then the
  seeded red-proof (move `docs/evidence/thayers-source-verification.md` aside, run the
  CLI with a thayers slugs file, expect exit 2 + the STOP message; restore).
- The env files were silently checked before copying (`grep -qE 'odd-fog|CUTOVER_'`):
  root `.env.local` clean, `web/.env.local` clean. No values printed anywhere.
- One bootstrap note: the first full audit run failed the three typecheck legs
  (`web/` and `web/test` — "Cannot find module 'react'": `web/node_modules` is not
  part of the §2.7 bootstrap and was still unsettled). This is the transient W-PRE
  recorded; per the brief it was rerun once — fully green
  (`audit-run1-transient-typecheck.txt` vs `audit-run2-green.txt`).
