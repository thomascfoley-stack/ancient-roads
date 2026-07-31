# B-1 follow-up — is stated-text recall the right metric?

**A paper, not a run. No data was fetched, and none may be until this is ruled on.** Written before
the marker parser is touched, because widening the parser presumes the metric it serves is the right
one, and that question comes first.

**Verdict up front: the proposed metric SUPERSEDES stated-text recall for the ship decision, and
stated-text recall should be KEPT as a narrow regression check. The argument in the order is right,
and one part of it is stronger than stated. But it does not delete the parser problem — it relocates
it.**

---

## 1. The argument, as put to me

> The stated-text marker is not a product feature — it is a labelling mechanism for the eval. The
> product never needs it: a pastor uploading a sermon can declare its text. What the product actually
> needs is not "does it recover the one passage the header names" but "does it recover the passages
> the document verifiably engages" — close to what the PRECISION RUN's gold already used, an ≥8-word
> verbatim run. That ground truth needs no epigraph, so it works on Wesley, Edwards, Whitefield, and
> on a modern sermon.

## 2. Where it is right, and one place it is stronger than stated

**Right, and decisive: the metric and the population are currently coupled through the parser.**
B-1's measurement was 63 epigraph matches across 78,655 lines of Spurgeon versus **1** across 116,162
lines of Wesley/Edwards/Whitefield. Stated-text recall cannot be measured outside one publisher's
house style, so *every* number it produces is scoped to that style. That is not a defect in the
threshold; it is a ceiling on what the metric can ever say.

**Right: the marker is scaffolding, not product.** Nothing in the serving path reads it. It exists to
supply ground truth. A labelling mechanism that restricts which documents can be labelled is a
measurement problem, and measurement problems are fixable by changing the measurement.

**Stronger than stated — the two metrics do not merely differ in coverage, they ask different
questions.** Stated-text recall asks *"did we recover the one passage the document announces?"* The
product question is *"when a pastor asks 'have I written on Romans 8?', does Romans 8 come back?"*
A document engages many passages and announces at most one. Recall against the announced passage is
recall at n=1 per document — it cannot distinguish a system that finds one passage from a system that
finds all of them, and the announced passage is the *easiest* one, being quoted in full at the top.
**Stated-text recall is not a weaker sample of the product question. It is a different and easier
question**, and Slice 0's own 90% was measured on it.

## 3. Where it is not right, or not yet

**The gold is not free of the problem — it moves it.** ≥8-word verbatim run needs no epigraph, but it
still needs the document to quote **verbatim**, in **the indexed translation**. Slice 0 measured that
same mechanism at 82% against KJV and **65% against WEB** on identical documents. So the proposed
ground truth inherits the translation coupling wholesale. Against a modern sermon quoting the ESV from
memory, gold will be sparse or empty — and sparse gold does not read as "no engagement", it reads as
**precision 0/0 and recall undefined**, which is worse than a wrong number because it looks like an
error rather than a finding.

**It is circular in a way the current metric is not, and this needs care.** Stated-text recall's
ground truth is *independent of the matcher*: a human wrote the epigraph. The proposed gold is an
8-gram overlap, and the system under test returns verses on ≥K 6-gram overlaps. **Both are
substring-overlap tests on the same text, differing only in n and threshold.** The PRECISION RUN was
right that this is "independent of K" — it is — but independent-of-K is not independent-of-mechanism.
A verse the matcher cannot find at 6 grams is usually one gold cannot find at 8. **The metric will
systematically miss the failure mode it most needs to detect: paraphrase.** Slice 0 already named
paraphrase as the residual (the 3 misses at n=30 were "paraphrase/orthography").

That does not sink the proposal — it bounds it. Stated plainly: **this metric measures precision well
and recall only within the verbatim-quote population.** It cannot be the sole evidence that the
feature works.

## 4. What the metric would be

**Property:** for a document, the system returns the set of passages the document verifiably engages.

- **Ground truth (per document):** verse *v* is engaged iff the body contains an ≥8-word verbatim run
  of *v* in the indexed translation. Computed independently of K.
