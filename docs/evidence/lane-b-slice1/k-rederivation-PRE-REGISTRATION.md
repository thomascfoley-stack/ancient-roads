# PRE-REGISTRATION — re-deriving K under ADR-103's metric

**Written and committed BEFORE any document was selected, parsed or scored.** No number below was
chosen after seeing a result. If the run needs any rule here changed to complete, that is a finding
and the run is void.

## Why

ADR-103 superseded stated-text recall as the ship gate and requires K to be **re-derived, not
carried over**:

> K would have to be re-derived, not carried over — and re-derived on one set, then validated on
> another, or B-1's circularity returns immediately in a new costume.

Slice 0's K=3 was read off the same held-out set that measured it, on one author. This run replaces
it with a K derived on one author group and validated on a disjoint one.

## The metric (ADR-103 §4, restated so this file stands alone)

- **Document** = one CCEL unit (a sermon or chapter) parsed by `buildCcelSections`, with ≥ 4,000
  characters of body. Below that a "document" is a fragment and its gold set is noise.
- **Gold** = verse *v* is engaged iff the body contains an **≥8-word verbatim run** of *v*.
  Computed as ≥1 shared 8-gram shingle, independently of K, so precision is not circular. It is a
  conservative signal, so **precision is a lower bound**, exactly as in the Slice 0 PRECISION RUN.
- **Returns** = verse *v* is returned iff **≥K** of its 6-gram shingles appear in the body,
  with the same `minVerseShingles = 3` distinctiveness floor Slice 0 froze.
- **Precision** = |returns ∩ gold| / |returns|, per document, then averaged across documents.
- **Recall** = |returns ∩ gold| / |gold|, per document, then averaged.
- **Eligibility** = |gold| ≥ **5**. **No epigraph required** — that is what makes non-Spurgeon
  authors measurable and is the entire reason ADR-103 exists.
- **Index** = **KJV**, stated explicitly on every run. These are 17th-19th century English works
  quoting the AV. Per-document translation detection is NOT part of this measurement; its effect
  has its own bar in ADR-100 and confounding the two would measure neither.
- Shingles come from `src/bible/uncited-shingle.ts` — the same module the shipped channel uses.

## The sets, chosen by a rule rather than by hand

1. **Spurgeon is excluded from BOTH sets.** Slice 0's K came from Spurgeon, and B-1's finding was
   that the old eligibility rule selected for Spurgeon *by construction*. Deriving the replacement K
   on the same author would reproduce the monoculture this metric exists to escape. Spurgeon remains
   the regression check under the OLD metric (ADR-103), which is a different measurement.
2. **Eligible authors** = every author prefix in `data/raw/ccel/` with **≥3 works**, minus Spurgeon.
3. **Assignment is deterministic and blind**: sort eligible authors alphabetically; even index →
   **SET 1 (derivation)**, odd index → **SET 2 (validation)**. Chosen before seeing any author's
   content so a favourable split cannot be picked.
4. **Author-disjoint, not merely document-disjoint.** An author's quoting habits are the confound;
   splitting one author's works across both sets would leak the thing being validated.
5. **Caps, to keep the run bounded and no author dominant:** at most **4 works per author** (first 4
   alphabetically) and at most **60 eligible documents per set**, taken in a deterministic order.
   Both sets must reach **≥3 authors** and **≥25 documents** or the run is reported as
   UNDERPOWERED rather than as a result.

## The decision rule, fixed now

- **On SET 1:** sweep K = 1..8. Choose **the smallest K whose mean precision ≥ 0.60.** The 0.60 bar
  carries over from the Slice 0 PRECISION RUN legitimately, because precision is defined identically
  there (same gold, same ratio). Recall is *reported at every K*, never used to pick K.
- **No recall bar is carried over.** ADR-103 is explicit that this recall has a different
  denominator from Slice 0's and the two are not comparable. Inventing a bar for it after the fact
  is exactly the move this pre-registration exists to prevent. Recall is reported and read.
- **On SET 2:** at the K chosen on SET 1, **mean precision must be ≥ 0.60**. If it is not, K did not
  transfer, the derivation is VOID, and the shipped K stays unset pending a wider set.
- **Also reported, not gated:** the exclusion rate (documents with |gold| = 0, and with
  0 < |gold| < 5). ADR-103's paper notes this may be the headline finding on a modern corpus.

## What this run cannot establish

- Nothing about **paraphrase**. Gold is verbatim by construction, so a document that argues about a
  passage while quoting little of it is invisible to both this metric and the old one. ADR-103
  records this as the bound on the whole approach; it is the semantic spine's territory.
- Nothing about **translation detection** — see Index above.
- Nothing about **modern translations**. The corpus here quotes the AV; a modern preacher quoting
  ESV/NIV is structurally out of reach and always will be.

## Reproduce

```
BIBLE_DIR=web/public/bible CCEL_DIR=<abs path to data/raw/ccel> \
  npx tsx scripts/measure-k-rederivation.mts
```

Output: `docs/evidence/lane-b-slice1/k-rederivation-RESULT.md`.
