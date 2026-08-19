# P4.n Phase B — commentary flip result (87 works). STOP AND LOOK.

`OK — gate held. 87 status row(s) staged -> published; 101662 embedding row(s) -> served=true.`
11:57:28Z → 12:44:20Z = **47 minutes**. Verified independently: published 181 → 268, corpus served
506,934 → 608,596 (**+101,662 exactly**). Exegetical pool now **143 works / 316,861 served rows**.

## Every pre-registered bar holds. Two now sit EXACTLY on the floor.

| category | baseline | post-father | post-commentary | floor | |
|---|---|---|---|---|---|
| verse-ref HIT@1 | 100% | 100% | 100% | ≥95% | pass |
| pericope HIT@2 | 93% | 93% | **100%** | ≥87% | pass, improved |
| epistle HIT@2 | 92% | 92% | **88%** | ≥88% | **pass — AT the floor** |
| topical HIT@2 | 75% | 75% | **70%** | ≥70% | **pass — AT the floor** |
| proper-noun HIT@2 | 90% | 90% | 90% | ≥85% | pass |
| control | 10/10, 0 hijacks | same | same | exact | pass |

**Epistle HIT@1 fell 68% → 48%** (17/25 → 12/25, five queries) and was **unfloored** — HIT@1 bars
were pre-registered for verse-ref only. Topical `wrong-passage` failures went **4 → 6**.

## The two regressions that are not rank slips

Diffed per-query against the baseline (41 of 120 comparable; see the instrument note):

```
v3-tp-02  "the mercy and compassion of God toward sinners"   pass 2 voices -> wrong-passage 0 voices
v3-tp-17  "the goodness of creation and the stewardship..."  pass 2 voices -> wrong-passage 0 voices
```

Both answered correctly with two attributed voices before commentary; both now retrieve the **wrong
passage and zero voices**. Adding 87 verse-commentaries did not dilute a ranking — it displaced a
correct answer entirely. Also worse: `ep-21`, `ep-22`, `tp-04` lost HIT@1. Better: `ep-23`, `tp-13`,
`pn-06` gained HIT@1; `tp-05` gained the voice it lacked and now passes.

Net across the comparable set: **5 worse, 4 better, 6 neutral.**

## Verdict

**The pre-registered rule does not trigger a reversal** — no bar is breached. But the rule's purpose
is to say when to stop and look, and two floors reached simultaneously plus a 20-point unfloored drop
plus two new total failures is that moment.

**The hypothesis under test was "more exegetical corpus improves retrieval". On this set it is
measured FALSE.** Father: no effect. Commentary: net negative, with two correct answers destroyed.
That is a finding about the retrieval pipeline, not about the works, which are legitimate content.

**Sermon and theology should NOT flip on this evidence.** They sit in labeled lanes
(`SERMON_CORPUS_FILTER`, `THEOLOGY_CORPUS_FILTER`) outside `EXEGETICAL_TYPE_SQL`, so the prediction
is that they cannot move these categories — but tonight's evidence is precisely that predictions
about this retriever have been wrong, and there is now **zero headroom** on two floors.

## Instrument note, again

The BASELINE log is a partial tail (41 of 120 queries survived capture), so the per-query diff covers
about a third of the set and **the five-query epistle HIT@1 drop cannot be fully attributed** — only
`ep-15`..`ep-25` are comparable. Post-commentary was captured in full (131 lines). Every eval from
here must be captured whole; two of three runs in this sequence lost evidence to truncation.

## Rate, for whoever schedules the rest

father 26,674 rows / 49 min = **545/min** (cold cache) · commentary 101,662 / 47 min = **2,169/min**.
Per-row cost FALLS as the cache warms. Linear extrapolation from the first, cold batch was wrong
three times in this programme, always pessimistic. sermon ≈ 70 min, theology ≈ 115 min at the warm
rate — **if** they are ever ruled to flip.
