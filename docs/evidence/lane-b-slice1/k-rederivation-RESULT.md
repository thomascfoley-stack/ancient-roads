# RESULT — K re-derived under ADR-103's metric

Pre-registration: `k-rederivation-PRE-REGISTRATION-v2.md`, committed at 29d2d77 before this ran.
Index: **kjv**. Gold = ≥1 shared 8-gram. Returns = ≥K shared 6-grams, minVerseShingles=3.

## The sets

- **SET 1 (derivation)** — 90 documents, 33 authors: alexander, arminius, baxter, bernard, blaikie, burgon, calvin, chesterton, dods, dostoevsky, edwards, fenelon, flavel, gordon, hodge, jenyns, jowett, law, macdonald, manning, meyer, murray, newman, pascal, penn, ryle, smith, taylor, tolstoy, tulloch, watson, white, winkworth
- **SET 2 (validation)** — 90 documents, 34 authors: anselm, augustine, berkhof, bevan, blois, bounds, bunyan, bushnell, charnock, denney, drummond, farrar, finney, gill, guyon, henry, howe, john, knox, luther, maclaren, manton, moule, neander, owen, pasko, pink, schaff, south, tillotson, torrey, underhill, wesley, whyte
- Author-disjoint by construction. Spurgeon excluded from both.

### Exclusion (reported, not gated)

| set | scanned | zero gold | 0 < gold < 5 | eligible |
|---|---|---|---|---|
| SET 1 | 2925 | 591 (20.2%) | 742 | 90 |
| SET 2 | 5470 | 884 (16.2%) | 1372 | 90 |

## SET 1 — the K sweep (derivation)

| K | returns/doc | precision | recall |
|---|---|---|---|
| 1 | 54.3 | 0.424 | 0.871 |
| 2 | 27.7 | 0.729 ✓ | 0.871 |
| 3 | 20.7 | 0.935 ✓ | 0.871 |
| 4 | 16.6 | 0.919 ✓ | 0.728 |
| 5 | 13.8 | 0.922 ✓ | 0.613 |
| 6 | 11.9 | 0.922 ✓ | 0.530 |
| 7 | 10.6 | 0.922 ✓ | 0.473 |
| 8 | 9.6 | 0.889 ✓ | 0.423 |

**Chosen K = 2** — the smallest K whose mean precision ≥ 0.6 (0.729), recall 0.871.

## SET 2 — validation at that K

| K | returns/doc | precision | recall |
|---|---|---|---|
| 1 | 64.5 | 0.385 | 0.891 |
| 2 ← | 27.8 | 0.716 | 0.891 |
| 3 | 19.4 | 0.951 | 0.891 |
| 4 | 15.6 | 0.961 | 0.707 |
| 5 | 12.9 | 0.931 | 0.569 |
| 6 | 11.1 | 0.899 | 0.483 |
| 7 | 9.7 | 0.878 | 0.414 |
| 8 | 8.4 | 0.844 | 0.354 |

**K = 2 TRANSFERS.** SET 2 precision 0.716 ≥ 0.6, recall 0.891. K is re-derived and validated on a disjoint author set.

_Slice 0's recall numbers are deliberately absent: different denominator, not comparable (ADR-103)._

---

## FINDING — the decision rule picked a K that is strictly dominated

The pre-registered rule is "the smallest K whose mean precision ≥ 0.60", which selects **K = 2**.
But look at the recall column: it is **flat from K=1 to K=3** and only falls at K=4, on both sets.

| | K=2 | K=3 | |
|---|---|---|---|
| SET 1 precision | 0.729 | **0.935** | +20.6 points |
| SET 1 recall | 0.871 | **0.871** | identical |
| SET 2 precision | 0.716 | **0.951** | +23.5 points |
| SET 2 recall | 0.891 | **0.891** | identical |

**K = 3 is strictly better than K = 2 on both sets** — same recall, twenty-odd points more
precision, and a third fewer returns per document. The rule as written cannot see that, because it
stops at the first K clearing the bar and I forbade it from consulting recall.

### Why the flatness is arithmetic, not luck

Gold is "the body contains an **≥8-word** verbatim run". An 8-word run contains exactly **three**
6-word runs (8 − 6 + 1 = 3). So **every gold verse contributes at least 3 matching 6-gram shingles
by construction**, and `returns ⊇ gold` for any K ≤ 3. Raising K from 1 to 3 cannot drop a gold
verse; it can only drop non-gold ones, which is precisely what the precision column shows.

**K = 3 is therefore the largest K that cannot exclude a gold verse** — a structural property of the
metric's own definitions, not a feature of these documents. K = 4 is the first value that starts
cutting into gold, and the recall column duly falls off a cliff there (0.871 → 0.728, 0.891 → 0.707).

### What is adopted, and what is not

- **The pre-registered rule selected K = 2, and that is what this run formally returns.** It cleared
  its bar on SET 1 (0.729) and transferred to SET 2 (0.716). The derivation is valid.
- **K = 3 is NOT adopted here.** The argument for it is sound, but it was not pre-registered, and
  "the number looked better once I saw the table" is the exact move these files exist to prevent —
  even when the reasoning behind it is arithmetic. Adopting it needs either an owner ruling on the
  record, or a v3 pre-registration validated on a third disjoint set.
- Recorded so the choice is available with its evidence attached, rather than being quietly taken.

### Against Slice 0, carefully

Slice 0 recommended K = 3 from its own trade curve (75% recall / 96% precision at K=3). That
recommendation and this finding agree on the number, by different routes and on different
populations — Slice 0 on one author under the old metric, this on 67 authors under ADR-103's. The
**recalls are not comparable** (different denominators, ADR-103) and are not compared here. The
precisions are comparable, and 0.935 / 0.951 sits close to Slice 0's 0.96.
