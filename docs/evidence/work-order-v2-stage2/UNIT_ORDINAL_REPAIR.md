# unit_ordinal repair — 2026-07-31

Owner authorized option 1: repair on non-prod, leave production alone.

## Tool

`scripts/repair-unit-ordinal.mjs`

- Extracts 024 backfill SQL via `backfillSqlFromMigration` / `backfillRepairUpdateSql`
- Only the `need` CTE changes (slug list); CTEs below stay the migration's
- Allowed write targets: `ep-tiny-hat` (dev), `ep-tiny-bonus` (ci-test-20260729)
- Refuses `ep-odd-fog` with no override
- Dry-run default; `--apply` WRITEs; weld abort if `computed_units < stored_units`
- Post-apply: `measureUnitOrdinalForCohort`; ROLLBACK if still RED

## Preflight (weld detector)

Both endpoints: **0 weld rows** — stored_units == computed_units for all 7 drifted works.

## Apply

| target | branch | UPDATE rowCount | instrument |
|--------|--------|-----------------|------------|
| ep-tiny-hat | dev | 61486 | published ok=true |
| ep-tiny-bonus | ci-test-20260729 | 61486 | published ok=true |

Slugs: chrysostom-homilies, edwards-works, hodge-systematic, maclaren-expositions,
owen-works, tennyson-in-memoriam, watson-works.

## Post-check

```
node scripts/repair-unit-ordinal.mjs --target=ep-tiny-bonus --branch=ci-test-20260729 --cohort=published
→ nothing to repair — instrument ok=true errors=0

node scripts/repair-unit-ordinal.mjs --target=ep-odd-fog
→ REFUSING: production
```
