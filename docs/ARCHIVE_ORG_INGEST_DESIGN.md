# archive.org ingest — design + parked forks (overnight)

**Status:** data CONFIRMED reachable; adapter design below; **three genuine forks PARKED for owner decision**
(never guessed). The mission — *new traditions* (Catholic/Anabaptist/Anglican/mystic) — lives entirely in
archive.org **fresh** ingest, and fresh ingest is where these forks bite. Provenance-*repair* of the existing
stored tail has none of them, but it adds no new tradition.

## Confirmed data (correct PD editions, ≤1929, right translators)
| Anchor | archive.org id | Edition | Note |
|---|---|---|---|
| Cornelius a Lapide — Great Commentary | `TheGreatCommentaryOfCorneliusALapideV5` (+ emory 1908 dupes) | **Mossman 1908**, multi-volume | Catholic ★ |
| J.C. Ryle — Expository Thoughts (Gospels) | `expositorythough05ryle` (01/05/06 = different Gospels) | **1857**, passage-structured | Anglican-Evangelical |
| Menno Simons — Complete Works | `completeworksofm00menn` | **Funk 1871** (NOT Wenger 1956 ✓) | Anabaptist — treatises, not verse-commentary |

OCR is readable but **noisy** (`J. C. E7LE` = Ryle, `]iew` = New, doubled spaces, `exa,ggerated`), and
Ryle is organized **by passage** (`JOHN I. 1-5` → prose), a Lapide **by verse**, Menno by **treatise**.

## Adapter design (reuse `SourceAdapter` + `resource-textmatch.ts`)
- **Fetch:** `GET https://archive.org/download/<id>/<id>_djvu.txt` (follow redirects; the derivative OCR).
- **OCR-tolerant match (owner's explicit requirement):** exact 4-gram shingles are broken by per-word OCR
  errors, so tolerance without weakening the guarantee = **3-gram shingle-hash containment** (short shingles
  survive an occasional bad char) over the existing `tokenList` normalization, at a **calibrated threshold**
  (a modern re-translation still fails it; two OCR scans of the *same* edition still pass). Calibrate the
  threshold on a known match (two scans of the same volume) vs a known non-match (Mossman vs a modern a
  Lapide) before trusting it — do NOT ship an uncalibrated threshold.

## THE THREE PARKED FORKS (owner decides — each would corrupt the corpus if guessed)

**FORK A — "shingle text-match proof" is undefined for a FRESH work.** The gate + `resource-textmatch` are
built for *repair*: match OUR stored text vs a PD reference. A brand-new tradition has **no stored text** to
match. What proves a fresh OCR ingest is the claimed PD edition and not a mislabeled modern one?
- *Options:* (a) **cross-copy containment** — match two independent PD scans of the same edition (a Lapide
  and Ryle both have multiple archive.org copies); high overlap ⇒ genuine edition. Defensible + automatable,
  and my recommendation. (b) match a sample vs an independent verbatim quotation of the edition (hard to
  automate). (c) trust archive.org metadata (translator+year) + record provenance, no text-match (weakest —
  violates the gate as written).
- **Need:** owner confirms (a) satisfies the "text-match proof" gate for fresh works.

**FORK B — OCR → verse-aligned entries is unreliable, and this corpus is VERBATIM.** Parsing noisy OCR into
`(verseId, text)` requires detecting passage/verse headers that the OCR itself mangles (`JOHN I. 1-5` →
`J0HN I . 1 5`), and it is per-work (a Lapide verse-by-verse, Ryle passage-ranges, Menno none). A wrong
boundary attributes one author's words to the wrong verse — a *verbatim/attribution* violation, the one thing
this product must never do. A reliable parser needs per-work structure detection + a validation pass
(spot-check aligned entries against the scan) before publish. That is a real slice, not a night's rush.
- **Need:** owner accepts that fresh verse-alignment ships **staged** (never auto-published) until a
  validation pass confirms alignment — i.e. fresh archive.org works are NOT covered by the auto-publish
  pre-authorization; only provenance-*repairs* (which don't re-parse) are.

**FORK C — non-verse `theology` works have no retrieval path.** Menno Simons + the mystics are treatises
(pipeline says tag `theology`, NOT verse-commentary). Retrieval is entirely `verseId`-keyed
(`LEGAL_CORPUS_FILTER`, the anchors, `selectDiverse`); there is no path that surfaces a non-verse `theology`
chunk in an answer. Ingesting Menno as `theology` today = content that is stored but never retrieved.
- **Need:** owner decides the `theology`/topical retrieval path (its own design) before ingesting non-verse
  works. Menno Simons is therefore **blocked on FORK C**, independent of A/B.

## POC evidence — the OCR match is load-bearing engineering, not a formality
Ran a quick cross-copy containment POC (3-gram shingle-hash, `resource-textmatch`) on real OCR:
- different works (a Lapide vs Ryle): **6.9–9.5%** (floor).
- two scans of the SAME Ryle volume, sampled by byte offset: **5.0%** — i.e. it did NOT discriminate (same-
  edition scored *below* different-work). Cause: two scans have different byte alignment (same offset ⇒
  different passages) and OCR noise fragments 3-grams (220k chars → only ~12k shingles). **Lesson:** naive
  containment on OCR fails; a real matcher must (1) align comparable *sections* (not byte offsets), (2)
  calibrate the threshold on aligned same-edition vs different-edition pairs. This is exactly FORK A's
  "calibrate before trusting" — it is load-bearing, and it is why I did not hand-wave a match score and ship.

## What was NOT done and why
No archive.org work was ingested or published tonight. Publishing noisy-OCR, possibly-misaligned text into a
**verbatim, attributed** corpus on a guessed match-proof would violate *quality over count*, *verbatim only*,
*never guess*, and the gate discipline — exactly the failure modes the rails forbid. The reachable data +
adapter design + calibration plan are ready; the forks are three concrete owner decisions that unblock a
clean build. **Recommended first buildable slice once A+B are decided:** J.C. Ryle on one Gospel (Anglican,
single clean volume, cross-copy proof available) — ship it *staged* with an alignment validation pass, then
a Lapide, then (after FORK C) Menno.
