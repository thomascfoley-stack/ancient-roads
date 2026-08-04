# RESULT — translation families for ADR-100

Pre-registration: `translation-family-PRE-REGISTRATION.md`, committed at edefd92 before this ran.
Metric: mean per-verse Jaccard of 6-gram shingles, paired population only. T = 0.5.

## Pairwise similarity — top 25 pairs

| a | b | mean Jaccard |
|---|---|---|
| rwebster | webster | 0.831 |
| akjv | ukjv | 0.735 |
| nheb | web | 0.715 |
| kjv | webster | 0.675 |
| kjv | ukjv | 0.674 |
| kjv | rwebster | 0.662 |
| akjv | kjv | 0.590 |
| akjv | webster | 0.556 |
| akjv | rwebster | 0.541 |
| rwebster | ukjv | 0.499 |
| ukjv | webster | 0.498 |
| asv | kjv | 0.419 |
| asv | webster | 0.354 |
| asv | rwebster | 0.340 |
| lsv | ylt | 0.308 |
| asv | ukjv | 0.306 |
| asv | darby | 0.291 |
| asv | nheb | 0.283 |
| akjv | asv | 0.276 |
| akjv | nheb | 0.255 |
| darby | kjv | 0.249 |
| darby | webster | 0.249 |
| darby | rwebster | 0.245 |
| asv | web | 0.219 |
| nheb | ukjv | 0.210 |

Lowest pair: bsb / tyndale at 0.000
Median of all 153 pairs: 0.053

## Families at T = 0.5

- akjv, kjv, rwebster, ukjv, webster
- nheb, web
- (singleton) anderson
- (singleton) asv
- (singleton) bbe
- (singleton) bsb
- (singleton) darby
- (singleton) geneva
- (singleton) lsv
- (singleton) noyes
- (singleton) rotherham
- (singleton) tyndale
- (singleton) ylt

## Sensitivity

- **T = 0.4** → 12 groups: {akjv,asv,kjv,rwebster,ukjv,webster} {nheb,web} {anderson} {bbe} {bsb} {darby} {geneva} {lsv} {noyes} {rotherham} {tyndale} {ylt}
- **T = 0.6** → 13 groups: {akjv,kjv,rwebster,ukjv,webster} {nheb,web} {anderson} {asv} {bbe} {bsb} {darby} {geneva} {lsv} {noyes} {rotherham} {tyndale} {ylt}

## The pre-registered falsifier

ADR-100 asserts akjv, kjv, rwebster, ukjv, webster are KJV-descended and share long verbatim runs.
**Expected:** one family at T = 0.5. **Observed:** ONE family — claim 1 HOLDS.

That family: akjv, kjv, rwebster, ukjv, webster

## Claim 2 — is union within the family cheap?

Union of the family's distinct shingles: 974681
Largest single member:                   594371
**Union cost ratio: 1.640**

**> 1.50 — ADR-100 decision 3 is WITHDRAWN.** Ship single-translation + recorded fallback.

For contrast, the cost ADR-100 refused (Option B, union across ALL translations):
  all 18 translations → ratio 7.821 (4894083 shingles)
