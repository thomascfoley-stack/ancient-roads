# FINDING — `publish-flip`'s 044 guard checks EXISTENCE, and existence is not readiness (2026-08-03)

**Filed by the concurrent /plans session, for A9's owner.** Not an order and not a verdict: a
defect found from the outside, in the window it is live. No code was changed and no flip was run.

## The guard

`scripts/publish-flip.mjs` (~line 366) gates a forward flip on the destination carrying
migration 044:

```js
const servedCol = (await client.query(
  `SELECT 1 FROM information_schema.columns WHERE table_name='embeddings' AND column_name='served'`,
)).rowCount > 0;
if (!servedCol && !reverse) { ...die('STOP: embeddings.served does not exist on this target...') }
```

Its comment states the property correctly: *"Forward: REQUIRED. Publishing now means serving; a
forward flip on a pre-044 target would silently recreate the published-but-unserved divergence
this whole design exists to kill."*

**The property is "this target serves by column". The check is "the column exists".** Those come
apart for the whole duration of 044, because 044 is `ADD COLUMN` followed by a series of
`UPDATE ... SET served = true`. Between the two, the column exists and serves nothing.

## Measured, on production, during that window

At 2026-08-03 (this session, read-only):

| fact | value |
|---|---|
| `embeddings.served` column | **present** |
| corpus rows (`user_id IS NULL`) | 559,506 |
| rows with `served = true` | **0** |
| `044*` in `schema_migrations` | **absent** (last three: 040, 042, 041 — the /plans set) |
| backfill | **running** — an active session whose query text is 044's own `-- ── the backfill:` comment |

So a forward flip attempted right then would have **passed the guard and proceeded**, against a
target where the serving set is empty. The refusal this session received hours earlier — correct
at the time — would not recur, though nothing about A9's readiness had changed.

## Why it matters, concretely

The flip's own served write is `UPDATE embeddings SET served=$2 WHERE ... metadata->>'work' = ANY($1)`.
Flipping the four staged topical works in that window makes them **the only served rows on
production**: 4 works served, the 124-work published corpus at `served=false`.

That is inert *today* only because of a deploy lag: the currently deployed commit (`0dbc567`)
does not read the column. Verified, not assumed — every `served` occurrence in the deployed
`routing.ts` / `retrieve.ts` / `legal-corpus.ts` is prose in a comment; the live predicate is
still the slug lists (`SERVED_PROSE_WORKS` et al). `feat/served-column-derives-publish`'s
`routing.ts` *does* read the column. **The first deploy of that branch against a state where the
backfill has not completed serves whatever `served=true` happens to hold at that moment.**

## The narrower point

This is the same shape as the failure A9's own audit already caught once — an unscheduled,
irreversible serve — arriving through a different door: not a wrong slug list, but a guard whose
proxy is true before its property is. It is also the shape `THE_LOOP.md` names: a check that
cannot fail in the window where it matters most is not protecting anything there.

## Suggested remedy (A9's owner's call, not taken here)

Gate on readiness rather than presence. Cheapest form, no new artifact:

```sql
-- forward flip precondition: the column exists AND the backfill has run
SELECT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='embeddings' AND column_name='served')
   AND EXISTS (SELECT 1 FROM embeddings WHERE user_id IS NULL AND served) AS ready;
```

Stronger, if 044 is recorded by a runner that writes the ledger: require the `044%` row in
`schema_migrations` too, so a hand-applied half-migration cannot satisfy it either. On this
target the ledger row is absent while the column is present, so that leg would have held where
the existence leg did not.

## What this session did about it

Nothing to production. The four topical works remain `status='staged'`, complete and verified
(`docs/evidence/topical-copy-2026-08-03/`, `mismatch: 0`). The topical publish is held until A9
closes on its own sequence — 044 recorded, backfill complete, serving set correct — at which
point the flip adds four works to an already-correct set instead of defining it.
