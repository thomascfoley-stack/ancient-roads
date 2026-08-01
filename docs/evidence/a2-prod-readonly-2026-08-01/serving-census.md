# A2.3 — the serving census. The table A3 adjudicates.

Measured read-only on production (`ep-odd-fog-atnykudm`) as `app_runtime`,
2026-08-01T05:10:11Z. Raw output: [`serving-census-stdout.log`](serving-census-stdout.log).

**This document presents. It does not adjudicate.** `docs/pm/MASTER.md:37` makes
"a published-but-not-admitted work is a STOP" an A3 call, and the A2 order says
so explicitly. Nothing below is a verdict.

## Exact command

```
# 1. Extract the real predicates, in a process holding NO credential:
npx --yes tsx -e "import { LEGAL_CORPUS_FILTER, PROSE_TYPE_SQL, SERVED_PROSE_WORKS,
  SERVED_LANE_WORKS } from './web/src/lib/teacher/routing.ts'; ..." \
  > /tmp/a2/serving-predicates.json

# 2. Measure, with the predicates read back from that JSON:
NEON_API_KEY="$(cat ~/.neon_api_key)" node \
  docs/evidence/a2-prod-readonly-2026-08-01/serving-census.mjs \
  --read-only --target=ep-odd-fog --predicates=/tmp/a2/serving-predicates.json \
  > /tmp/a2/serving-census-stdout.log 2> /tmp/a2/serving-census-stderr.log
# EXIT=0
```

`LEGAL_CORPUS_FILTER`, `PROSE_TYPE_SQL`, `SERVED_PROSE_WORKS` and
`SERVED_LANE_WORKS` are **not retyped** anywhere in this run — they come out of
`web/src/lib/teacher/routing.ts` itself. `CUTOVER_DESIGN.md:201-213` records what
a hand-mirrored copy of this filter cost last time (27.8% drift, 91,992 rows
admitted vs 127,467). The transpiler that reads the TypeScript runs in a separate
process that holds no credential, so it is never on the production connection's
path (`excerpt-sample-policy.mjs:5-11`).

**Positive control:** `LEGAL_CORPUS_FILTER` admits **83,993** rows on production.
The filter fires, so a `0` in the ADMITTED column below is a fact about the
corpus and not a predicate that failed to run.

**Guard cost: zero.** The `metadata->>'verseId' ~ '^[0-9]+$'` guard (carried for
the same reason as `publish-flip-census.mts:118` — the filter casts `::int`
inside an `AND` and Postgres does not guarantee short-circuit) excluded **0 of
190,635** platform rows. It cost nothing here.

## The table

| slug | status | published? | sections | admitted by slug leg? | flat rows | ADMITTED rows |
|---|---|---|---|---|---|---|
| adam-clarke | staged | no | 12,693 | no | 12,693 | **12,693** |
| barnes-notes | staged | no | 1,300 | no | 1,300 | **0** |
| calvin-crosswire | staged | no | 5,090 | no | 6,215 | **5,088** |
| jfb | staged | no | 15,473 | no | 15,473 | **15,473** |
| john-gill | staged | no | 28,843 | no | 28,843 | **28,843** |
| matthew-henry | staged | no | 4,210 | no | 4,210 | **4,210** |
| wesley-crosswire | staged | no | 5,254 | no | 6,275 | **5,254** |

*slug leg* = present in `SERVED_PROSE_WORKS` ∪ `SERVED_LANE_WORKS`. **No
production source is in either list.** `SERVED_PROSE_WORKS` is
`keil-delitzsch, catena-aurea, chrysostom-homilies, augustine-homilies`; none of
those four works exists on production at all. Every admission below therefore
runs through `LEGAL_CORPUS_FILTER`'s **author** legs.

## The author strings each work actually carries

| slug | `metadata->>'author'` on its rows |
|---|---|
| adam-clarke | `Adam Clarke` = 12,693 |
| barnes-notes | `Barnes' Notes` = 1,300 |
| calvin-crosswire | `John Calvin` = 6,215 |
| jfb | `Jamieson, Fausset & Brown` = 15,473 |
| john-gill | `John Gill` = 28,843 |
| matthew-henry | `Matthew Henry` = 4,210 |
| wesley-crosswire | `John Wesley` = 6,275 |

## What A3 has to decide

**1. `barnes-notes` — 1,300 sections, 0 admitted rows.** Its rows carry the
author string **`Barnes' Notes`**. `LEGAL_CORPUS_FILTER` names **`Albert
Barnes`**, and admits that author only when
`metadata->>'sourceUrl' ILIKE '%crosswire%'`. `Barnes' Notes` matches no leg of
the filter, so not one of its 1,300 sections is servable today.

It is **staged**, not published, so `MASTER.md:37`'s STOP has not fired. It fires
the moment a publish flip includes this work. Note also that `barnes-notes` is
the G6 owner-call work (`STATE_OF_TRUTH.md` §2b: "1,300 staged sections, biblehub
provenance"), and it is the one work of the seven the A2.2 instrument found
manifest-**ineligible** for excerpt sampling.

**2. Two works have more flat rows than admitted rows.**

| slug | flat rows | admitted | not admitted |
|---|---|---|---|
| calvin-crosswire | 6,215 | 5,088 | 1,127 |
| wesley-crosswire | 6,275 | 5,254 | 1,021 |

Both authors are admitted only with a `crosswire` sourceUrl, so the shortfall is
rows whose `sourceUrl` is something else. For Wesley, admitted (5,254) equals the
section count exactly. For Calvin, admitted (5,088) is **2 short** of its 5,090
sections — the only place in this census where a served count falls below its own
section count.

**3. 12,432 admitted rows belong to no `sources` row at all.** The filter admits
`Albert Barnes` (6,850), `Augustine of Hippo` (2,995) and `John Chrysostom`
(2,587) — all with **no work key**, and none of the three has a row in `sources`.
They are servable from the flat store while being invisible to the sections
model.

**4. Production's served pool is 9 distinct authors, not 11.**

| author | admitted rows | of which no work key |
|---|---|---|
| John Gill | 28,843 | 0 |
| Jamieson, Fausset & Brown | 15,473 | 0 |
| Adam Clarke | 12,693 | 0 |
| Albert Barnes | 6,850 | 6,850 |
| John Wesley | 5,254 | 0 |
| John Calvin | 5,088 | 0 |
| Matthew Henry | 4,210 | 0 |
| Augustine of Hippo | 2,995 | 2,995 |
| John Chrysostom | 2,587 | 2,587 |
| **TOTAL** | **83,993** | 12,432 |

`STATE_OF_TRUTH.md` §2c records **11** distinct authors admitted, measured on
**dev**. The extra two there are `C.F. Keil & Franz Delitzsch` and
`Thomas Aquinas (comp.), trans. J.H. Newman`, admitted via the
`SERVED_PROSE_WORKS` work leg — and neither of those works exists on production.
The 11 is correct for dev and does not describe prod — a fact of the
measurement, presented here because any ≥2-distinct-authors floor reasoning done
against the prod pool starts from the 9.
