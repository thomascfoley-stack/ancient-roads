# ⚠ RUN v1 — UNDERPOWERED. NOT A RESULT.

**SET 1 drew only 2 authors (alexander, arminius) against the pre-registered floor of ≥3.** By the
rule committed at 541b98e before this ran, that makes this run a finding, not a measurement. The
numbers below are recorded in full — deleting them would be worse — but **no K is adopted from
them** and they must not be cited as the re-derivation ADR-103 asked for.

**The design flaw, which is mine.** The pre-registration capped a set at 60 documents and filled it
"in a deterministic order", which I implemented as author-by-author. The first two authors supplied
60 documents between them and the loop stopped before reaching a third. That is the same
monoculture failure B-1 found in the OLD eligibility rule, reproduced in a new costume by my own
fill order — one author became two, which is not the fix ADR-103 was after.

Superseded by `k-rederivation-PRE-REGISTRATION-v2.md`, which changes ONLY the fill order
(round-robin across authors) and leaves the metric, the bars and the decision rule untouched.

---

# RESULT — K re-derived under ADR-103's metric

Pre-registration: `k-rederivation-PRE-REGISTRATION.md`, committed at 541b98e before this ran.
Index: **kjv**. Gold = ≥1 shared 8-gram. Returns = ≥K shared 6-grams, minVerseShingles=3.

## The sets

- **SET 1 (derivation)** — 60 documents, 2 authors: alexander, arminius
- **SET 2 (validation)** — 60 documents, 3 authors: anselm, augustine, berkhof
- Author-disjoint by construction. Spurgeon excluded from both.

### Exclusion (reported, not gated)

| set | scanned | zero gold | 0 < gold < 5 | eligible |
|---|---|---|---|---|
| SET 1 | 155 | 42 (27.1%) | 53 | 60 |
| SET 2 | 204 | 54 (26.5%) | 90 | 60 |

## ⚠ UNDERPOWERED — reported as such, not as a result

Pre-registered floor: ≥25 documents and ≥3 authors per set.
## SET 1 — the K sweep (derivation)

| K | returns/doc | precision | recall |
|---|---|---|---|
| 1 | 51.5 | 0.477 | 0.953 |
| 2 | 26.2 | 0.773 ✓ | 0.953 |
| 3 | 19.4 | 0.985 ✓ | 0.953 |
| 4 | 15.0 | 0.981 ✓ | 0.787 |
| 5 | 12.8 | 0.983 ✓ | 0.685 |
| 6 | 10.9 | 0.983 ✓ | 0.618 |
| 7 | 9.9 | 0.983 ✓ | 0.574 |
| 8 | 8.8 | 0.983 ✓ | 0.520 |

**Chosen K = 2** — the smallest K whose mean precision ≥ 0.6 (0.773), recall 0.953.

## SET 2 — validation at that K

| K | returns/doc | precision | recall |
|---|---|---|---|
| 1 | 41.4 | 0.436 | 0.959 |
| 2 ← | 18.8 | 0.768 | 0.959 |
| 3 | 14.2 | 0.971 | 0.959 |
| 4 | 11.3 | 0.989 | 0.786 |
| 5 | 9.3 | 0.997 | 0.628 |
| 6 | 8.0 | 1.000 | 0.546 |
| 7 | 6.9 | 0.967 | 0.460 |
| 8 | 6.0 | 0.933 | 0.391 |

**K = 2 TRANSFERS.** SET 2 precision 0.768 ≥ 0.6, recall 0.959. K is re-derived and validated on a disjoint author set.

_Slice 0's recall numbers are deliberately absent: different denominator, not comparable (ADR-103)._
