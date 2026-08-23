# VERDICT: W-BASEFIX — **VERIFIED**

Verifier: independent (Wave 7), fresh context; did not write any of this work.
Verified: 2026-08-22T17:30Z · branch `swarm/w-basefix-thayers-guard` @ `4b4a1902669b8561cd06a3a549956c00047580f1` (base `9dce273`)
Worktree: `/tmp/swarm-verify-basefix` (fresh, detached at the claimed commit, bootstrapped per §2.7: five asset dirs + root node_modules via `cp -c`, both env files silently checked clean — `grep -qE 'odd-fog|CUTOVER_'` false for root and web — then copied, never printed). `web/node_modules` was absent in the fresh checkout (the fixer's recorded bootstrap transient); I clone-copied it up front, so no transient rerun was needed.
Own transcripts: `/tmp/swarm-status-seed/verdicts/w-basefix-evidence/` (partA-cli-refusal.txt, partB-test-red.txt, partC-test-green.txt, audit-verifier.txt). None of the fixer's transcripts were reused.

## 1. Red-proof re-executed (my own run, §2.2)

- **Part A — shipped CLI refuses with evidence absent:** moved `docs/evidence/thayers-source-verification.md` aside, ran `node scripts/publish-flip.mjs --slugs=<thayers-only manifest>` with `CUTOVER_DATABASE_URL` unset. Exit **2**, output `STOP: thayers-lexicon may not be published without source verification. … The file does not exist.` File restored; tree clean.
- **Part B — repaired test goes RED under the same seed:** `npx vitest run test/publish-flip-toolchain.test.ts` with the evidence seeded absent → exit 1, exactly one failure: leg 1 (`AssertionError: expected … not to match /may not be published without source v…/`) — the check correctly detects a refusal where the committed truth says passage. 38/39 pass.
- **Restored → green:** same command, 39/39 pass.

## 2. Audit (§2.8)

`npm run audit` in the verifier worktree, first run, exit 0: **AUDIT PASSED — all gates green**. 70/70 test files, 848 tests (incl. `test/publish-flip-toolchain.test.ts` 39 tests); qa layer 252 passed / 20 skipped; env allow-list, all four typecheck legs, lint, knip, deps ratchet, deploy.sh gate harness, Gate B license all green. No bootstrap-transient leg needed a rerun (web/node_modules pre-settled). The two `FAIL: shell DATABASE_URL…` lines in the transcript are stdout of the allow-list suite's own red-proof fixtures inside passing suites, not gate failures.

## 3. Honesty review of the repair

Not a weakening. Findings from my own reading of base vs branch:

- `git diff 9dce273 4b4a190 -- scripts/` is **empty** — `scripts/lib/publish-flip-guard.mjs` and `scripts/publish-flip.mjs` are byte-identical to base. The thayers-specific gate (owner ruling 2026-08-21) is still enforced by the shipped toolchain: `thayersEvidenceError` (guard lib:171-184) fires only for `thayers-lexicon`, forward direction, evidence missing or sha256-less; wired at `publish-flip.mjs:188-193` to `die(err, 2)` before any connection.
- The change is confined to one test leg in `test/publish-flip-toolchain.test.ts` (+10281/-12, of which all but 54 lines are evidence transcripts). The stale precondition (`expect(evidence).toBe(false)`) is replaced by a hermetic both-directions leg through the shipped CLI: (1) evidence present → exit 2 on `no connection string`, explicitly NOT the verification refusal; (2) evidence renamed aside → exit 2 WITH the refusal; restore in `finally`.
- Both directions genuinely discriminate: Part B proved direction 1 fails when the gate refuses wrongly; direction 2 fails if the gate stops refusing (the CLI would die on the missing connection string and the refusal regex would not match). Exit code alone is insufficient to distinguish — the test correctly distinguishes on message content, which I confirmed maps to the two distinct `die(…, 2)` sites (`publish-flip.mjs:192` vs `:206`).
- The re-pointing rejection rationale checks out: `thayersEvidenceError` returns null for every other slug, so a leg re-pointed at another work would assert nothing.

## 4. Forbidden-action sweep (§1.1)

- Single commit `4b4a190` on top of base, reachable only from `swarm/w-basefix-thayers-guard`; no primary-tree commits. `Model: kimi-code/k3` trailer present.
- Does not touch the staged deletion `scripts/ci-fetch-bible-kjv.mjs`.
- No deploy receipts: all 22 `deploy.sh`/`vercel` matches in the commit are the audit's own gate-harness transcript lines (mocked `vercel@` stub), not real invocations.
- No prod touches / secrets: all 12 `odd-fog`/`CUTOVER_`/password matches are test-output transcripts — `.invalid` fault-injection hostnames and `password authentication failed` fixtures (no connection established), the same repo behavior W-PRE recorded at baseline. No credential values anywhere in the diff.

## Findings

None blocking. One observation (not a defect): if the test is hard-killed mid-run the evidence file sits at `…​.gate-test-aside`; the test comment says so and the restore is in `finally` — acceptable, matches the fixer's disclosure.

**VERIFIED — eligible for Wave 8 merge.**
