# P4.n Phase B — pre-registration, written BEFORE any flip

**Written 2026-08-19, before a single work was published or served.** The bars below are fixed now
so the post-flip comparison can fail. Anything decided after seeing the second number is tuning.

## Instrument

`web/src/scripts/eval-heldout.mts --v3`, the FROZEN_V3 set, **120 queries**, run through the shipped
`lib/teacher/routing.ts` path, read-only, pointed at **production** via `APP_DATABASE_URL`.

v3 is the repo's **dev set** — measured against repeatedly, never a ship gate (CLAUDE.md). It is used
here as a **regression detector**, which is what it is for. This is NOT a launch-gate claim and does
not substitute for a fresh vN.

## Baseline — production, pre-flip (log: `baseline-v3-prod-preflip.log`)

| category | n | HIT@1 | HIT@2 |
|---|---|---|---|
| verse-ref | 40 | 100% | 100% |
| pericope | 15 | 80% | 93% |
| epistle | 25 | 68% | 92% |
| topical | 20 | 35% | 75% |
| proper-noun | 10 | 80% | 90% |
| control | 10 | clean 10/10, hijacks 0 |

**Not comparable to CLAUDE.md's v3 line** (95/95 · 87/100 · 68/80 · 45/75 · 60/90). Those were
measured on **dev** on 2026-07-18 under the option-(c) lane config. Different database, different
corpus. The only valid comparison is this baseline against a re-run of the same set on the same
database.

## Pre-registered bars — the flip is REVERSED if any is breached

| # | Bar | Baseline | Floor |
|---|---|---|---|
| 1 | verse-ref HIT@1 | 100% | **>= 95%** |
| 2 | pericope HIT@2 | 93% | **>= 87%** |
| 3 | epistle HIT@2 | 92% | **>= 88%** |
| 4 | topical HIT@2 | 75% | **>= 70%** |
| 5 | proper-noun HIT@2 | 90% | **>= 80%** |
| 6 | control hijacks | 0 | **exactly 0 — any hijack is an immediate STOP** |
| 7 | control clean | 10/10 | **10/10** |

Floors sit roughly one query below baseline per category, because that is the resolution the set
actually has.

**THE SMALL-n CAVEAT, stated before the run rather than after a result is disliked.** These are 10-40
queries per category. One query is **2.5 points** at verse-ref, **6.7** at pericope, **10 at
proper-noun**. So:

* proper-noun and pericope **cannot detect** anything smaller than one query. A "pass" there is weak
  evidence, not strong.
* A breach of one bar by one query is inside noise and is **not** by itself proof of regression — but
  it IS the trigger to stop and look, which is the point of a floor.
* Bars 6 and 7 are different in kind: a control hijack is a **faithfulness** failure, not a sampling
  wobble, and there is no noise argument for it.

## What is being flipped, and in what order

1. `flip-father.json` — 18 works
2. `flip-commentary.json` — 87 works  <- re-measure HERE
3. `flip-sermon.json` — 95 works
4. `flip-theology.json` — 438 works   <- re-measure again

father+commentary first because `EXEGETICAL_TYPE_SQL` is `source_type IN ('commentary','father')` —
they are the only two registers that enter the /ask exegetical pool, so they are where accuracy can
move. sermon and theology/confession sit in **labeled lanes** and cannot change these categories,
which is a prediction this measurement will test rather than assume.

## Exact inverse

`node scripts/publish-flip.mjs --slugs=<same file> --reverse` — published -> staged, same guards.
