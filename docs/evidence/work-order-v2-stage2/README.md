# Work Order v2 Stage 2 — evidence index

## Stage 2.1 — unit_ordinal instrument (in progress)

| Item | Artifact | Status |
|------|----------|--------|
| 2.1 core | `scripts/lib/unit-ordinal-instrument.mjs` | DONE |
| 2.1 CLI | `scripts/unit-ordinal-instrument.mjs` (`--read-only --target=`) | DONE |
| 2.1 db-invariants | `web/test/invariants/unit-ordinal-instrument.test.ts` | DONE (perturbations + published leg) |
| 2.1 cutover gate | `scripts/cutover-regression-gate.mts` G10 | DONE |
| 2.1 perturbation red-proofs | in-suite (units-merge-islands, unit-sort-storage-ordinal) | DONE (needs seed owner in CI) |
| 2.2 prod read-only | `docs/evidence/work-order-v2-stage2/2.2-prod-unit-ordinal.log` | **BLOCKED** — no prod DATABASE_URL in agent env |

### Run receipts (fill on CI / prod)

```bash
# db-invariants (published leg + perturbations when secrets present)
cd web && pnpm exec vitest run test/invariants/unit-ordinal-instrument.test.ts

# prod read-only (owner go; never write)
UNIT_ORDINAL_DATABASE_URL=<owner> node scripts/unit-ordinal-instrument.mjs \
  --read-only --target=ep-odd-fog \
  --out=docs/evidence/work-order-v2-stage2/2.2-prod-unit-ordinal.log
```

### Stage 2 STOP checklist

- [ ] Both perturbations red as standing tests (seed owner)
- [ ] Digest leg green on published works
- [ ] Prod read-only run committed with excerpt dump (3 registers)
- [ ] Human read of excerpts — coherent sequence
- [ ] Independent audit before Stage 3
