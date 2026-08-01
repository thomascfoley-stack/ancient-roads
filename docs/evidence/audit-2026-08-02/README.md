# CI evidence for the audit-fix tranche

Pinned at `47eac58`, the tip of `fable/overnight-hardening` after every fix from the
2026-08-02 branch audit ([verdict](../../pm/orders/2026-08-02-stop-verdict-corrections-branch.md)).

**Both jobs green.** Run [30701462998](https://github.com/thomascfoley-stack/ancient-roads/actions/runs/30701462998):

| job | conclusion |
|---|---|
| `audit` | **success** |
| `db-invariants` | **success** |

Raw `gh run view --json jobs,headSha,conclusion,displayTitle,workflowName,createdAt` is committed
verbatim as `ci-run-30701462998.json`, unedited, so the two conclusions above can be checked
against the API's own answer rather than against this table.

Note on naming, because previous records in this repo have called these "two workflows": they are
two JOBS inside one workflow named `audit` (`.github/workflows/audit.yml`, jobs `push`, `audit`,
`db-invariants`). `gh run list` therefore shows one row, not two. The `push` job is a
same-workflow no-op gate and carries no conclusion of interest.

## What ran locally at the same sha

Measured after every fix, not before:

| gate | result |
|---|---|
| root `tsc --noEmit` | exit 0 |
| root `vitest run` | 437 passed, 1 skipped (41 files) |
| `web` `tsc --noEmit` | exit 0 |
| `web` `vitest run` | 262 passed, 80 skipped (57 files) |
| `npm run audit` | AUDIT PASSED, all gates green |

The publish-flip writer was also re-run end to end against a throwaway local Postgres after its
delta logic was extracted, with every exit code read bare rather than through a pipe:

```
happy path     3 rows staged -> published            exit 0
idempotent     0 eligible                            exit 0
--reverse      3 rows published -> staged            exit 0
third status   STOP olney-hymns=quarantined          exit 1, nothing moved
licence gate   GATE FAILED, rolled back              exit 1, all four rows still staged
```
