# P4.n Phase B — father flip result (18 works)

Measured against [`PRE-REGISTRATION.md`](PRE-REGISTRATION.md), whose bars were fixed and committed
(`da2d3a2`) **before** any work was published.

## The flip

`OK — gate held. 18 status row(s) staged -> published; 26674 embedding row(s) -> served=true.`
06:20:40Z → 07:09:42Z = **49 minutes**. Verified independently of the tool's log: prod `published`
163 → 181, corpus `served` 480,260 → 506,934 (**+26,674 exactly**).

## Verdict: every pre-registered bar HOLDS. No breach. Also: no improvement.

| category | baseline | post-father | floor | |
|---|---|---|---|---|
| verse-ref HIT@1 | 100% | 100% | ≥95% | pass |
| pericope HIT@2 | 93% | 93% | ≥87% | pass |
| epistle HIT@2 | 92% | 92% | ≥88% | pass |
| topical HIT@2 | 75% | 75% | ≥70% | pass |
| proper-noun HIT@2 | 90% | 90% | ≥85% | pass |
| control | clean 10/10, 0 hijacks | clean 10/10, 0 hijacks | exact | pass |

**Every HIT@2 is identical.** Two HIT@1 figures fell by exactly one query each: pericope 80% → 73%
(12/15 → 11/15), epistle 68% → 64% (17/25 → 16/25). The topical failure mix shifted one query from
`wrong-passage` to `<2-voices` with the totals unchanged.

**Read this as "no measurable effect", not "success".** Adding 18 patristic volumes to the
exegetical pool moved nothing at HIT@2 and moved two queries the wrong way at rank 1. Both are
inside the noise the pre-registration named in advance (one query = 6.7 points at pericope, 4.0 at
epistle), so neither is evidence of regression — but neither is the flat HIT@2 evidence of gain.
The honest summary is that this set cannot detect what 18 works did, in either direction.

**Bars were set on HIT@2 for four categories and HIT@1 only for verse-ref.** The two numbers that
moved are therefore unfloored. That was a choice made before the run, not after seeing it, and it is
recorded here rather than quietly repaired: if HIT@1 floors had been set at one query below
baseline, both would have breached.

## Instrument defect in this run, recorded not hidden

The post-flip eval was captured through `tail -12`, so only the summary table survives —
`postfather-v3-prod.log` has no per-query lines and **a query-level diff against the baseline is not
possible for this run**. An attempted diff produced 41 spurious "changes" that were pure truncation
artifact. The summary comparison above is unaffected, because the bars are summary-level, but the
diagnosis of *which* pericope and epistle queries moved is lost. Capture full output next time.

## Licensing, post-flip

`served-veto-audit.mts` against production: 811 works scanned, 25 name-matched candidates, **0
serving against a ruling**, exit 0.

## What this says about commentary

Nothing, and that is the point. `EXEGETICAL_TYPE_SQL` is `source_type IN ('commentary','father')`;
this run added only the second. 87 works of actual verse-commentary is a different intervention and
should be measured on its own, against **this** run as the new baseline — not against the pre-father
one, or the two changes become inseparable.
