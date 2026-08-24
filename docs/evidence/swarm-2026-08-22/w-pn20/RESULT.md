# RESULT — W-PN20, ADR-118 proper-noun held-out measurement

**Run:** 2026-08-22T17:42Z · set `FROZEN_PN20` (n=20) · harness `web/src/scripts/eval-heldout.mts --pn20`
(shipped routing path, K=6, pool=20, ef=64, corpus=legal(shared)) · **dev (`ep-tiny-hat`), read-only**
· capture `pn20-run-capture.json` (20/20, `complete: true`) · stdout `pn20-run.log`
· pre-reg `PRE-REG.md` (committed f910a7a before measurement).

## Verdict against the pre-registered bar

**HIT@2 = 17/20 = 85.0% — BELOW the ADR-118 bar of ≥ 90% (18/20). LAUNCH-BLOCKER-CONFIRMED.**

Per ADR-118's no-softening ruling and this item's merge rule: the number is REPORTED, not
tuned. No retrieval change was made under this item. The case set and harness merge regardless
of outcome. ADR-118's power table applies: at n=20 a system exactly at 90% fails ~1 run in 3 by
luck; remedies (re-run with more cases, or an explicit owner amendment) are the owner's.

## Numbers

| metric | k/n | point | Wilson 95% CI (reported, not gated) |
|---|---|---|---|
| HIT@1 | 13/20 | 65.0% | [43.3%, 81.9%] |
| **HIT@2 (the gate)** | **17/20** | **85.0%** | **[64.0%, 94.8%]** |

Failure codes: pass 17 · `<2-voices` 1 · `wrong-passage` 2 · `no-content` 0.

## Per-case table

| id | query (truncated) | label | HIT@1 | voices | code |
|---|---|---|---|---|---|
| pn20-01 | Abimelech king of Gerar who took Sarah | Genesis 20 | Y | 2 | pass |
| pn20-02 | Korah and the rebellion that the earth swallowed up | Numbers 16 | n | 2 | pass |
| pn20-03 | Ehud the lefthanded man who slew Eglon king of Moab | Judges 3 | Y | 2 | pass |
| pn20-04 | Gideon and the fleece of wool, wet and dry | Judges 6 | Y | 2 | pass |
| pn20-05 | Abigail who interceded with David for Nabal | 1 Samuel 25 | Y | 4 | pass |
| pn20-06 | Micaiah the prophet who saw the LORD on his throne | 1 Kings 22 | n | 2 | pass |
| pn20-07 | Absalom caught by his head in the oak | 2 Samuel 18 | Y | 2 | pass |
| pn20-08 | Adonijah who exalted himself saying I will be king | 1 Kings 1 | Y | 2 | pass |
| pn20-09 | Jehu who drove furiously, cut off the house of Ahab | 2 Kings 9–10 | Y | 3 | pass |
| pn20-10 | Uzziah the king who burned incense, smitten leprous | 2 Chronicles 26 | Y | 2 | pass |
| pn20-11 | Mordecai who would not bow to Haman | Esther 3 | Y | 2 | pass |
| pn20-12 | Gomer, the wife of Hosea the prophet | Hosea 1 | Y | 3 | pass |
| pn20-13 | Joseph of Arimathaea who begged the body of Jesus | Luke 23 | n | 1 | **`<2-voices`** |
| pn20-14 | Malchus whose ear Peter cut off | John 18 | n | 2 | pass |
| pn20-15 | Pilate who washed his hands before the multitude | Matthew 27 | Y | 2 | pass |
| pn20-16 | Stephanas and his household, firstfruits of Achaia | 1 Corinthians 16 | n | 0 | **`wrong-passage`** |
| pn20-17 | Jezebel of Thyatira who calls herself a prophetess | Revelation 2 | Y | 2 | pass |
| pn20-18 | Diotrephes who loveth to have the preeminence | 3 John 1 | n | 0 | **`wrong-passage`** |
| pn20-19 | Felix the governor who trembled | Acts 24 | n | 2 | pass |
| pn20-20 | Hymenaeus and Alexander delivered unto Satan | 1 Timothy 1 | Y | 2 | pass |

The three misses are reported, not fixed (pre-reg withdrawal conditions; the v4 design doc's
verdict logic — "misses are failure-coded and reported, never fixed toward the test").
`no-content = 0`: the served corpus holds on-label content for every case; the two
`wrong-passage` misses are retrieval misses, not corpus holes. The one `<2-voices` miss
(Luke 23) surfaced one on-target voice but not a second distinct author.

## Served-pool snapshots (concurrent DB-writer lane disclosure, §5.1)

| | start (17:41:49Z) | end (17:43:09Z) |
|---|---|---|
| host | ep-tiny-hat | ep-tiny-hat |
| served rows (user_id IS NULL AND served) | 390,184 | 390,184 |
| distinct works | 124 | 124 |
| by source_type | sermon 162,507 · commentary 107,927 · theology 28,726 · lexicon 23,657 · father 23,642 · topical_index 13,082 · hymn 6,887 · confession 6,590 · devotional 6,589 · historian 6,492 · poetry 4,085 | identical |

The pool did not drift during the ~80-second measurement window. Full JSON:
`served-pool-snapshot-start.json`, `served-pool-snapshot-end.json`.

## Context for the reader (not an excuse)

- v4's ten (burned) proper-noun cases measured HIT@2 100% post-A8 (2026-08-02). This fresh
  n=20 measures 85%. The v4 ten can no longer set a number (ADR-118 §3); this set can.
- HIT@1 65% vs v4's 70%: HIT@1 is not the gate (ADR-116) and at n=20 each query is 5 points.
- The set is stricter than v4 on disjointness: pn20 labels share ZERO chapters with any prior
  set's labels (v4 shared 26% of labels with v3); verified mechanically by
  `heldout-anchor-check.mts`, green at freeze and re-run green after the measurement.

## Reproduction

```sh
cd web && npx tsx --env-file=.env.local src/scripts/eval-heldout.mts --pn20   # the measurement
cd web && npx tsx src/scripts/heldout-anchor-check.mts                       # labels + disjointness
npx vitest run test/heldout-frozen-hash.test.ts                              # freeze integrity
```