- **Returned set:** verse *v* is returned iff ≥K of its 6-word shingles appear in the body — unchanged.
- **Recall** = |returns ∩ gold| / |gold| — **note this is a different denominator from Slice 0**,
  whose recall was chapter-level against a single announced passage. The numbers are **not
  comparable**; do not put them in one table.
- **Precision** = |returns ∩ gold| / |returns| — same as the PRECISION RUN.
- **Eligibility:** any document with |gold| ≥ some floor. **No epigraph required**, which is the whole
  point. Documents with |gold| = 0 are *excluded and counted* — the exclusion rate is itself a
  reportable number, and on a modern non-KJV corpus it may be the headline finding.

**What K means under it.** Today K is chosen against a single announced passage. Under this metric K
trades recall against precision across *all* engaged passages, which is the trade the product actually
makes. **K would have to be re-derived, not carried over** — and re-derived on one set, then validated
on another, or B-1's circularity returns immediately in a new costume.

## 5. What it can and cannot establish

**Can:** that the uncited channel recovers verbatim engagement across authors, registers and
centuries, on any document with quotations — including Wesley, Edwards, Whitefield and a modern
sermon that quotes accurately. That is exactly what is unmeasurable today.

**Cannot:** anything about paraphrase (§3), anything about non-indexed translations, and anything
about documents that engage Scripture without quoting it — expository preaching that argues about a
passage while quoting little of it. That last class is plausibly common and is invisible to both
metrics.

## 6. Supersede or complement

**Supersede for the ship decision. Keep as a narrow regression check.**

Stated-text recall should not gate the feature: it is scoped to one house style, asks an easier
question, and its population cannot be widened without the parser work the order rightly questions.

But it should not be deleted, for one reason the proposal does not cover: **it is the only ground
truth in the system not produced by substring overlap.** A human wrote the epigraph. When the proposed
metric and stated-text recall disagree on the same Spurgeon documents, that disagreement is
information about the *gold*, not just the system — and with every other check being overlap-on-overlap
there is otherwise nothing to catch a systematically wrong gold. Keep it on the frozen Spurgeon set as
a cheap, independent sanity check; retire it as a gate.

**Cost of being wrong about this:** if the new metric ships as the gate and its gold is systematically
sparse on the real user population, K gets tuned against a biased sample and the feature ships tuned
for verbatim quoters. The mitigation is in §7 and it is not expensive.

## 7. What this implies for the parser, and what to do next

**The parser widening is NOT deleted — it is demoted.** Under the new metric no epigraph is needed for
the primary measurement, so widening stops being a blocker. It stays worth doing later, cheaply, only
to keep the §6 regression check alive on more than one author.

Recommended order, none of it started:

1. **Rule on this paper.** If accepted, the new metric becomes B-1's replacement.
2. **Pre-register it** — bars, K range, eligibility floor, exclusion reporting — before any set is
   built. `PRE-REGISTRATION.md` in this directory is the template and its §3a scope rule applies
   unchanged.
3. **Build the set to answer the population question first**: what fraction of *modern* sermons yield
   |gold| ≥ floor? If that fraction is low, the finding is that verbatim-overlap ground truth does not
   reach the product's users, and the next step is human labelling on a small set rather than a bigger
   automated one. **This is the cheapest possible refutation of the whole approach and should run
   first.**
4. Only then re-derive K, on one set, and validate it on another.

## 8. If the original metric was right and the argument is wrong

It is not wrong, but here is the strongest case against replacing it, recorded so the ruling is
informed: stated-text recall has **human-authored** ground truth, and every alternative on the table
is the matcher grading its own homework at a different n. If the true failure mode is paraphrase, the
new metric will report a *better* number than the old one while the product gets worse — because the
documents it can measure are precisely the ones the mechanism already handles.

**That is a real risk and §6's retained regression check is the mitigation.** It is not a reason to
keep gating on a metric that can only see one author.

---

**Nothing here was measured.** Every number quoted is from Slice 0 (`docs/SERMON_SEARCH_DESIGN.md`) or
from B-1's `RESULT.md`. No corpus was fetched for this document.
