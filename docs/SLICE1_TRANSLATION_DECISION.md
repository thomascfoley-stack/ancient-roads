# B4 — the translation decision: options, costs, recommendation

> # ✅ RULED 2026-08-03 — see **ADR-100** in [`DECISIONS.md`](DECISIONS.md)
>
> **Option A, with per-document detection.** This paper's recommendation was adopted, with three
> things it left open now closed by the ADR:
>
> - The pre-registered bar is **end-to-end uncited-channel recall with detection running**, *not*
>   detector top-1 accuracy — the 18 translations are not equidistant, so top-1 accuracy scores a
>   harmless kjv↔akjv confusion the same as a catastrophic kjv↔web one (this paper's own §3).
> - **§2's open question** ("what detects it, and what happens when it is wrong?") is answered:
>   detection resolves to a **family**, the channel shingles against the family union when the top
>   two are within a margin, and a below-floor fallback to the KJV family is **recorded** in
>   `user_section_anchors.confidence` rather than applied silently.
> - Families are **derived from measured 6-gram overlap**, never hand-typed.
>
> The ADR carries its own UNVERIFIED flag: the within-family-overlap premise is reasoning, not
> measurement, and is the first thing step 3 measures.
>
> **§6 below is discharged separately** — the `SERMON_COMPANION.md` §3 table row is now struck in
> place with a pointer. B2 itself is untouched and still the owner's to say.

**Status: RULED — ADR-100 (2026-08-03).** Was: *DECISION PAPER, decides nothing.* Tranche B-2 of the
search programme order. The owner rules; this document existed so the ruling was possible. The
options, costs and numbers below stand as written and are **not** edited to match the ruling — the
rejected option's case is the record of what the decision cost.

**Why it exists:** `docs/SERMON_SEARCH_DESIGN.md` line 275 conditions Slice 1 on "the translation
decision (§ below)" — and the document ends at line 276. The section was never written. B4 has sat on
the gate board as an open owner decision that **could not be made**, because the options had never
been stated, costed, or named.

---

## 1. The finding that creates the decision

Measured in Slice 0, on the same documents, changing only the index shingled against:

| index | uncited-channel recall (chapter) |
|---|---|
| **KJV** — what Spurgeon actually quotes | **82%** |
| **WEB** | **65%** |

**A 17-point swing from the translation alone.** The design doc's own words: *"A verbatim 6-word run
doesn't survive a translation swap ('Doth the plowman plow' vs 'Does he who plows')."*

This is mechanical, not incidental. The uncited channel works by matching 6-word shingles of the
document's prose against verse text. Two translations of one verse share meaning and almost no
6-grams. Match against the wrong one and the channel does not degrade gracefully — **it goes quiet**,
and a quiet channel is indistinguishable from a document that quotes nothing.

**17 points is larger than the margin K=3 clears its recall bar by** (75% vs a 70% bar). The
translation choice can therefore erase the threshold decision underneath it. This is why it gates ship.

**18 translations ship** in `web/public/bible/`: akjv, anderson, asv, bbe, bsb, darby, geneva, kjv,
lsv, nheb, noyes, rotherham, rwebster, tyndale, ukjv, web, webster, ylt.

---

## 2. Option A — shingle against the user's translation

One index per user, selected by a setting or by detection.

**What it costs**

- **Something must choose the translation.** Two mechanisms, and the paper must say which:
  - *A setting.* Explicit, correct when set, and one more thing a user must get right before the
    product works. Silent default = silent mis-detection for everyone who never opens settings.
  - *Detection.* Infer from the document — e.g. score its prose against each of the 18 indexes and
    take the best. Costs 18× the shingle work per document at ingest, which is cheap and one-time.
- **The failure mode is silent and severe.** Mis-detect and recall drops ~17 points with **no error,
  no empty state, and no signal to the user**. They see a shorter list, not a broken one. This is the
  same class as the `model_slug` parity failure in `SLICE_1_DATA_MODEL.md`: a well-formed wrong
  answer, returned forever.
- **A document may quote more than one translation** — a preacher citing KJV in the pulpit and ASV in
  a footnote. Per-document single-choice cannot represent that.
- **A user's corpus is not homogeneous.** "The user's translation" is a property of a *document*, not
  of a person. A pastor's 20-year archive may cross translations mid-career.

**What it buys:** the smallest index, the fewest cross-translation collisions, and the cleanest
precision — the K curve measured in Slice 0 transfers directly, because it was measured this way.

**Open question this paper cannot close:** *what detects it, and what happens when it is wrong?*
Nothing in the tree detects translation today. If Option A is chosen, detection is a build item with
its own measurement — and its accuracy bar must be set before it is built, because a detector at 90%
accuracy silently costs ~1.7 points of recall on average and much more on the 10%.

---

## 3. Option B — shingle against all translations

One index over all 18; a verse matches if any translation of it matches.

**What it costs**

- **Index size ~18×.** Cheap in absolute terms (verse text is small) but not free in memory or build
  time, and it multiplies per user under the per-user brute-force model in `SERMON_SEARCH_DESIGN.md`
  §70.
- **Collisions multiply, and collisions are exactly what K exists to suppress.** This is the load-
  bearing objection. Slice 0's failure code: at K=1, **83% of false positives were single-6-gram
  incidental collisions**. Eighteen translations of one verse give eighteen chances for a common
  clause to collide, and translations are *correlated* — akjv, kjv, rwebster, ukjv, webster are all
  KJV-descended and share long runs verbatim. So the added shingles are neither independent nor
  uniformly distributed; they cluster exactly where collisions already happen.
- **Therefore K does not transfer.** The K curve (K=3 → 75% recall / 96% precision) was measured
  against a **single** index. Under all-translation shingling the precision at any given K is lower
  and the curve shifts right. **How far is measured nowhere.**

**What it buys:** no detection, no setting, no silent mis-detection, and correct behaviour on
mixed-translation corpora — the failure mode Option A cannot represent at all.

**The interaction that must be measured before this ships:** re-run the K trade curve under
all-translation shingling. If the viable K rises, recall at that K falls, and the ≥70% bar may not
survive. **Option B is not costed until that number exists.**

---

## 4. What each option costs to validate

Neither option is ready to rule on without one more measurement. Stated so the ruling can be made
with the cost attached, not despite it.

| | Option A (user's translation) | Option B (all translations) |
|---|---|---|
| New build | a detector or a setting | none |
| New measurement | detector accuracy, with a pre-registered bar | **K re-validated under all-translation shingling** |
| Does the Slice 0 K curve transfer? | **yes** — measured this way | **no** — must be re-measured |
| Failure mode | silent, ~17-point recall loss | noisier returns, visible as clutter |
| Mixed-translation document | cannot represent | handled |
| Blocks Tranche B-1? | no | **the K number B-1 produces is single-index only** |

**Note the sequencing consequence.** Tranche B-1 re-validates K against **KJV**, one index — the
pre-registration says so explicitly and holds translation fixed on purpose, because varying two
things at once measures neither. So **B-1's result is evidence for Option A directly, and evidence for
Option B only as an upper bound.** If Option B is chosen, K needs a third validation.

---

## 5. Recommendation

**Option A, with detection rather than a setting — conditional on a detector accuracy bar being set
and met before ship.**

The reasoning, exposed so it can be overruled:

1. **Option B's central cost is unmeasured and lands on the metric that decides the feature.** K
   exists to suppress collisions; Option B multiplies collisions in a correlated, clustered way. It
   may be fine. Nobody knows, and choosing it now means shipping on an unmeasured interaction.
2. **Option A's central cost is measurable in advance.** Detector accuracy is a number you can put a
   bar on and test on held-out documents before writing the feature. A known-measurable risk beats an
   unmeasured one.
3. **Detection over a setting**, because the translation is a property of the document, not the user
   — and a per-document decision is the only one that survives a mixed archive. A setting also fails
   silently for every user who never opens it, which is most of them.
4. **Detection is cheap where it runs.** Scoring a document's prose against 18 indexes at ingest is
   the same shingle work already done, ×18, once per document, off the request path.

**What would change this recommendation:** measure the K curve under all-translation shingling. If
precision at K=3 holds above 60% with recall above 70%, Option B becomes clearly better — it removes a
whole class of silent failure for no measured cost. That measurement is small and well-defined, and it
is the honest next step if the owner prefers B.

**What must not happen:** shipping either option on the strength of Slice 0's KJV numbers. Those were
measured under Option A conditions against a corpus that quotes KJV.

---

## 6. Also settled by this decision — a stale contradiction

`docs/SERMON_COMPANION.md` §3 still names **"Jina v3 (already chosen)"** as the embedding model, while
gate B2 on the programme sheet asks the owner to confirm **DeepInfra `bge-large-en-v1.5`**. Two
documents name different committed models. This is not the translation decision, but it sits in the
same paragraph of the same gate and has the same shape: **an unwritten decision that a later document
treated as settled.** Whichever model is confirmed, the loser must be struck from `SERMON_COMPANION.md`
rather than left as a second answer.

Consequence if it is not: `SLICE_1_DATA_MODEL.md` requires refusing to join user vectors whose
`model_slug` ≠ the corpus's. With two documents naming two models, the constant that check reads is
ambiguous — and a parity failure returns plausible, wrong results with nothing thrown.

---

## 7. What this paper does not do

It does not decide. It does not measure — every number here is quoted from Slice 0, not re-run. It
does not build a detector, and it does not touch the shingle harness, which is frozen for Tranche B-1.

**UNVERIFIED:** the 18-translation collision-rate claim in §3 is reasoning from Slice 0's failure code
(83% of K=1 false positives were single-6-gram collisions) plus the fact that five shipped
translations are KJV-descended. It is **not measured**. If Option B is under serious consideration,
measure it rather than citing this paragraph.
