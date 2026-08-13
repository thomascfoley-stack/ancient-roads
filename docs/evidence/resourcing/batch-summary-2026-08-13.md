# Phase 3 BATCH — decision #5 four-entry re-ingest (2026-08-13, dev only, STAGED)

All four backfill-skip entries re-ingested fresh from their named permitted editions,
each license verified BEFORE decode/parse (the geneva lesson). Path: decoded per-verse
JSONL → `scripts/resourcing/batch-ingest.mts` → `register-writer.writeRegisterWork`
(publish=false hard-wired) → section vectors copied from flat chunk-0 vectors (the
`migrate-sections-slice` convention, $0). No prod connection, no commits, no edits to
`ingest/sources.config.json`. `barnes-notes` staged sections untouched (verified:
staged, 1,300 sections at the final census).

## Per entry

| slug | named edition license (verified line) | sections | section_embeddings | anchors | flat embeddings |
|---|---|---:|---:|---:|---:|
| barnes-crosswire-nt | `.conf [barnes] DistributionLicense=Public Domain` (zCom/ZIP/ThML v1.1) | 7,431 | 7,431 | 7,431 | 17,490 |
| scofield-crosswire | `.conf [scofield] DistributionLicense=Public Domain` (zCom/ZIP/OSIS v2.1, SwordVersionDate 2023-01-18) | 3,207 | 3,207 | 3,207 | 3,392 |
| pnt-crosswire | `.conf [pnt] DistributionLicense=Public Domain` (zCom/ZIP/ThML v1.1) | 6,067 | 6,067 | 6,067 | 6,197 |
| poole-tcp | TEI `<availability>` CC0 1.0 Universal verbatim in BOTH A55363 + A55368 headers ("can be copied, modified, distributed and performed, even for commercial purposes, all without asking permission") | 24,104 | 24,104 | 24,104 | 29,468 |

Module/parser notes:
- barnes: NT-only module (known from the pilot — the staged barnes-notes OT span is
  unaffected by this entry; those stay quarantined). Verse-label alignment 6,791/6,797
  (6 module-internal linked-range labels, in-chapter, harmless).
- scofield: OT+NT, 65/66 books (no notes on 3 John).
- pnt: NT-only by design, 26/27 (no Philemon notes).
- poole: parse reproduced the config's declared quality numbers exactly — canon
  validation dropped 0.24% (Vol I) / 0.11% (Vol II) miskeyed entries (fail-closed bar
  1%); lacuna carriage 16.3% / 33.3% (declared: 16% / 33%).

## Embed spend proxy

Flat embeddings (DeepInfra BAAI/bge-large-en-v1.5): 17,490 + 3,392 + 6,197 + 29,468
= **56,547 vectors** ≈ 62M chars ≈ 15.6M tokens ≈ **$0.16** at the published
$0.01/1M-token rate. Section embeddings: copied from flat chunk-0 ($0) except 1
poole-tcp section with no flat counterpart (all chunks under the 20-char floor) —
embedded via API fallback. Honest overrun note: the first barnes run was killed by a
300s harness timeout after 6,848 flat embeds; `writeRegisterWork` re-ingest semantics
(delete-then-write) re-embedded them on resume (~$0.02 wasted).

## Measured correction to a standing assumption

**DeepInfra does NOT API-truncate >512-token inputs — it 400s** ("maximum input
length of 512 tokens (at most 9216 characters)", measured on a 13,076-char body; even
4,000 chars = 513 tokens failed). `scripts/backfill-section-embeddings.mjs` (Phase 2)
states "API-truncated by DeepInfra — accepted under D1(b)" and sends whole bodies:
**any published work with >512-token section bodies will accumulate FAILED sections
in that run** — check its `failed_sections` count in the Phase 2 verify step.

## Publish-admission (A3) — expected before/after

None of the four slugs is in any `SERVED_*_WORKS` list (`web/src/lib/teacher/routing.ts`;
the exegetical leg is `SERVED_PROSE_WORKS`). **Staged today they are inert
(`served=true` rows: 0 — verified). A publish flip before the owner adds the slug to
`SERVED_PROSE_WORKS` would be the publish-but-not-serve STOP.** Note: routing.ts:45-58
already names poole-tcp/scofield/pnt as "the v2 staged commentaries (the parked
LEGAL_CORPUS_FILTER collision call)" — publishing those three also needs that parked
call reconciled. barnes-crosswire-nt is not named anywhere in routing.ts.

## Config close-out (parent owns `ingest/sources.config.json`)

Per entry, the one-line edit: in `backfill`, delete `forbidden_provenance: "skip"`
and `forbidden_provenance_reason` (keep `match_author`). The blocker they describe
("named edition was never actually ingested") no longer holds — the named edition is
now ingested, staged, on dev. No other field changes; `provenance.rebuild` recipes
remain accurate as written.

## Evidence files (this dir)

- `batch-barnes-crosswire-nt-*.log` (fetch+license, ingest resume, vectors-only + census)
- `batch-scofield-crosswire-fetch-*.log`, `batch-scofield-crosswire-*.log`
- `batch-pnt-crosswire-fetch-*.log`, `batch-pnt-crosswire-*.log`
- `batch-poole-tcp-fetch-*.log` (CC0 headers verbatim + parse), `batch-poole-tcp-*.log`
- `batch-final-census-*.log` (the four-work census above + served=0 + barnes-notes untouched)
