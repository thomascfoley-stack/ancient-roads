# Slice E — frozen v4 held-out re-measure (2026-07-24, dev ep-tiny-hat)

**The check that could have failed:** run the frozen v4 set live through the shipped
routing path; if verse-ref (the positive control) is not ~100 or the controls hijack,
the measurement is invalid and any other number is meaningless. Watched: verse-ref
**40/40 HIT@1**, controls **10/10 clean, 0 hijacks** → the instrument is alive and the
query shape is right. Not vacuous.

**Command:** `cd web && npx tsx --env-file=.env.local src/scripts/eval-heldout.mts --v4`
(read-only; DeepInfra + dev DB reachable). Raw: `E-v4-remeasure.txt`.

## Result vs the frozen 2026-07-18 run

| category | 07-18 (H1/H2) | tonight (H1/H2) | H1 Δ | read |
|---|---|---|---|---|
| verse-ref (40) | 100 / 100 | 100 / 100 | 0 | stable (positive control) |
| pericope (15) | 80 / 100 | **67** / 100 | −13 | H1 wobble; **H2 still 100** |
| epistle (25) | 96 / 100 | 92 / 96 | −4 | one query lost top-1 + one voice |
| topical (20) | 80 / 90 | 80 / **95** | 0 | H2 up |
| proper-noun (10) | 60 / 100 | 60 / 100 | 0 | stable |
| control (10) | clean | clean | — | 0 hijacks |

## Failure-coding the movement (looked at the data, not just the number)

- **Pericope H1 80→67 is entirely inside the HIT@2-pass band.** The five HIT@1 misses
  (pc-07 ten lepers, pc-09 rich man & Lazarus, pc-10 laborers in the vineyard, pc-13
  Paul's shipwreck, pc-15 cleansing of the temple) all still return **≥2 distinct-author
  voices** (pass); the top-1 slot went to a neighbouring passage. Pericope **HIT@2 held
  at 100**. The ≥2-voice product guarantee did not move.
- **Only TWO true wrong-passage misses** (0 correct voices): `ep-12` "pure religion
  undefiled ... the fatherless" (James 1:27) and `tp-16` "a father of the fatherless"
  (Ps 68:5). Both are the **"fatherless"** theme — a likely embedding collision pulling
  both toward the same wrong neighbourhood. Worth one look (handed to slice D).

## Attribution: corpus movement, NOT B2

- This week's suppressions removed ~1,040 rows (chrysostom prolegomena, non-authorial
  matter, tennyson/traherne repair). Removing rows reshuffles the reranker margin, which
  moves top-1 on borderline queries. That is the expected, benign cause.
- **B2 is ruled out by construction AND by inspection.** B2a's coverage gate lives in
  `teach.ts`, downstream of what `eval-heldout.mts` measures (it measures `routing.ts`
  retrieval). B2b's multi-word scan is in `ref-parse.ts` (which the eval does import via
  `resolveIntent`), but it only adds matches for the Song-of-Solomon aliases; none of
  these pericope/epistle/topical queries contain a multi-word book name, so it cannot
  have moved them.

## The honest status of the number

Re-running the frozen v4 makes it a **dev set** (measured against more than once), not a
fresh gate. So: pericope H1 at 67 is **below the original ≥70 bar as a drift signal**, but
this is NOT a re-gate decision — the bar was gated on the one-shot 07-18 run. A true
re-gate needs a fresh **v5** (new frozen queries, sampling Song of Solomon per the open
caveat). What this run confirms: **the ≥2-voice guarantee (HIT@2) is stable and strong
across every category; the top-1 ranking wobbled on legitimately-cleaned corpus.** No
action beyond recording, plus the two-query "fatherless" collision for D to eyeball.
