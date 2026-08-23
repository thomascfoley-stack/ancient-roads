# W-STRONGS — Strong's truncated glosses: RED transcript + root-cause finding

**Date:** 2026-08-23 · **Workstream:** W-STRONGS (DB-writer lane, position 4) ·
**Branch:** `swarm/w-strongs-gloss-fix` · **Base:** `origin/main` `9dce273ef09dffb03bc547cead0431f48fb71ffe`

**Verdict: MOOT-with-finding — the truncation is in the upstream SOURCE, not the adapter.**
The adapter (`src/ingest/ingest-strongs.ts`) is byte-lossless across all 14,197 entries
(5,523 Greek + 8,674 Hebrew). No adapter change, no DB write, no re-embed.

## The defect as filed

WORKLOG 2026-08-21 (line 1669): "The **Strong's ingest data nit** (truncated glosses,
def/derivation field splits — G2316's "figuratively") … visible on the new surfaces, an
ingest fix."

On `/word/G2316` the "Definition · Strong's 1890" block shows only
`figuratively, a magistrate; by Hebraism, very`, while the primary gloss
(`a deity, especially (with G3588 (ὁ)) the supreme Divinity`) renders under the
"Derivation" label — the page (`web/src/app/word/[strongs]/page.tsx:182-205`) displays
`entry.def`, `entry.kjv`, `entry.derivation` verbatim from `web/public/lexicon/greek.json`.

## RED: the served data really is "truncated" (pre-fix state)

Served `web/public/lexicon/greek.json`, G2316 (pre-fix = current state):

```json
{
 "lemma": "θεός",
 "translit": "theós",
 "pron": "",
 "def": "figuratively, a magistrate; by Hebraism, very",
 "derivation": "of uncertain affinity; a deity, especially (with G3588 (ὁ)) the supreme Divinity;",
 "kjv": "X exceeding, God, god(-ly, -ward)"
}
```

## Source bytes (the citation the brief requires)

**Upstream js** (`openscriptures/strongs@master greek/strongs-greek-dictionary.js`,
fetched 2026-08-23, sha256 `7624ee73…c04efd`), G2316 verbatim:

```
"G2316":{"lemma":"θεός","translit":"theós","kjv_def":"X exceeding, God, god(-ly, -ward)","strongs_def":" figuratively, a magistrate; by Hebraism, very","derivation":"of uncertain affinity; a deity, especially (with G3588 (ὁ)) the supreme Divinity;"}
```

**Upstream authoritative XML** (`greek/StrongsGreekDictionaryXML_1.4.zip` →
`strongsgreek.xml`, dated 2007-09-13, lines 14535–14541), G2316 verbatim:

```xml
</entry><entry strongs="02316">
 <strongs>2316</strongs>   <greek BETA="QEO/S" unicode="θεός" translit="theós"/>   <pronunciation strongs="theh'-os"/>

 <strongs_derivation>of uncertain affinity; a deity, especially (with <strongsref language="GREEK" strongs="3588"/>) the supreme
 Divinity;</strongs_derivation><strongs_def> figuratively, a magistrate; by Hebraism, very</strongs_def><kjv_def>:--X exceeding,
 God, god(-ly, -ward).</kjv_def>
```

The def/derivation field split is upstream's own 2007 XML tagging. The adapter
(`normalize()`, `src/ingest/ingest-strongs.ts:48-57`) applies `.trim()` only — nothing is
dropped, reordered, or cut.

## Proof the adapter is lossless (whole-corpus diff, stronger than sampling)

`verify-strongs-glosses.mjs` (this directory) re-fetches the two pinned upstream files,
parses them with the adapter's exact code, and diffs **every entry** against the served
JSON. Transcript: `verify-transcript.txt`.

- Greek: 5,523 upstream / 5,523 served · 0 keys either direction · **0 field mismatches**
- Hebrew: 8,674 / 8,674 · 0 keys either direction · **0 field mismatches**
- G2316 + seeded 20-entry Greek sample (seed 20260821): 20/20 byte-identical; Hebrew spot sample 5/5.

## Red-proof of the check (§2.2)

The checker was watched go RED: G2316's served `def` was truncated by hand to
`figuratively, a magistrate`, re-run → exit 1, `field mismatches: 1`, `mismatch keys:
G2316`, verdict flips to "adapter defect present". Transcript:
`red-proof-transcript.txt`. Served file then restored byte-identical (sha256 verified
against the primary tree copy).

## Re-ingest (dev status first)

- "Check sources": `ingest/sources.config.json` has **no strongs entry**; the dev DB
  check (`dev-db-strongs-check.txt`, read-only, host-asserted `ep-tiny-hat`) shows **0
  sources matching `strong*`**. Strong's is a static-asset ingest only
  (`web/public/lexicon/*.json`); no `sources`/`sections` rows exist for it, so there is
  nothing staged or served in the DB to re-ingest.
- The adapter was re-run anyway (`npx tsx src/ingest/ingest-strongs.ts`,
  `reingest-transcript.txt`): 5,523 + 8,674 entries written, output **byte-identical**
  (sha256) to the currently served files — upstream has not drifted and the pipeline is
  reproducible.

## Parity / vectors / spend

No DB rows changed (none exist for Strong's); no sections changed ⇒ parity invariant
unaffected, section-vector-pairing suite not implicated, **0 embeddings re-embedded**.
DeepInfra spend: **$0.00** (0 units × rate).

## Finding for the owner packet (remediation is a decision, not a bug fix)

The information content is fully served; the nit is presentational: upstream tags the
leading gloss (`a deity, especially … the supreme Divinity;`) as
`<strongs_derivation>`, so it renders under "Derivation". Composing `derivation + def`
into the Definition block (upstream order: derivation text precedes strongs_def in the
XML) would restore the printed-Strong's reading — but `derivation` is genuine etymology
for most entries (e.g. G1615 "from G1537 (ἐκ) and G5055 (τελέω);"), so any composition
rule is a display-semantics call (UX/owner), alternatively an upstream re-source.
No heuristic rewrite was attempted under an unsupervised order.
