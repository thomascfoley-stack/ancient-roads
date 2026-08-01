# Tranche B-1 — K re-validation: RESULT

**K WAS NOT RE-VALIDATED. No K number was produced, and none should be quoted from this run.**

The set could not be built. Per `PRE-REGISTRATION.md` §3a third branch, that outcome is itself the
finding, and per §2 the harness may not be changed to rescue the run.

**Status: B-1 NOT DONE. Gate B0a stays open. The circularity the design doc flagged is still open.**

---

## 1. What was attempted

Build a fresh held-out set to the committed rules — not Spurgeon, not CCEL vols 10/13, ≥3 authors,
none above 40%, ≥2 registers — and run the frozen harness over it once.

Eligibility, per §3 rule 5, is mechanical: a document is in **iff the frozen harness's stated-text
marker regex finds ≥1 stated text**. That regex, copied verbatim from `scripts/slice0-precision.mts`:

```js
/["'”’][.,*]{0,3}\s*[—-]{1,3}\s*([1-3]?\s?[A-Z][A-Za-z]{2,})\.?\s+(\d{1,3}):(\d{1,3})/
```

Candidates were enumerated from CCEL in fixed order: Wesley, Edwards, Whitefield (Ryle and Moody
returned HTTP 404 and were skipped without inspection).

## 2. The measurement

| author | source | lines | **epigraph matches** |
|---|---|---|---|
| **Spurgeon vol 10** (Slice 0 material) | `ccel/s/spurgeon/sermons10` | 38,791 | **20** |
| **Spurgeon vol 13** (Slice 0 material) | `ccel/s/spurgeon/sermons13` | 39,864 | **43** |
| Wesley | `ccel/w/wesley/sermons` | 66,942 | **0** |
| Edwards | `ccel/e/edwards/sermons` | 18,246 | **1** |
| Whitefield | `ccel/w/whitefield/sermons` | 30,974 | **0** |

**Spurgeon: 78,655 lines → 63 matches. Everyone else: 116,162 lines → 1 match.** Edwards' single hit is
a quotation inside a sermon body, not a stated-text header, so the eligible-document count for the new
set is **zero**.

Floor was n=20. **Achieved n=0.**

**The positive control fires**, which is what makes this a finding rather than a broken instrument
(THE_LOOP rule 3 — kill the broken instrument before you report). The same regex, in the same run,
against the material the harness was built on, matched 63 times. The harness works. Its **reach** is
the problem.

## 3. Why — and this is the part worth keeping

The three authors are not missing their sermon texts. **They state them in the opposite order.**

| author | how the stated text appears |
|---|---|
| **Spurgeon** | `"Escape for thy life."--Genesis 19:17.` — **quote, then reference** |
| **Edwards** | `Deuteronomy 32:35 -- Their foot shall slide in due time.` — **reference, then quote** |
| **Whitefield** | `Genesis 3:15 -- "And I will put Enmity between thee and the Woman..."` — **reference, then quote** |
| **Wesley** | `Almost Christian, The (Sermon 2)--Acts 26:28` — title, then reference; no quote at all |

The regex requires a **closing quote character before the dash**. Every non-Spurgeon author here puts
the reference first, so no quote precedes the dash and the pattern cannot match — 1,080 lines in Wesley,
365 in Edwards and 125 in Whitefield carry a `Book Ch:V` reference that the eligibility rule cannot see.

**So the parser is not stated-text-aware. It is Spurgeon-CCEL-typography-aware.** Ordering is a house
style, not a property of sermons.

## 4. What this means for the K number that already exists

**The eligibility rule selects for Spurgeon by construction.** Any set built by this rule — including
Slice 0's "held-out" n=30 and n=44 sets — is drawn from the same narrow population, because the rule
admits essentially nothing else.

That sharpens the design doc's own caveat rather than answering it. The worry was that **K was read off
the same set that measured it**. The stronger statement now supported: **K was read off the only
population this harness can currently see.** Re-running it on more CCEL Spurgeon volumes would satisfy
the letter of "a further held-out set" and change nothing about the circularity, which is precisely the
trap §3a was written to name in advance.

**The existing numbers are not withdrawn.** K=3 → 75% recall / 96% precision stands as measured. Its
scope is now explicit and narrower than it read: **Victorian Spurgeon, CCEL typography, quoting the
KJV.** Nothing here contradicts it; what is missing is any evidence it generalises.

## 5. What was NOT done, deliberately

**The parser was not widened.** `PRE-REGISTRATION.md` §2: *"If the harness needs a change to run at all
on the new set, that is a finding and the run is void — it would mean the harness only worked on the
material it was built against, which is the same circularity one level up."* Adding a
reference-then-quote branch would have produced a K number today, and that number would have come from
a harness modified after seeing the data it failed on. That is the fitted result this tranche exists to
prevent, arrived at by a longer route.

No corpus was ingested into any database. Texts were fetched read-only from CCEL (public domain,
an accepted primary source under `CLAUDE.md`) and are not committed — only the counts above.

## 6. The product consequence, which is larger than the tranche

`PRE-REGISTRATION.md` §3a pre-committed the limit: the product is pastors uploading **their own**
sermons — modern prose, most likely **no epigraph line at all**, quite possibly not KJV.

This run makes that concrete and worse than anticipated. The eligibility rule cannot read **Edwards or
Wesley** — two of the most-published preachers in English, in a clean PD edition, from the same century
band as its one success. It is not that modern sermons are a stretch for this parser; **three-quarters
of the classical corpus is already out of reach.**

The stated-text marker is used for **recall measurement only** — it is how the harness knows which
passage a document is about. It is not the retrieval mechanism, so this is not a defect in the uncited
shingle channel itself. But it means **recall cannot currently be measured on any document whose text
is not stated in Spurgeon's format**, which includes essentially every document a real user will upload.

## 7. Recommended next step — as a proposal, not a decision

Two options, in the order I would consider them:

1. **Widen the marker parser to accept reference-then-quote, then re-run B-1 under a fresh
   pre-registration.** Small, well-defined, and testable against a positive control that already exists
   (it must keep matching all 63 Spurgeon epigraphs). This is the cheap path to an actual K number on a
   genuinely diverse set. **It must be a new pre-registration** — this one is spent, and reusing it
   after seeing the failure would be fitting.
2. **Decide whether stated-text recall is the right metric at all** for a product whose documents will
   not state their texts. That is a design question, not a parser question, and it may be the more
   important one. If real user sermons carry no epigraph, the recall leg needs a different ground truth
   — human labelling on a small set, most likely — and the current metric quietly stops applying at the
   moment the product meets its users.

Neither is started. Both are outside this tranche.

---

**Reproduce:** fetch `https://www.ccel.org/ccel/{s/spurgeon/sermons10,s/spurgeon/sermons13,w/wesley/sermons,e/edwards/sermons,w/whitefield/sermons}/cache/*.txt`
and count matches of the regex in §1. No repo state is required.
