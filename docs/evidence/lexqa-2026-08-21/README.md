# Lexicon quality pass — the five held works (+ Thayer's control), 2026-08-21

**Question:** are `bdb-lexicon`, `eastons-dictionary`, `isbe`, `naves-topical`,
`smiths-dictionary` serve-quality, before any flip? **Method (quality-slice):** the artifact
measured is dev's `sections.heading/body` joined to `sources` for the six slugs — the same rows
`search-lexicons.ts` serves once status flips — with quarantined `thayers-lexicon` run through
the identical instrument as the known-bad control, and 12 random sections per work **read with
human eyes** (samples deterministic: `md5(id || 'qa-seed-2026-08-21')`). Read-only throughout;
dev = `ep-tiny-hat` via `app_runtime`.

## The numbers

| work | n | headings | tiny <40ch | � / html | orig-script head | Strong's pat | median len |
|---|---|---|---|---|---|---|---|
| bdb-lexicon | 9,794 | 100% | 35.1% | 0% / 0% | **Hebrew 100%** | **87.3%** | 48 |
| eastons-dictionary | 4,841 | 100% | 1.2% | 0% / 0% | — | 0% | 393 |
| isbe | 26,475 | 100% | 4.7% | 0% / 0% | — | 0% | 1,058 |
| naves-topical | 5,357 | 100% | 21.0% | 0% / 0% | — | 0% | 87 |
| smiths-dictionary | 5,576 | 100% | 3.5% | 0% / 0% | — | 0% | 312 |
| thayers-lexicon (control) | 5,507 | 100% | 0.5% | 0% / 0% | **Greek 100%** | **99.8%** | 389 |

Provenance + license present on all six: BDB = openscriptures HebrewLexicon XML, **CC BY**
(attribution required — the product attributes everywhere); Easton/ISBE/Nave/Smith = CrossWire
SWORD modules, PD; Thayer = PD 1889. **All are structured digital editions, not archive.org
OCR** — the source class the quarantines were about is absent here, and the instrument confirms
it (zero replacement chars, zero HTML remnants, zero OCR signatures across 57,550 sections).

## What the eyes saw (the numbers alone don't decide)

- **BDB** — real pointed-Hebrew entries with the **Strong's number in the heading**
  (`H5867 עֵילָם`): headword, part of speech, glosses, refs. The 35% "tiny" is the genre —
  BDB's two-line entries for rare words (`עִירוּ n.pr.m. in Judah 1 Ch 4:15`) are complete
  entries, not damage. Cosmetic nit: some headings carry openscriptures internal codes
  (`[p.cj.ai]`) — strip at render.
- **Thayer's — the stale-quarantine finding.** The GO_LIVE quarantine row ("0% Greek-script
  headwords, 6.2% strict-match") describes a DEAD attempt. Dev's rows (retrieved 2026-08-13,
  after that note) are a structured Strong's-keyed edition: `G3306 μένω` with full articles
  (principal parts, LXX equivalents in Hebrew — hence 29.8% Hebrew-in-body, sense trees, refs).
  One nit: max section length 34,598 chars — Thayer's was not chunked to the ~1,200 cap the
  others carry; a chunking pass (or render check) before serve.
- **Easton's / ISBE / Smith's** — clean full-prose reference articles, correct headword
  formats, scholarly refs intact. Multi-section articles chunk as elsewhere.
- **Nave's** — its natural shape: topic heading + verse-reference lists; the 21% tiny is the
  genre (an index), not damage.

## Verdicts

| work | verdict | destination |
|---|---|---|
| bdb-lexicon | **SERVE-QUALITY** | `/word/H*` — heading-keyed, near-zero mapping work |
| thayers-lexicon | **SERVE-QUALITY** (quarantine record stale — owner lift + PROD-state check needed; the 08-13 re-ingest postdates the dev reset, so prod may still hold the dead copy) | `/word/G*` — heading-keyed |
| eastons-dictionary | SERVE-QUALITY | name/topic keyed → lexicon search now; topic surface later |
| smiths-dictionary | SERVE-QUALITY | same |
| isbe | SERVE-QUALITY | same (encyclopedia; longest articles) |
| naves-topical | SERVE-QUALITY | topical index → search; a topic page fits it better than /word |

## What this changes

BDB + Thayer's being **Strong's-keyed in the heading** makes the /word "deeper entries" slice
small: match `sections.heading` prefix `H<n>`/`G<n>` for the two works, render quoted +
attributed. The flip remains the owner's terminal command, and the recommended order stands:
wire /word first, then one flip lights the pane and search together. Thayer's inclusion needs
the owner to lift the (stale) quarantine after a prod-state check — dev's healthy copy may not
be what prod holds.
