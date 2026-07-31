# Tranche B-1 — K re-validation: PRE-REGISTRATION

**Written and committed BEFORE any document of the new set was fetched, parsed, or looked at.**
That is the whole point of the tranche, so the ordering is the evidence: this file's commit must
precede the commit carrying any result. If they land together, the pre-registration is worthless and
this run should be discarded.

---

## 1. Why this run exists

`docs/SERMON_SEARCH_DESIGN.md`, PRECISION RUN caveat (1), states the defect in its own result:

> **K was read off *this* held-out set** — the K choice itself should be validated on a further
> held-out set before it ships (recommend K=3).

The trade curve (K → recall, precision, returns/sermon) and the recommendation K=3 come from the
**same** CCEL vols 10+13 material. Choosing the threshold on the set that measured it is mildly
circular: the reported 75%/96% at K=3 is a fitted number, not a forecast. A threshold is defensible
when it holds on documents that played no part in choosing it.

**This run does not re-choose K.** It tests a threshold chosen in advance against unseen documents.

## 2. The harness is frozen, and that is git-verified

| artifact | commit | modified since |
|---|---|---|
| `scripts/slice0-precision.mts` | `56b2967` | **never** — one commit, `git log --follow` |
| `scripts/slice0-anchor-recall.mts` | `6ecf24f` | **never** — one commit, `git log --follow` |
| `src/ingest/resource-textmatch.ts` (shingle primitives) | `d3bd062` | not since |

No parameter, regex, shingle length, window, or bar may change after this file is committed. If the
harness needs a change to run at all on the new set, **that is a finding and the run is void** — it
would mean the harness only worked on the material it was built against, which is the same circularity
one level up.

Translation stays **KJV** (`BIBLE_TR=kjv`), as in Slice 0. Shingling against the user's translation or
all translations is Tranche B-2's question and is explicitly **not** varied here — varying two things
at once measures neither.

## 3. The set — composition stated as RULES, before seeing candidates

Slice 0's held-out set was a monoculture: 30 Spurgeon sermons, CCEL vols 10 + 13 — **one author, one
register, one century, one translation, clean PD text.** A threshold validated only there is validated
for Spurgeon.

**Inclusion rules (objective, applied before reading any body text):**

1. **Public domain**, from an accepted primary source (`CLAUDE.md`: SWORD/CrossWire, Wikisource,
   archive.org, CCEL, STEP Bible). **Never** BibleHub or StudyLight.
2. **Not Spurgeon**, and not from CCEL vols 10 or 13. Zero overlap with any Slice 0 material.
3. **≥3 distinct authors**, no author contributing more than **40%** of the set.
4. **≥2 registers**, and **at least one document type Slice 0 never tested** — a `paper`, `notes`, or
   `book` chapter rather than a preached sermon. The design doc claims to serve these; none has ever
   been measured.
5. **Eligibility is mechanical:** a document is in iff the frozen harness's stated-text marker regex
   finds **≥1** stated text in it. This is the harness's own parser, unmodified. A document it cannot
   parse is **excluded and counted**, never hand-repaired — the parse-failure rate is itself a
   reportable number (`SERMON_SEARCH_DESIGN.md` §127 names it as a production metric).
6. **Target n = 30**, floor **n = 20**. Below 20 the run is reported as underpowered and does not
   carry a ship decision.

**Selection is by rule, not by taste.** Candidates are enumerated from the source in a fixed order and
taken until n is reached; no document is dropped after its content is read.

### 3a. What the set is EXPECTED to contain — and the scope limit if it does not (added before the set was built)

The eligibility rule in (5) is mechanical, which is right, but it keys on a **stated-text epigraph** —
`"For God so loved the world…" — John 3:16` — and that is a **19th-century publishing convention**, not
a property of sermons. The rule is therefore biased toward exactly the material Slice 0 already used.

**Expected composition, stated in advance so the outcome can be compared against it:** at least three
authors, none above 40%, drawn from Victorian/Reformation-era preached sermons (Wesley, Edwards,
Whitefield, Moody, Ryle and similar), plus at least one non-sermon document type. **Expected weakness:**
every candidate is likely Anglophone, pre-1950, and quoting the KJV or close to it.

**The result must report author composition, era and document type alongside the number.** A bare
recall/precision pair is not a reportable result for this run.

**Scope rule, pre-committed:**

- If the set is **≥3 authors and ≥2 registers** as required, the result reads: *K holds on unseen
  documents across authors and registers.*
