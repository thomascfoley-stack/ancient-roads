# Work Order v2 Stage 2 — evidence index

## Stage 2.1 — unit_ordinal instrument

| Item | Artifact | Status |
|------|----------|--------|
| 2.1 core | `scripts/lib/unit-ordinal-instrument.mjs` | DONE |
| 2.1 CLI | `scripts/unit-ordinal-instrument.mjs` | DONE |
| 2.1 db-invariants | `web/test/invariants/unit-ordinal-instrument.test.ts` | DONE |
| 2.1 cutover gate | `scripts/cutover-regression-gate.mts` G10 | DONE |
| 2.2 preflight | `test/unit-ordinal-instrument-preflight.test.ts` | DONE (§1–§3) |
| 2.2 prod read-only | `docs/evidence/work-order-v2-stage2/2.2-prod-unit-ordinal.log` | **HELD** — owner go after preflight |

### Stage 2.2 preflight (before prod run)

- **§1 least privilege:** `app_runtime` via neonctl mint — not owner
- **§2 mint URL:** `NEON_API_KEY` → in-process `neonctl connection-string`; never paste prod URL
- **§3 excerpt:** clean-provenance works only; `unit_ordinal`, `ordinal`, `heading` — **no body text**

```bash
# Prod run (separate owner go — do not run until authorized)
NEON_API_KEY=<key> node scripts/unit-ordinal-instrument.mjs \
  --read-only --target=ep-odd-fog \
  --out=docs/evidence/work-order-v2-stage2/2.2-prod-unit-ordinal.log
```

### Stage 2 STOP checklist

- [x] Instrument built (2.1)
- [x] Preflight: app_runtime, neonctl mint, no body in excerpt log
- [ ] Prod read-only run committed with ordering excerpt (3 registers)
- [ ] Human read of excerpts — coherent sequence
- [ ] Independent audit before Stage 3
