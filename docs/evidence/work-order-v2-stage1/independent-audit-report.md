# Work Order v2 — Stage 1 Independent Audit Report

**Auditor:** Independent subagent (wrote none of Stage 1 code)  
**Branch:** `chore/work-order-v2-stage1`  
**Commit:** `4c81bbba3975c3f6416953bb2ff27b1c57b1c92d`  
**Date:** 2026-07-29 (local re-execution)  
**Method:** Re-executed all nine red-proofs from `docs/evidence/work-order-v2-stage1/README.md`; compared live output to committed evidence logs.

---

## Summary

| Item | Property | Result |
|------|----------|--------|
| 1.1 | Protected branch delete refused | **VERIFIED** |
| 1.2 | db-invariants fail-closed | **VERIFIED** (local); CI fail-closed **confirmed** (see note) |
| 1.3 | Manifest forbidden_provenance restored | **VERIFIED** |
| 1.4 | Enumerated expect-red both directions | **VERIFIED** |
| 1.5 | Bait route 401 / prod bearer gate | **VERIFIED** |
| 1.6 | Compose budget ≤ maxDuration | **VERIFIED** |
| 1.7 | ask_outcome discriminator | **VERIFIED** |
| 1.8 | USER_TABLE_SPEC completeness | **VERIFIED** |
| 1.10 | ADR-039 retired, scripts deleted | **VERIFIED** |
| — | `npm run audit` (enumerated-red green) | **PASS** |

---

## 1.1 — Protected branch delete refused

**Command:**
```bash
node --input-type=module -e "
import { refuseProtectedBranchDelete, refuseProtectedBranchPattern } from './scripts/lib/neon-branch-guard.mjs';
..."
npx vitest run test/invariants/neon-branch-guard.test.ts
```

**Key output (matches `1.1-protected-branch-refusal.log`):**
```
RED protected id: REFUSING branch delete: Neon branch br-late-recipe-atxl68sh is PROTECTED (docs/PROTECTED_BRANCHES.json)...
RED protected pattern: REFUSING branch delete: name pre-cutover-ep-odd-fog-atnykudm-20260729164220 matches the protected pre-cutover prod snapshot pattern...
GREEN disposable id: no throw
✓ test/invariants/neon-branch-guard.test.ts (4 tests)
```

**Result:** **VERIFIED**

---

## 1.2 — db-invariants fail-closed when secrets expected

**Local commands:**
```bash
REQUIRE_SECRETS=1 node --input-type=module -e "import { announceSkip } from './web/test/helpers/loud-skip.ts'; ..."
REQUIRE_SECRETS=1 node scripts/ci-db-invariants-receipt.mjs /tmp/vitest-empty.json
gh run list --branch chore/work-order-v2-stage1
gh run view 30519657750 --log-failed
```

**Key output:**
```
REQUIRE_SECRETS throw: REQUIRE_SECRETS: test-check DID NOT RUN — missing FAKE_SECRET...
db-invariants receipt: executed=0 passed=0 failed=0 skipped=0
REFUSING green: zero tests executed in db-invariants with REQUIRE_SECRETS=1
```

**CI (run `30519657750` @ `4c81bbb`):**
| Job | Conclusion |
|-----|------------|
| `audit` | **success** — `pnpm run audit` green |
| `db-invariants` | **failure** — `verse-keys.test.ts` threw `REQUIRE_SECRETS` because `web/public/commentaries` (gitignored corpus) is absent in CI |

Fail-closed guard steps **passed** (`require APP_DATABASE_URL_TEST`, `require DEEPINFRA_API_KEY`, seed-owner resolution). The job ran 188 tests then **failed closed** on `verse-keys` rather than skip-green — consistent with `web/test/helpers/loud-skip.ts` and `.github/workflows/audit.yml` Stage 1.2 intent.

**Compared to evidence:** Workflow excerpt in `1.2-db-invariants-fail-closed.log` matches live `audit.yml` (`REQUIRE_SECRETS: '1'`, fail-closed secret guards).

**Result:** **VERIFIED** (fail-closed mechanism works locally and in CI). **Note:** Latest CI `db-invariants` is **RED** at STOP — not skip-green; owner must supply corpus in CI or adjust `verse-keys` / `REQUIRE_CORPUS` policy before expecting a green db-invariants job.

---

## 1.3 — Manifest forbidden_provenance restored

**Commands:**
```bash
npx vitest run test/invariants/manifest-provenance.test.ts
git diff 8342e0f^ 8342e0f -- ingest/sources.config.json
git show 2ebbfc5^:ingest/sources.config.json  # reason string compare
```

**Key output:**
```
✓ test/invariants/manifest-provenance.test.ts (3 tests)
```

Live diff `8342e0f^..8342e0f` **byte-matches** committed `1.3-manifest-forbidden-provenance.diff`.  
`barnes-crosswire-nt` `forbidden_provenance_reason` in current HEAD **equals** `git show 2ebbfc5^:ingest/sources.config.json` (438-char measured string).

