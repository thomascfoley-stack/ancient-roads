# Design note — the archive.org adapter gap (Track C deliverable, 2026-09-06)

**Status: NOTE ONLY. No adapter is written here.** Ordered by
`KIMI_ORDER_corpus-coverage.md` §4: every archive.org figure in ACQUISITION_MANIFEST
§4a/§4c is out of scope to acquire in the coverage wave because
`src/ingest/adapter-archive.ts` is a per-work OCR profile engine with exactly **one**
profile (`thayers-lexicon`), and each new work needs its own several-hundred-line
profile. This note states what a generic profile must do, what it costs, and which
works it unlocks.

## What exists today

`adapter-archive.ts` (400 lines) already implements the four guardrails the order
names, hard-coded to Thayer's typography:

1. **Edition-marker check** (`editionCheck`): regex markers required in the first
   60k chars of the `_djvu.txt` derivative; missing marker → FAIL CLOSED
   ("wrong or mislabeled scan"). This is the translation-trap defence for OCR: the
   scan must *prove* it is the claimed PD edition before a line is parsed.
2. **Garbage-line rate bar** (`garbageRate` / `isGarbageLine`): a line is garbage
   when dominated by non-letters, repeated non-word runs, or digit-letter jumbles;
   >5% of non-blank lines → FAIL CLOSED. (The Bramley & Stainer exclusion was ruled
   on exactly this bar: every copy measured 27–31%.)
3. **Page-chrome strip** (`stripPageChrome`): running heads and page numbers by
   exact-line frequency; per-page guide words as short isolated lines between
   blanks. Frequency misses unique-per-page chrome, so both shapes are handled.
4. **Structure floor** (profile parser + floors): the work must segment into its
   natural units (Thayer: headword entries) above a pre-registered count, else FAIL
   CLOSED "structure not recognized" — the same fail-closed shape as the CCEL
   adapter's MIN_UNITS.

Output is JSONL next to the cached scan; **no database writes** — staging is a
separate step.

## What a generic profile must add per work

A profile is the work-specific 20% on top of the four shared guardrails:

- **Edition markers** for the claimed edition (e.g. Lapide: "Mossman" +
  publisher/year strings in the front matter; Parker Society volumes: the series
  imprint + the specific volume title — the series looks identical across 54
  volumes, so the marker must name the *volume*, or the check passes the wrong book).
- **A unit segmenter** for the work's own divisions: Lapide's per-verse commentary
  paragraphs, Gerhard's numbered meditations, Morgan's sermon/chapter heads,
  Tyndale's treatise/chapter structure. This is where most of the per-work lines go
  (Thayer's segmenter + entry-start recognizer is ~90 lines for one typography).
- **A structure floor** calibrated to the work (expected unit count ± tolerance).
- **Verse-anchoring where the work is verse-ordered** (Lapide above all): anchors
  from the scan's own verse headers, never invented — the order's rule.
- **The ADR-110 preconditions** (`docs/DECISIONS.md:1628-1657`) bind every fresh
  archive.org work, not just the first: FORK A — edition proof is **cross-copy
  shingle containment between two independent scans of the same edition**, with the
  threshold calibrated on same-vs-different-edition pairs *before first use*; FORK B —
  verse-anchored OCR works ship `staged` and stay staged until a validation pass
  spot-checks aligned entries against the scan. A profile that skips either is not
  shippable, whatever its parse rate.

## Cost

- **Per profile:** the order's estimate is several hundred lines; Thayer's
  work-specific share of the 400-line file (~200 lines + markers/floors) is the
  measured reference. Budget: **0.5–1 agent-day per straightforward prose work**
  (Gerhard, Morgan), **1–2 days for verse-anchored works** (Lapide — verse
  alignment + the FORK B validation pass is the expensive half).
- **Per work, before any staging:** the FORK A calibration pair (two independent
  scans; Lapide and the Parker Society volumes all have multiple archive.org
  copies) plus a recorded first-800-chars title-page read — the Ryle-on-John scar
  (`quality-slice` SKILL.md:100-108) was an OCR-edition mistake a title-page read
  would have caught.
- **Shared, once:** promoting the four guardrails out of the Thayer file into a
  `profile-kit` the per-work profiles import (today a second profile would copy
  them — the same "two copies of one implementation" defect the CCEL id-expander
  invariant exists to prevent).

## What it unlocks (ACQUISITION_MANIFEST §4a/§4c, all genuine gaps — re-verified
against `ingest/sources.config.json` 2026-09-07, none declared)

| Work | Edition | Why it matters |
|---|---|---|
| **Cornelius a Lapide, *Great Commentary*** (§4a) | Mossman 1876–1908, `greatcommentaryo05lapi` + siblings | The §4a crown jewel: Catholic verse-by-verse on most of the NT — the largest single tradition-widening commentary gap |
| **Johann Gerhard, *Sacred Meditations*** (§4c) | Heisler 1896 (verified: archive.org/Google Books/HathiTrust only — no CCEL, no Gutenberg) | The Lutheran devotional voice §4c weights |
| **Zwingli, *Latin Works*** (§4c) | 1901–29 translations | Swiss Reformed primary voice |
| **Heinrich Bullinger, *Decades*** (§4c) | Parker Society 1849–52 | Swiss Reformed; NB `bullinger-apocalypse` in the manifest is E.W. Bullinger, a different person |
| **Tyndale, Expositions/Works** (§4c) | Parker Society 1848–52 | English Reformation primary voice |
| **G. Campbell Morgan** (§4c) | archive.org, **pre-1930 titles only** (§4d) | Congregational; the §4d date filter is the profile's edition-marker job |
| **Wycliffe, Sermons** (§4a) | Arnold 1869 | Medieval English voice |
| **Thomas Brooks / Perkins / Burroughs / Goodwin** (§4c) | archive.org copies | Puritan depth — **their clean free texts otherwise live on monergism, which is forbidden provenance**, so archive.org is the only lawful lane |
| **Hooker, *Laws* Books I–IV, VI–VIII** (§4c) | Keble 1888, e.g. `worksofthatlearn01/03hookuoft` | Track C measured 2026-09-07 that **all three CCEL volumes (`hooker/reform1–3`) are scanned page images with no text** — CCEL is not a lane for the Laws at all; archive.org (Keble) is. *A Learned Discourse of Justification* was acquirable from CCEL and staged separately this wave. |

Not unlocked even with profiles: **Menno Simons** (`simon-works1/2`) — held by owner
ruling ADR-110 FORK C (no retrieval path for his treatises), and both manifest
entries carry a 1983 edition against §4c's required Funk 1871 (open owner flag,
Track B packet). **Parker Society "set"** as a whole is not an item — one profile
family covers the typography, but each volume is still its own manifest entry and
its own acquisition.

## Recommendation

Order the unlocks by value-per-profile: **Gerhard** (smallest clean prose win,
proves the profile-kit promotion) → **Lapide** (the crown jewel, carries the FORK B
validation cost) → the **Parker Society family** (one segmenter amortized across
Tyndale/Bullinger + optionally completing the declared `latimer`/`cranmer` figures)
→ **Morgan** (with the §4d pre-1930 date filter encoded as an edition marker) →
**Hooker Keble vols 1/3** (Book V's siblings; CCEL proved image-only). The
profile-kit promotion should land with the first new profile, not after the third.
