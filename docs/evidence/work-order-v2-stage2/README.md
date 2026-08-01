# Work Order v2 Stage 2 — evidence index

## Stage 2 overnight tranches (2026-07-31)

| Tranche | Artifact | Status |
|---------|----------|--------|
| 1 | Dev read-only queries (ep-tiny-hat) | DONE — see final report |
| 2 | Order-preservation instrument + tests | DONE |
| 3 | `runtimeDbUrl` prod guard | DONE — `0.4-third-door-runtimeDbUrl.md` |
| 4 | STATE_OF_TRUTH §2e | DONE |
| 5 | `wip/front-matter-strength` branch | see TRANCHE5-STASH-EVALUATION.md |
| 6 | RECOVERY_VERIFICATION.md | DONE |
| 7 | Gate leg inventory | DONE — `scripts/lib/gate-leg-inventory.mjs` |
| 8 | TRANCHE8-MEASUREMENT.md, DEPLOY_PREFLIGHT.md | DONE |
| repair | UNIT_ORDINAL_REPAIR.md — 024 slug-scoped re-apply on ep-tiny-hat + ci-test | DONE 2026-07-31 |

**Why `db-invariants` went red → green.** It failed at `6896714` (run 30613713514) and passed at
`ac19935` (run 30650159435) **because the measured data was rewritten on `ep-tiny-bonus`
(`ci-test-20260729`) and `ep-tiny-hat` — not because code changed.** The 56-line edit to
`scripts/lib/unit-ordinal-instrument.mjs` in the same commit is a refactor: the cohort recompute SQL
is byte-identical across the two runs and the analysis functions are unchanged. Six works failed CI;
seven were repaired — the repair selects on any stored≠computed difference, which is broader than the
instrument's failure condition, and `tennyson-in-memoriam` had a uniform offset (tolerated by design).
Full detail, including the per-work delta table and the `chrysostom-homilies` (16, 17) correction:
`docs/STATE_OF_TRUTH.md` §2e. The **61,486** row count is **UNVERIFIED** — it rests on the tool's own
log; no auditor could reach either endpoint.

## Stage 2.1 — unit_ordinal instrument

| Item | Artifact | Status |
|------|----------|--------|
| 2.1 core | `scripts/lib/unit-ordinal-instrument.mjs` | DONE |
| 2.1 CLI | `scripts/unit-ordinal-instrument.mjs` | DONE |
| 2.1 db-invariants | `web/test/invariants/unit-ordinal-instrument.test.ts` | DONE |
| 2.1 cutover gate | `scripts/cutover-regression-gate.mts` G10 | gate leg WRITTEN; **red-proof UNDISCHARGED** — ADR-043 |
| 2.2 preflight | `test/unit-ordinal-instrument-preflight.test.ts` | DONE (§1–§3) |
| 2.2 prod read-only | `docs/evidence/work-order-v2-stage2/2.2-prod-unit-ordinal.log` | **HELD** — owner go after preflight; see ADR-042 on the file now in git |

**G10 — presence is not discharge.** The G10 case in `scripts/cutover-gate-redproof.mjs` has only
ever taken its `SKIPPED` branch, because production has 0 published sources and the seed needs a
published section with a non-NULL `unit_ordinal`. It is dropped from the Stage 2.2 go criteria until
that run prints `PROVEN`, not `SKIPPED`. Full falsifiable condition: **ADR-043**.

### Stage 2.2 preflight (before prod run)

- **§1 least privilege:** `app_runtime` via neonctl mint — not owner. Both the read-only transaction
  and the role are re-read FROM THE SERVER each run (`assertReadOnlySession`), standing test in
  `test/unit-ordinal-instrument-preflight.test.ts` §3.
- **§2 mint URL:** `NEON_API_KEY` → in-process `neonctl connection-string`; never paste prod URL
- **§3 excerpt:** `unit_ordinal`, `ordinal`, `heading` — **no body text**. Works are excluded by
  manifest quarantine / `forbidden_provenance=skip` / forbidden provenance domain / forbidden section
  `source_url`. This is **not** "clean-provenance works only": the section BODY is never inspected,
  and the log header says so. If the bounded section scan hits its LIMIT the run aborts rather than
  certify anything from a partial read.
- **Prod path runs under plain `node`** — no transpiler, no registry fetch (Tranche 0.1). Standing
  proof: `test/prod-path-no-transpiler.test.ts`; red-proof log
  `docs/evidence/work-order-v2-tranche0/0.1-0.2-redproof.log`.

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