**Result:** **VERIFIED**

---

## 1.4 — Enumerated expect-red both directions

**Commands:**
```bash
npx vitest run test/deps-audit-expect-red.test.ts
node scripts/deps-audit.mjs --expect-red GHSA-qq9h-g4jm-xgf3
node scripts/deps-audit.mjs --expect-red GHSA-nonexistent-only          # extra red
node scripts/deps-audit.mjs --expect-red GHSA-qq9h-g4jm-xgf3,GHSA-extra-bbbb-cccc  # missing red
```

**Key output (matches evidence logs):**
```
RED extra advisory: GHSA-extra-bbbb-cccc        # unit-test logic replay
RED missing from observed: GHSA-qq9h-g4jm-xgf3  # unit-test logic replay
✓ deps-audit: observed red set matches --expect-red exactly (1 GHSA(s): GHSA-qq9h-g4jm-xgf3).
✗ deps-audit: observed red set has EXTRA advisory(ies)... GHSA-qq9h-g4jm-xgf3
✗ deps-audit: declared --expect-red id(s) no longer observed... GHSA-extra-bbbb-cccc
✓ test/deps-audit-expect-red.test.ts (3 tests)
```

**Result:** **VERIFIED**

---

## 1.5 — Bait route gate

**Command:**
```bash
cd web && npx vitest run test/regression/bait-route-production-gate.test.ts
```

**Key output (matches `1.5-bait-route-gate.log`):**
```
✓ test/regression/bait-route-production-gate.test.ts (5 tests)
```

**Result:** **VERIFIED**

---

## 1.6 — Teach budget

**Command:**
```bash
cd web && npx vitest run test/teach-budget.test.ts
```

**Key output:**
```
✓ test/teach-budget.test.ts (2 tests)
```

**Result:** **VERIFIED**

---

## 1.7 — ask_outcome discriminator

**Command:**
```bash
cd web && npx vitest run test/ask-outcome-discriminator.test.ts
```

**Key output:**
```
✓ test/ask-outcome-discriminator.test.ts (1 test)
```

**Result:** **VERIFIED**

---

## 1.8 — USER_TABLE_SPEC completeness

**Commands:**
```bash
npx vitest run test/invariants/user-data-invariant.test.ts          # green
# temporarily removed `bookmarks` from USER_TABLE_SPEC, re-ran, restored via git checkout
npx vitest run test/invariants/user-data-invariant.test.ts          # red then green
```

**Key output:**
```
✓ test/invariants/user-data-invariant.test.ts (6 tests)   # baseline green
× every schema table is in USER_TABLE_SPEC... bookmarks   # after removal
✓ test/invariants/user-data-invariant.test.ts (6 tests)   # after restore
```

**Result:** **VERIFIED**

---

## 1.10 — ADR-039 retired, scripts deleted

**Command:**
```bash
grep -rn repair-barnes-prod
test -f scripts/repair-barnes-prod.mjs
grep -rn repair-barnes-prod --include='*.ts' --include='*.mjs' --include='*.js'
```

**Key output:**
- `scripts/repair-barnes-prod.mjs` **absent**
- Hits only in `docs/DECISIONS.md`, `docs/OWNER_DECISIONS_2026-07-29.md`, `WORKLOG.md`, and evidence logs (matches `1.10-grep-repair-barnes.log`)
- **No** `.ts`/`.mjs`/`.js` code references

**Result:** **VERIFIED**

---

## Full audit

**Command:**
```bash
env -u DATABASE_URL -u APP_DATABASE_URL -u DATABASE_URL_UNPOOLED npm run audit
```

**Key output (matches `npm-run-audit.log`):**
```
✓ deps-audit: observed red set matches --expect-red exactly (1 GHSA(s): GHSA-qq9h-g4jm-xgf3).
AUDIT PASSED — all gates green
exit=0
```

**Result:** **PASS**

---

## Verdict

**STAGE 1 INDEPENDENT AUDIT: PASS**

All nine red-proofs re-executed successfully on `4c81bbb`. Local `npm run audit` passes with enumerated-red green on `GHSA-qq9h-g4jm-xgf3`. Committed evidence logs match live output where applicable.

**Stage 2 may open: CONDITIONAL**

Red-proof properties hold. Blocker for a fully green CI gate at STOP:

- **`db-invariants` job RED** on run `30519657750` — `verse-keys.test.ts` correctly throws under `REQUIRE_SECRETS=1` when the gitignored static corpus is absent in GitHub Actions. Fail-closed is working (not skip-green), but the workflow will not go green until the owner resolves corpus availability in CI or adjusts the `verse-keys` / `REQUIRE_CORPUS` policy.

Recommend owner sign-off on that CI state before Stage 2 work proceeds on a merge-ready branch.
