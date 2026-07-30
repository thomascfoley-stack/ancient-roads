# PR #44 — file-to-item scope map (58 files, +2029 / −455)

For independent audit: scope verification per Stage 1 item, not per file in isolation.

## 1.1 — Protected-branch registry

| File | Role |
|------|------|
| `docs/PROTECTED_BRANCHES.json` | Registry entry one (`br-late-recipe-atxl68sh`) |
| `scripts/lib/neon-branch-guard.mjs` | Read registry, refuse protected deletes |
| `scripts/lib/neon-branch-guard.d.mts` | Types |
| `test/invariants/neon-branch-guard.test.ts` | Delete refusal unit tests |
| `web/test/invariants/protected-branches-exist.test.ts` | Monitor: registered ids still exist |
| `docs/evidence/work-order-v2-stage1/1.1-protected-branch-refusal.log` | Red-proof evidence |

## 1.2 — db-invariants fail-closed

| File | Role |
|------|------|
| `.github/workflows/audit.yml` | Fail-closed secret steps, REQUIRE_SECRETS, concurrency, trigger dedup |
| `web/test/helpers/loud-skip.ts` | Secret vs artifact skip semantics |
| `web/test/invariants/loud-skip.test.ts` | Red-proof: secret throws, artifact loud-skips |
| `scripts/ci-db-invariants-receipt.mjs` | Refuse zero executed tests under REQUIRE_SECRETS |
| `docs/evidence/work-order-v2-stage1/1.2-db-invariants-fail-closed.log` | Original evidence |
| `docs/evidence/work-order-v2-stage1/1.2-require-secrets-vs-corpus.log` | Corpus vs secret separation |

## 1.3 — Manifest forbidden_provenance restore

| File | Role |
|------|------|
| `ingest/sources.config.json` | Restore `barnes-crosswire-nt` `forbidden_provenance: skip` |
| `docs/evidence/work-order-v2-stage1/1.3-manifest-forbidden-provenance.diff` | Diff evidence |
| `docs/evidence/work-order-v2-stage1/1.3-manifest-provenance-test.log` | Test green evidence |

## 1.4 — Enumerated expect-red audit set

| File | Role |
|------|------|
| `scripts/deps-audit.mjs` | `--expect-red` exact-set match |
| `scripts/audit.sh` | Passes declared GHSA set |
| `package.json` | Audit script + auditConfig note fix |
| `docs/SECURITY.md` | Per-advisory status table |
| `test/deps-audit-expect-red.test.ts` | Both-direction red-proof tests |
| `docs/evidence/work-order-v2-stage1/1.4-*.log` | Watched red/green logs |
| `docs/evidence/work-order-v2-stage1/npm-run-audit.log` | Full audit green |

## 1.5 — Live bait loop (option a)

| File | Role |
|------|------|
| `src/evals/run-bait.mts` | `BAIT_URL` override |
| `web/src/app/api/eval/bait/route.ts` | Prod bearer gate (not NODE_ENV 404) |
| `docs/BAIT_HARNESS.md` | Corrected harness docs |
| `web/test/regression/bait-route-production-gate.test.ts` | Route gate tests |
| `docs/evidence/work-order-v2-stage1/1.5-bait-route-gate.log` | Evidence |

## 1.6 — Compose retry budget

| File | Role |
|------|------|
| `web/src/lib/teacher/teach-budget.ts` | Budget constants |
| `web/src/lib/teacher/teach.ts` | Per-request deadline |
| `web/src/lib/teacher/deepinfra.ts` | Compose timeout alignment |
| `web/src/app/api/ask/route.ts` | maxDuration wiring |
| `web/src/app/api/ask/stream/route.ts` | maxDuration wiring |
| `web/test/teach-budget.test.ts` | Budget invariant tests |
| `docs/evidence/work-order-v2-stage1/1.6-teach-budget-test.log` | Evidence |

## 1.7 — ask_outcome discriminator

| File | Role |
|------|------|
| `web/src/lib/teacher/teach.ts` | attempts, firstCheck, voices, traditions in logs |
| `web/test/ask-outcome-discriminator.test.ts` | 429 vs verifier rejection |
| `web/src/scripts/verify-sos-endtoend.mts` | Minor log field alignment |
| `docs/evidence/work-order-v2-stage1/1.7-ask-outcome-discriminator.log` | Evidence |

## 1.8 — PR #43 G1 + fail-closed USER_TABLE_SPEC

| File | Role |
|------|------|
| `scripts/lib/user-data-invariant.mjs` | USER_TABLE_SPEC, all user-scoped tables |
| `scripts/lib/user-data-invariant.d.mts` | Types |
| `scripts/g1-digest-redproof.mjs` | Digest (not count) red-proof harness |
| `scripts/check-test-residue.mjs` | Derives USER_TABLES from USER_TABLE_SPEC |
| `test/invariants/user-data-invariant.test.ts` | Schema enumeration completeness test |
| `docs/CUTOVER_DESIGN.md` | Live user-data inventory (waitlist, channels deliberate) |
| `docs/STATE_OF_TRUTH.md` | Inventory correction |
| `docs/evidence/work-order-v2-stage1/1.8-user-table-spec-completeness.log` | Evidence |

## 1.9 — CI concurrency + seed cleanup

| File | Role |
|------|------|
| `.github/workflows/audit.yml` | `db-invariants-${{ github.repository }}`, cancel-in-progress: false, trigger dedup |
| `web/test/invariants/sections-unit-ordinal.test.ts` | Per-run slug + age-scoped prefix sweep |

## 1.10 — ADR-039 retirement

| File | Role |
|------|------|
| `docs/DECISIONS.md` | ADR-039 correction block |
| `scripts/repair-barnes-prod.mjs` | **DELETED** |
| `scripts/b0-seed.mjs` | **DELETED** |
| `docs/evidence/work-order-v2-stage1/1.10-grep-repair-barnes.log` | grep evidence |

## Audit env allow-list (PR #43 / 1.8 bundle)

| File | Role |
|------|------|
| `scripts/lib/target-guard.mjs` | `isAuditAllowedHost`, DEV_ENDPOINTS |
| `scripts/lib/target-guard.d.mts` | Types |
| `scripts/assert-ingest-env-dev.mjs` | Allow-list first gate |
| `scripts/audit.sh` | Fail-fast env gate |
| `test/invariants/target-guard.test.ts` | Allow-list tests |

## Incidental / hygiene (not primary item owners)

| File | Role |
|------|------|
| `web/test/invariants/verse-keys.test.ts` | `kind: 'artifact'` on corpus requirement (1.2) |
| `web/test/invariants/coverage-floor.test.ts` | Test count adjustment |
| `web/test/invariants/wallet.test.ts` | Minor test cleanup |
| `docs/evidence/work-order-v2-stage1/README.md` | Evidence index |
| `docs/evidence/work-order-v2-stage1/independent-audit-report.md` | Prior audit (superseded by Claude Code audit) |
