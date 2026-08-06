# PRE-REGISTRATION v2 — re-deriving K under ADR-103's metric

**Supersedes `k-rederivation-PRE-REGISTRATION.md` (v1, committed 541b98e).** Written and committed
before the v2 run.

## Why there is a v2, stated plainly

v1's run **completed and was UNDERPOWERED by v1's own floor**: SET 1 drew 2 authors against a
required ≥3. The cause was a rule of mine, not the data. v1 said a set is capped at 60 documents and
filled "in a deterministic order"; I implemented that author-by-author, so the first two authors
supplied 60 documents and the loop never reached a third.

That is the B-1 failure — an eligibility rule that selects for the population it was built on —
reproduced by my own fill order. Turning one author into two is not the fix ADR-103 asked for.

**What changes: the fill order, and nothing else.** Round-robin across authors instead of
author-by-author, so the cap distributes rather than concentrates.

**What does NOT change:** the metric, the gold definition, the eligibility floor, the K sweep, the
0.60 precision bar, the "smallest K clearing it" rule, the absence of any recall bar, the
author-disjoint blind alphabetical split, and the void conditions. All are carried over from v1
verbatim.

## The circularity risk, named rather than hidden

I have now seen v1's numbers (K=2 cleared on both sides). Re-running with a different set-selection
rule after seeing a result is exactly the shape of tuning-to-the-test, so the mitigation is stated
and checkable:

- **The decision rule is untouched.** K is still the smallest K whose SET 1 precision ≥ 0.60, and
  validation is still SET 2 precision ≥ 0.60 at that K. Neither number was moved toward v1's answer.
- **The change makes the sets HARDER, not easier** — more authors means more stylistic variety for K
  to survive, which is the direction that can only make transfer less likely.
- **v1's numbers are preserved in full** in `k-rederivation-RESULT-v1-UNDERPOWERED.md`, so if v2
  lands on the same K a reader can see it was not quietly re-rolled until it agreed.
- **If v2 chooses a different K from v1, v2's is the one that counts**, because v1 never met its own
  floor. That is committed here, before v2 runs, so the choice cannot be made afterwards.

## The rule, in full (v1 verbatim except where marked CHANGED)

- **Document** = one CCEL unit from `buildCcelSections`, body ≥ 4,000 characters.
- **Gold** = verse has an ≥8-word verbatim run in the body (≥1 shared 8-gram), independent of K.
- **Returns** = ≥K shared 6-grams, `minVerseShingles = 3`.
- **Precision** = |returns ∩ gold| / |returns| per document, averaged. **Recall** = |returns ∩ gold|
  / |gold| per document, averaged.
- **Eligibility** = |gold| ≥ 5. No epigraph required.
- **Index** = KJV, stated on every run. Detection is not part of this measurement.
- **Sets:** authors with ≥3 works in `data/raw/ccel/`, excluding Spurgeon; sorted alphabetically;
  even index → SET 1, odd → SET 2. Author-disjoint.
- **CHANGED — fill:** documents are taken **round-robin across the set's authors** (one document
  from each author in turn, cycling) until the cap. Within an author, works in alphabetical order
  and units in document order. Deterministic, and it distributes the cap.
- **CHANGED — caps:** at most **6 works per author** and **90 documents per set** (raised from 4/60,
  because round-robin over more authors needs more room to reach the same depth per author).
- **CHANGED — floor:** ≥**5** authors and ≥25 documents per set, raised from 3. v1 showed 3 was low
  enough to be met by an accident of ordering; 5 forces genuine variety.
- **Void conditions, unchanged:** no K clears 0.60 on SET 1 → derivation void. K fails to transfer
  to SET 2 → derivation void, shipped K stays unset.
- **Reported, not gated:** exclusion rates (|gold| = 0, and 0 < |gold| < 5).

## Reproduce

```
BIBLE_DIR=web/public/bible CCEL_DIR=<abs path>/data/raw/ccel \
  npx tsx scripts/measure-k-rederivation.mts
```

Output: `docs/evidence/lane-b-slice1/k-rederivation-RESULT.md`.
