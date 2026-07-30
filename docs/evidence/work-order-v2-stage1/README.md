# Work Order v2 — Stage 1 red-proof index

| # | Property | Evidence path |
|---|----------|---------------|
| 1.1 | Protected branch delete refused | `1.1-protected-branch-refusal.log` |
| 1.2 | db-invariants fail-closed when secrets expected | `1.2-db-invariants-fail-closed.log`, `1.2-require-secrets-vs-corpus.log` (+ CI re-run on push) |
| 1.3 | Manifest forbidden_provenance restored | `1.3-manifest-forbidden-provenance.diff`, `1.3-manifest-provenance-test.log` |
| 1.4 | Enumerated expect-red both directions | `1.4-expect-red-extra.log`, `1.4-expect-red-missing.log`, `1.4-deps-audit-enumerated-green.log` |
| 1.5 | Bait route 401 unauthenticated / prod bearer OK | `1.5-bait-route-gate.log` |
| 1.6 | Compose budget ≤ maxDuration | `1.6-teach-budget-test.log` |
| 1.7 | ask_outcome discriminator | `1.7-ask-outcome-discriminator.log` |
| 1.8 | USER_TABLE_SPEC completeness | `1.8-user-table-spec-completeness.log` |
| 1.9 | CI concurrency key | `.github/workflows/audit.yml` `concurrency:` block |
| 1.10 | ADR-039 retired, scripts deleted | `1.10-grep-repair-barnes.log` |

Full audit: `npm-run-audit.log` (enumerated-red green on `GHSA-qq9h-g4jm-xgf3`).

Independent audit at STOP should re-execute each log command from this branch.
