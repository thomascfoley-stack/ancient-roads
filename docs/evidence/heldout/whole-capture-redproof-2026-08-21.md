# Whole-capture — red-proof, both legs executed 2026-08-21

## The defect this closes

`web/src/scripts/eval-heldout.mts` emitted to **stdout only** — there was no `writeFile` anywhere
in the file. Whether a run's evidence survived therefore depended entirely on whoever piped it,
and a truncated pipe is indistinguishable in the output from a complete run.

It cost a real decision. The 2026-08-19 P4.n commentary-flip baseline
([RESULT-commentary.md](../p4n-flip-2026-08-19/RESULT-commentary.md)) survived as a **partial tail
— 41 of 120 queries** — so the per-query diff that adjudicated an 87-work corpus flip covered a
third of the set, and the five-query epistle HIT@1 drop could not be attributed. That file records
that **two of three runs in the sequence lost evidence to truncation**.

## The property

**Completeness is asserted, not hoped for.** The harness writes its own artifact: one record per
query, the count the run expected, and a `complete` flag comparing them. A run that dies mid-loop
still writes what it had, **marked incomplete**, and exits non-zero. Absence of the file is itself
a signal — the process never reached the end.

stdout is unchanged. This removes the pipe from the evidence path, which is where the losses were.

## Red-proof

Run offline — `--frozen --cats control` touches neither the database nor DeepInfra (controls only
call `resolveIntent`), so both legs are reproducible with no credentials and no provider spend.

```
APP_DATABASE_URL='postgresql://u:p@ep-dummy.example.neon.tech/db' DEEPINFRA_API_KEY=unused \
  npx tsx src/scripts/eval-heldout.mts --frozen --cats control --out <path>
```

| leg | mutation | exit | artifact |
|---|---|---|---|
| **GREEN** | none | `0` | `captured 10/10`, `complete: true` |
| **RED** | `if (records.length === 3) break;` at the top of the loop | **`1`** | `captured 3/10`, **`complete: false`** |

The red leg is a **silent early exit, not a throw** — deliberately. A thrown error already exits
non-zero through the pre-existing `.catch(… process.exit(1))` at the module tail, so a throw would
have proven that handler, not this check. Breaking out of the loop leaves `main()` resolving
normally, so the `1` comes from `process.exitCode` set in the new `finally` and from nothing else.

An earlier throw-based leg was also run and is the weaker of the two: it wrote `captured 3/10,
complete: false` correctly, but its exit code was not attributable to this check.

## NOT DONE

- **No CI test.** `captureVerdict` is exported and pure, but importing it pulls the module's
  top-level `neon(...)` construction and the whole `routing.ts` import graph, so a unit test needs
  either an env shim or extracting the function to its own module — premature at one call site
  (CLAUDE.md: inline until the 3rd). The property is proven by execution above and **is not
  guarded on every push.** Stated rather than papered over.
- Not yet run against a real query set (needs DB + DeepInfra); the control-only path exercises the
  capture machinery end to end but not the scored branch's `records.push`.
