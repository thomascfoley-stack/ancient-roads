# Thayer's — source verification record (the publish-flip gate's required evidence)

**2026-08-22.** This is the file `scripts/publish-flip.mjs`'s Thayer's gate requires before any
flip of `thayers-lexicon` (owner ruling 2026-08-21: checksum/shingle-diff of the TARGET copy,
never "someone confirmed it"). Written after the prod-state check the quality pass ordered —
and that check overturned the standing narrative in BOTH directions:

1. **Prod does NOT hold the dead OCR copy.** The quarantine record's signature ("0%
   Greek-script headwords") matches nothing on prod: **5,507/5,507 sections carry Greek-script
   headwords, 5,507/5,507 are Strong's-keyed** — identical to dev's certified-healthy 08-13
   re-ingest (archive.org `greekenglishlexi00grimuoft`, 1889 Grimm/Thayer, Public Domain).
2. **Prod's `thayers-lexicon` was ALREADY `published` and serving** (7,570 flat embeddings
   `served=true`) — before tonight's five-work flip, proven by the flip's own pre-snapshot
   (`flip-pre-snapshot-2026-08-21T17-42-00-008Z.json` records `thayers-lexicon: published` at
   17:42Z, and that flip's census listed 5 eligible, none of them thayers). The "held /
   quarantined on prod" belief was a dev-lineage fact carried forward without a prod read.

## The verification, measured 2026-08-22

**Byte identity, prod ≡ dev** (dev being the copy the 2026-08-21 lexicon quality pass
instrumented and certified against the dead-copy control):

```
sha256 over every section, ordered by ordinal, fields separated 0x1f, rows 0x1e:
DEV : sections=5507 sha256=e10b468bea377408477b61140a0f2195c942ec8b64d0e8e3a35270faf5419814
PROD: sections=5507 sha256=e10b468bea377408477b61140a0f2195c942ec8b64d0e8e3a35270faf5419814
md5 corroboration (SQL, md5-chain ordered by ordinal): f1cb11fc25cb8cd672f519caaebdeee9 — both sides
```

**Human eyes on the data** (quality-slice rule: never let a number stand in for looking) — three
entries read on BOTH databases, byte-identical, all genuine Thayer lexicography:
`#100 G101 ἀδυνατέω` (morphology + glosses), `#2500 G2507 καθαιρέω` (aorist forms, Luke 12:18
citation), `#5000 G5115 τόξον` (with the Septuagint's Hebrew קֶשֶׁת gloss, Rev 6:2).

**Shape metrics, both sides:** 5,507 sections · median body 389 chars · max 34,598 (the
unchunked-giant nit, filed) · `section_embeddings` 5,507 (1:1).

## NOT covered, said plainly

- **Full shingle-containment against the source edition was NOT run** — the identity proven here
  is prod ≡ dev, where dev is the ingest the quality pass certified (structured digital source,
  zero OCR signatures, run against the dead-copy control). A direct text-match to an independent
  copy of the 1889 edition remains available if the owner wants belt-and-braces.
- **The stale flat-embedding rows remain**: 7,570 flat rows exist, only **4,705 map to a live
  section by integer ordinal — 2,865 rows key to nothing current** (dead-vintage and chunked
  `NNN.MM` keys). All 7,570 are `served=true` on prod and reachable by NO shipped query (every
  /ask lane is type-fenced against `lexicon`; `commentary_entries` holds no lexicon rows).
  Cleanup filed, deliberately not executed in the same pass as this verification.
