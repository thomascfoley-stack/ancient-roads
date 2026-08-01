# Red-proof — the tenth instance, `test/ask-max-duration-literal.test.ts`

Tranche 2 of [the post-A1 corrections order](../../pm/orders/2026-08-01-post-a1-corrections.md).
Every seed below went into **real product code** under `web/src/app`, never into a copy of the
predicate inside the test. Tree verified clean after each revert.

## What was wrong

`ROUTES` at `:26-29` was a hand-typed array of two paths, in the file whose own header names that
defect class ("a hand-maintained expected set that nothing enforces"). `git grep -n "export const
maxDuration" -- web/src/app` returns **three**. The third,
`web/src/app/api/eval/bait/route.ts:12`, imports `teach` at `:3` and calls `await teach(question)`
at `:31` — the real compose→verify path, not a stub.

## The property

A route segment config export that no hand-maintained list mentions is still checked. Adding a new
`export const maxDuration` anywhere under `web/src/app`, touching no list, cannot make the guard pass
vacuously.

## The remedy

Derivation, following `b9ad463`'s discipline: walk `web/src/app`, take every file that mentions
`maxDuration` in code, and require each to parse into a numeric-literal segment export equal to
`ASK_MAX_DURATION_SEC`. Discovery is deliberately **wider** than the parse, so a mention the scanner
cannot read is a refusal rather than a silent skip.

`codeOnly` is **imported** from `scripts/lib/source-scan.mjs`, not mirrored. The previous version
carried a byte-identical inline copy of that comment-stripping rule at `:35`.

## Four states

```
STATE 1  BASELINE
         derived set = 3 routes (39 files walked under web/src/app)
             web/src/app/api/ask/route.ts
             web/src/app/api/ask/stream/route.ts
             web/src/app/api/eval/bait/route.ts      <- the one no list mentioned
         guard: Test Files 1 passed | Tests 4 passed

STATE 2  SEED, real product code: web/src/app/api/eval/bait/route.ts
             import { ASK_MAX_DURATION_SEC } from '@/lib/teacher/teach-budget';
             export const maxDuration = ASK_MAX_DURATION_SEC;     (was: = 300;)

         guard      -> RED   Tests 2 failed | 2 passed
             x every maxDuration export is a NUMERIC LITERAL
               -> web/src/app/api/eval/bait/route.ts: maxDuration must be a numeric literal,
                  not an identifier: expected false to be true
             x every literal equals ASK_MAX_DURATION_SEC
               -> web/src/app/api/eval/bait/route.ts: expected NaN to be 300

         next build -> RED   EXIT=1
             OK Compiled successfully in 3.1s
             x  Invalid segment configuration export detected.

         CONTROL, the point of the whole tranche: the OLD hand-listed guard, extracted with
         `git show HEAD:test/ask-max-duration-literal.test.ts`, run against this SAME seed:
             Test Files 1 passed | Tests 3 passed        <- GREEN. It never looked at the file.

STATE 3  seed 2 reverted (guard back to 4 passed), then a NEW route added and NO list touched:
         web/src/app/api/redproof-newroute/route.ts

    3a   export const maxDuration = 300;      (matches the constant)
         derived set = 4 routes, the new one included automatically
         guard -> GREEN  Tests 4 passed          <- included, and correctly not complaining

    3b   export const maxDuration = 240;      (drift, on a route no list mentions)
         guard -> RED    Tests 1 failed | 3 passed
             x every literal equals ASK_MAX_DURATION_SEC
               -> web/src/app/api/redproof-newroute/route.ts: expected 240 to be 300
         This is the leg that matters: inclusion without checking would be theatre.

    3c   const segmentConfig = { maxDuration: 300 };   (mentions it, unparseable as an export)
         guard -> RED    Tests 3 failed
             x every mention parses as a segment config export (refuse rather than under-read)
               -> mentions maxDuration in a form the scanner cannot read: expected [Array(1)] to
                  deeply equal []
         The scan refuses instead of silently finding nothing.

STATE 4  all seeds reverted
         derived set = 3 routes
         guard: Test Files 1 passed | Tests 4 passed
         git status --porcelain: only test/ask-max-duration-literal.test.ts (the intended change)
         npm run audit: EXIT=0, "AUDIT PASSED — all gates green"
```

## Cost of not fixing

The regression that broke the production build ships again on a route the guard does not watch, and
CI stays green because `next build` is the only thing that would catch it — the single point of
failure `19798ec` was written to remove. Concretely: dropping `ASK_MAX_DURATION_SEC` to 240 left
`next build` green (all three are literals) and the old guard green (it read two files), with
`eval/bait` keeping a 300s Vercel ceiling against a 240s in-process budget.

## Honest limit

Still a source scan, and it says so in the file header. It cannot see a segment config produced by
code rather than declared — a generated file, a re-export chain resolved at build time. The
refusal leg (3c) narrows this: anything that *mentions* `maxDuration` in a shape the parser cannot
read is loud. Something that never spells the identifier at all remains invisible, and no source
scan fixes that.
