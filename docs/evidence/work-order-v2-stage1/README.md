# Work Order v2 Stage 1 — evidence index (revised after independent audit)

**Clone path + sha required on every log.** Logs without both are invalid receipts.

## Red-proofs (seed → red → revert → green, or fail-closed both directions)

| Item | Status | Evidence |
|------|--------|----------|
| 1.1 | RED-PROOF | `1.1-protected-branch-refusal.log` |
| 1.2 | RED-PROOF | `1.2-db-invariants-fail-closed.log`, `1.2-require-secrets-vs-corpus.log` |
| 1.3 | RED-PROOF | `1.3-manifest-forbidden-provenance.diff`, `1.3-manifest-provenance-test.log` |
| 1.4 | RED-PROOF (fixed B-2) | `1.4-expect-red-seed-redproof.log`, `test/deps-audit-expect-red.test.ts` |
| 1.5 | RED-PROOF | `1.5-bait-route-gate.log` |
| 1.6 | RED-PROOF (fixed B-3) | `1.6-teach-budget-seed-redproof.log`, `web/test/teach-budget.test.ts`, `web/test/teach-fallback-deadline.test.ts` |
| 1.7 | RED-PROOF (fixed B-4) | `1.7-ask-outcome-seed-redproof.log`, `web/test/ask-outcome-discriminator.test.ts` |
| 1.8 | RED-PROOF | `1.8-user-table-spec-completeness.log` |

## Pass logs (green test output — not red-proofs)

| Log | Item | Notes |
|-----|------|-------|
| `1.6-teach-budget-test.log` | 1.6 | **Pass log only** — superseded by seed red-proof after B-3 |
| `1.7-ask-outcome-discriminator.log` | 1.7 | **Pass log only** — superseded after B-4 |
| `1.4-deps-audit-enumerated-green.log` | 1.4 | Green baseline snapshot |
| `npm-run-audit.log` | audit | **Stale** until B-1 owner ruling + regenerate at PR head |

## Configuration receipts (no automated guard — known gap)

| Item | Receipt | Gap |
|------|---------|-----|
| 1.9 | `.github/workflows/audit.yml` concurrency + trigger dedup | No test — CI config can regress silently |
| 1.10 | `1.10-grep-repair-barnes.log` | No test — script deletion can regress silently |

## STOP / blocked

| Item | Status | Evidence |
|------|--------|----------|
| B-1 postcss | **STOPPED-FOR-OWNER** | `B1-postcss-diagnosis.md` |

## Superseded

- `independent-audit-report.md` — in-repo audit; superseded by Claude Code independent audit per REPORTING rail.

## Auditor scope

- `pr44-auditor-file-scope.md` — maps changed files to items 1.1–1.10