- If the set collapses toward **one author** — Spurgeon or anyone else — the run is **still executed and
  still reported**, but its conclusion is downgraded, in these words: ***K holds for this genre***, not
  *K holds*. A fresh sample of the same author is a fresh sample, not a fresh population, and the
  circularity the design doc worried about would then be only partly addressed.
- If the set cannot meet ≥3 authors at all, that is itself the finding: **the frozen parser's
  eligibility rule cannot reach a diverse population**, which is a defect in the harness's reach, not
  in K.

**The limit this run cannot escape, stated now rather than discovered later.** The product is pastors
uploading **their own** sermons: modern prose, most likely **no epigraph line at all**, and quite
possibly quoting the ESV or NIV from memory rather than the KJV. Every document this run can admit is,
by construction, one the epigraph parser can read — so the set is drawn from a population the target
users are **not** in. A K validated here transfers to Victorian preachers quoting the KJV. Whether it
transfers to a 2026 sermon is **not measured by this run and cannot be**, because:

1. the eligibility rule excludes documents with no stated text, which is most modern sermons;
2. the harness is KJV-only here by design (Tranche B-2's question), and Slice 0 measured a **17-point**
   swing from translation alone.

**Consequence, pre-registered:** even a fully CONFIRMED result does **not** discharge "K is right for
the product." It discharges "K was not fitted to the set that chose it." Those are different claims and
only the second is being tested. The modern-prose, no-epigraph, non-KJV case needs its own set and its
own run, and that work is **not** created or closed by this tranche.

## 4. Bars — carried over, NOT re-chosen

Identical to Slice 0's pre-registered bars. Re-picking bars for a re-validation would defeat it.

| metric | bar | definition |
|---|---|---|
| recall (chapter) | **≥ 70%** | the stated text's chapter is among the returned verses' chapters |
| precision (sermon-avg) | **≥ 60%** | \|returns ∩ gold\| / \|returns\|, averaged over documents |

**Gold is unchanged and independent of K:** a document genuinely engages a verse iff its body contains
an **≥8-word verbatim run** of that verse.

## 5. The decision rule — written now, so the result cannot choose it

**K = 3 is the hypothesis under test** (the design doc's recommendation). The run reports the full
curve for K ∈ {1,2,3,4,5}, but the decision is made only about K=3:

- **CONFIRMED** — at K=3, recall ≥70% **and** precision ≥60% on the new set. K=3 ships.
- **NOT CONFIRMED** — at K=3, either bar is missed. **This is a design finding, not a tuning
  opportunity.** Per the order's STOP condition 3, the correct response is to report it and stop, not
  to read a better K off this set. Doing that would recreate exactly the circularity this run exists
  to remove, one set later.
- If K=2 clears on the new set while K=3 does not, that is **reported as an observation and is not a
  recommendation.** Any K chosen off this set needs its own further validation.

Additionally pre-registered, because a point estimate is not a result: report the **95% CI** on recall
(Wilson) and state whether the **lower bound** clears 70 — the standard Slice 0's confirmation run
itself used ("the CI lower bound (74%) is above the pre-registered 70% bar — so recall is confirmed,
not 'probably clears'").

## 6. Stopping rule

**Run once.** One invocation of the frozen harness over the frozen set. No re-runs, no set edits after
seeing output, no parameter changes. If the run errors for an environmental reason (missing Bible
files, unreadable input), the fix is environmental only, recorded, and the run repeats — a harness or
set change ends the run instead.

## 7. What the result will NOT mean — stated in advance

These caveats are pre-committed so they cannot be quietly dropped when the number looks good.

- **Gold undercounts.** `≥8-word verbatim run` misses short quotes, paraphrase, and orthographic
  variants, so **precision is a LOWER BOUND**, not an estimate. A returned verse counted false may be
  a real paraphrased engagement.
- **Recall is measured against the STATED text only** — the one passage a document announces — not
  against every passage it engages. It is "did we find the thing it is about", not "did we find
  everything in it". Those are different questions and only the first is measured.
- **Precision is document-averaged**, so a short document weighs as much as a long one.
- **KJV only.** Slice 0 measured 82% against KJV and 65% against WEB on the same material. Any
  document quoting a non-KJV text will under-recall here, and that is B-2's question, not evidence
  about K.
- A clean result validates **the threshold**, not the feature. The semantic channel for the paraphrase
  residual remains unbuilt and unmeasured.

## 8. Rails in force

No production connection. No database writes. No merge. Corpus fetched read-only from PD sources;
nothing ingested into any database. Fixer ≠ verifier — this run does not certify itself.

---

**Committed before data.** The next commit touching this directory carries the set manifest and the
result. If this file and the result share a commit, discard the run.
