# PRE-REGISTRATION — translation families for ADR-100

**Written and committed BEFORE the measurement was run.** Nothing below was chosen after seeing a
number. If the run needs any change here to complete, that is a finding and the run is void.

## Why this exists

ADR-100 ruled B4: the uncited-quote channel shingles against the translation **family** detected per
document, unioning within the family when detection is ambiguous. The ADR carries its own UNVERIFIED
flag, in its own words:

> the premise under decision 3 — that within-family 6-gram overlap is high enough to make the union
> nearly free — is **reasoning, not measurement** … It is the first measurement of step 3 and it is
> pre-registered here: if within-family union materially moves precision at K=3, the union rule is
> wrong and single-translation-plus-fallback is the answer instead.

Two claims are on trial, and they are separable:

1. **The families exist.** Translations cluster into groups that share wording, rather than being
   uniformly dissimilar.
2. **Union within a family is cheap.** Unioning a family's shingles adds few *new* 6-grams over its
   largest member — which is what makes ADR-100's fallback affordable, and what distinguishes it
   from Option B (unioning across families), whose cost `SLICE1_TRANSLATION_DECISION.md` §3 records
   as never measured.

Claim 2 is the load-bearing one. Claim 1 could hold while claim 2 fails, and ADR-100 would still be
wrong.

## The metric

- **Shingles:** 6-gram hashed shingles from `src/bible/uncited-shingle.ts`, the same tokeniser and
  the same `n` the anchor channel uses. Not a separate implementation — a family measured with
  different tokenisation than the channel would be measuring nothing the channel experiences.
- **Population:** every verse id present in **both** translations of a pair. Verse coverage differs
  slightly between translations (measured earlier: kjv 31,102, web 31,103, asv 31,086), and pairing
  on the intersection avoids charging a translation for verses the other does not have.
- **Similarity:** mean per-verse **Jaccard** — `|A ∩ B| / |A ∪ B|` over each verse's shingle sets,
  averaged across the paired population. Verses where both sets are empty are excluded (they carry
  no information); verses where exactly one is empty count as 0.
- **Union cost (claim 2):** for a family F, `|⋃ sh(t) for t in F| / max(|sh(t)| for t in F)`,
  computed over the whole Bible. A ratio of 1.0 means union is free; 2.0 means it doubles the index.

## The clustering rule, fixed now

- Two translations are in the same family iff mean Jaccard **≥ T**, with **T = 0.50**.
- Families are the connected components of that relation (single-linkage).
- **T = 0.50 chosen a priori** because a 6-gram is a demanding unit: sharing half of all 6-word runs
  across the whole Bible is already a strong claim of near-identical wording, and anything below
  half is not "the same text in a different edition". It is a round number chosen for being
  defensible in advance rather than tuned, which is the point.
- **Sensitivity is reported at T = 0.40 and T = 0.60** so the reader can see whether the answer
  hangs on the threshold. Sensitivity is *reported*, never used to pick T after the fact.

## The pre-registered expectation, so this can falsify the ADR

`SLICE1_TRANSLATION_DECISION.md` §3 and ADR-100 both assert that **akjv, kjv, rwebster, ukjv and
webster are KJV-descended and share long runs verbatim.**

- **Expected:** those five fall in one family at T = 0.50.
- **FALSIFIED IF** they do not. In that case ADR-100's family premise is unsupported by the texts it
  is about, and the union rule must be withdrawn in favour of single-translation detection plus a
  recorded fallback. That is a real possible outcome of this run, not a formality.

## Bars for claim 2, set now

- **Union cost ≤ 1.25** for the KJV family → the union is cheap; ADR-100's decision 3 stands.
- **Union cost > 1.50** → the union is NOT nearly free; ADR-100's decision 3 is withdrawn and the
  channel shingles against a single detected translation, with the fallback recorded in
  `user_section_anchors.confidence` as already built.
- **Between 1.25 and 1.50** → inconclusive; the decision goes to the owner with the number attached,
  and the channel ships single-translation until then.

## What this run does NOT establish

- Nothing about **detection accuracy**. This measures whether families are a coherent object, not
  whether a document's family can be identified. That is a separate measurement with its own bar
  (ADR-100: end-to-end channel recall with detection running, not detector top-1 accuracy).
- Nothing about **recall or precision**. Those are §4's job, under ADR-103's metric.
- Nothing about translations we do not hold. ESV/NIV/NASB/CSB are structurally out of reach and
  always will be.

## Reproduce

```
BIBLE_DIR=web/public/bible npx tsx scripts/measure-translation-families.mts
```

Output is written to `docs/evidence/lane-b-slice1/translation-family-RESULT.md`.
