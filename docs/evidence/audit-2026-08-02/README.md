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

---

## After the merge to main

`main` moved `29d6f98 -> 1f4bf8d` on 2026-08-02 by two no-fast-forward merges:

| merge | brings in |
|---|---|
| `9f02b6d` | `fable/overnight-hardening` @ `9005c64`, which contains `fix/post-a1-corrections-2026-08-01` @ `b449947` in full |
| `1f4bf8d` | `a2/prod-readonly-2026-08-01` @ `4b31c0c` |

**Merged on the owner's explicit instruction**, overriding this repo's standing rule that the
owner merges. The verdict's section 0 caveat is not discharged by the merge and still stands:
the audit was commissioned by the author of the work, and the same author wrote every fix.
Its five open conditions (section 3) are unaddressed.

Both branches merged textually clean, and the overlap was checked semantically rather than
trusted - both edit `docs/RECOVERY.md` and `docs/STATE_OF_TRUTH.md`. In RECOVERY they touch
different Restores rows; in STATE_OF_TRUTH the hunks do not overlap (A2 at 87/123/302, the
corrections stack at 274). No conflict markers anywhere in `docs`, `web/src`, `scripts`, `src`
or `test`.

CI on the merged `main`, run [30715489976](https://github.com/thomascfoley-stack/ancient-roads/actions/runs/30715489976),
raw JSON committed as `ci-run-main-30715489976.json`:

| job | conclusion |
|---|---|
| `audit` | **success** |
| `db-invariants` | **success** |

Local gate at `1f4bf8d`, run after both merges: root `tsc` 0 / vitest 437 passed, web `tsc` 0 /
vitest 262 passed, `npm run audit` PASSED.
