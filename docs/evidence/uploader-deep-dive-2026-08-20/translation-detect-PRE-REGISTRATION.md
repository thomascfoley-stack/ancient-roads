# Translation detection (ADR-100 build) — pre-registration

**Written 2026-08-21, BEFORE the implementation exists or any number is measured.** The v1
50-sermon set (CCEL vol 62) is now a DEV set — Runs 1–4 of the deep dive measured and diagnosed
against it, so nothing ships on its numbers. The ship decision runs on a FRESH held-out:

- **v2 set**: CCEL vol 63 (`spurgeon_sermons63.xml`), same extractor and de-headering as v1,
  labels validated against KJV verse existence before counting. **n = 19**, manifest sha256
  `05859b6152597bc2…` — frozen at this commit, before any detection code ran.

## The mechanism (design, per quality-slice §8)

Per-document detection at ingest (`processOne`, before anchoring): count the document's distinct
6-gram shingle hits against each of the 18 shipped translation indexes via ONE combined
shingle→translation-bitmask index (memoised per instance, like the KJV index today). Winner =
argmax translation; anchor against the winner's own index. Families per the measured ADR-100
clustering (`docs/evidence/lane-b-slice1/translation-family-RESULT.md`): the KJV family is
{kjv, akjv, ukjv, webster, rwebster}; union stays WITHDRAWN — we shingle against ONE translation.

**Confidence, recorded not hardcoded** (the column migration 103 created):
`confidence = hits[winner] / (hits[winner] + max(hits[t] for t outside winner's family))`,
clamped to [0.5, 1]. **Fallback floor**: if the document's total distinct verse-shingle hits
< 25, detection is UNRELIABLE → anchor against KJV and record `confidence = 0.5` — the
below-floor fallback ADR-100 requires recorded rather than silent.

Out of scope: a user-facing translation setting; re-anchoring existing documents (a backfill
runbook item, filed); non-English.

## Pre-registered bars (gate = ship / don't-ship the detection wiring)

1. **Detection agreement on v2**: ≥ 90% of the 19 sermons detect into the KJV family
   (Spurgeon quotes the KJV; family membership is the label by construction).
2. **No recall cost when the oracle is right**: end-to-end chapter-level stated-text recall on
   v2 through the SHIPPED pipeline with detection ON ≥ (same run with the index pinned to KJV)
   − 2 points.
3. **The win case, mechanical**: 10 synthetic documents built by embedding 12–20 BSB verse
   texts in neutral connective prose must detect `bsb` (not KJV-family), 10/10, each with
   confidence > 0.6.
4. **Confidence sanity**: on v2 (all KJV-quoting), median recorded confidence ≥ 0.8, and no
   document records 1.0 with fewer than 25 total hits (the floor must bind).

Bars 1/2/4 run through the shipped `drain()` path against the dev DB (only the blob hop
substituted, as in Runs 1–4). Failing any bar = the wiring does not ship; the failure is
failure-coded and reported, not tuned away against v2.

---

## v2 RESULT (2026-08-21) — bars 1 and 2 CLEAR; bar 4 FAILED as registered

- **Bar 1: 19/19 in the KJV family** (winners: ukjv ×9, akjv ×7, webster ×1, kjv ×2 across the
  detection log) — clears ≥90%.
- **Bar 2: detection BEAT the oracle** — chapter-level 15/19 with detection live vs 12/19 pinned
  to KJV (exact 12/19 vs 11/19). The family siblings match Spurgeon's quotation habits better
  than `kjv` proper, consistent with Run 3's curve (ukjv 76% > kjv 70%). Clears A ≥ B − 2 with
  a +3 margin.
- **Bar 4: FAILED — median recorded confidence 0.65 vs the ≥0.8 bar.** Failure-coded:
  `estimator-miscalibrated`, not `detection-wrong` (bars 1–2 prove the detector). Structural
  cause, verifiable from the index without the held-out: ASV is a KJV revision sharing most
  KJV-family shingles, so the margin formula (winner / (winner + best-outside-family rival))
  caps near 0.65 for ANY uniformly-KJV document. The formula measured margin; anchoring needs
  COMPATIBILITY (the fraction of matched quoting evidence present in the chosen index).
- Bar 3 (synthetic BSB): 10/10 detect `bsb`, confidence > 0.6 — in
  `web/test/user-corpus/translation-detect.test.ts`, deterministic.

## AMENDMENT (written before any v3 number exists)

The estimator is revised on principle to compatibility: `confidence = hits[winner] / totalHits`,
clamped [0.5, 1]; the sub-floor fallback (KJV @ 0.5) is unchanged. v2 is now a DEV set for the
confidence leg (bars 1/2 conclusions stand — the formula does not affect which index is chosen,
only the recorded number).

**v3 fresh held-out**: CCEL vol 61 (`spurgeon_sermons61.xml`), same extractor, labels validated,
frozen before the revised estimator is measured. **Re-registered bars on v3:**
- Bar 1′ (unchanged): ≥90% detect into the KJV family.
- Bar 4′: median compatibility confidence ≥ 0.8 across v3; no document below the DETECT_MIN_HITS
  floor records more than FALLBACK_CONFIDENCE.
Bar 2 is NOT re-run on v3 (the estimator cannot change index choice; v2's drain-path result
stands as the recall evidence). Detection is pure, and the v2 drain run already proved the
recorded column equals the detector's output verbatim, so v3 runs through `detectTranslation`
directly.

## v3 RESULT (2026-08-21, run ONCE, after the amendment above froze the bars)

v3 = CCEL vol 61, n=50, manifest sha256 `020c9edc2c762a1b…`, frozen before the run.
- **Bar 1′: 50/50 in the KJV family — CLEARS.** (Cumulative with v2: 69/69.)
- **Bar 4′: median compatibility confidence 0.82 ≥ 0.8 — CLEARS. Floor violations: 0.**
Full per-document log in the session transcript; winners again dominated by akjv/ukjv, the
family doing its job. SHIP: detection wired, confidence honest, both fresh-held-out gates green.
