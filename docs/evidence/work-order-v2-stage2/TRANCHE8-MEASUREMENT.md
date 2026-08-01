# Tranche 8 — measurement (2026-07-31)

## 1. ESLint on `scripts/` (errors by rule)

| Rule | Count |
|------|-------|
| `no-undef` | 37 |
| `no-empty` | 2 |
| `@typescript-eslint/no-unused-vars` | 3 |
| `@typescript-eslint/no-require-imports` | 3 |
| `prefer-const` | 1 |
| **Total** | **46** |

**Worst files:** `scripts/prod-census.cjs` (38), `scripts/capture-evidence.mjs` (4).

**Proposed override scope:** add `scripts/prod-census.cjs` to eslint ignore or add `/* eslint-env node */` + `globals` for `.cjs` legacy scripts; do not blanket-disable `no-undef` on all of `scripts/`.

## 2. ENGINEERING.md §2–3 staleness (DO NOT EDIT ENGINEERING.md)

| Statement | Correction |
|-----------|------------|
| §2 "read STATE_OF_TRUTH.md" | Correct pointer; STATE_OF_TRUTH itself notes dev-vs-prod framing corrections. |
| §3 "Start here: README.md § Documents of record" | Still valid. |
| §7 "E2E / web — **Missing (biggest gap)**" | Partially stale: `web/test/invariants/` now has substantial DB-backed suites; Playwright E2E still missing. |
| §8 "`npm run audit` on every PR/push" | Stale wording: CI runs on push to every branch (ADR-040); fork PRs may not run until push. |
| §11 "Formalize as docs/RELEASE.md" | Still missing; DEPLOY_PREFLIGHT.md added this tranche as partial substitute. |
| §12 "Observability = zero" | Still true. |
| §13 "No decision log (ADRs)" | Stale: `docs/DECISIONS.md` exists with ADR-001+ through ADR-043+. |
| §15 "`CLAUDE.md` doesn't exist" | Verify locally — may still be true; handbook says create it. |

## 3. DEPLOY_PREFLIGHT.md

Created at repo root `docs/DEPLOY_PREFLIGHT.md` (did not exist).
