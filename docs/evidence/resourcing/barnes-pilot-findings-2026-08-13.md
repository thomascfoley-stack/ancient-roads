# barnes-notes re-sourcing pilot — findings + STOP (2026-08-13, dev only, no writes)

**Outcome: STOPPED before `--apply`, per the pilot's own stop condition.** The named
permitted source exists and is licensed, but it is **NT-only while the staged
`barnes-notes` sections span the whole Bible** — this changes the batch plan
(decision #5 assumed the named editions exist for what is staged). Only dry-run
(read-only) numbers below; the dev database was not written.

## License verification (the geneva lesson — verified BEFORE decode)

`scripts/resourcing/fetch-crosswire.mts --module=Barnes` fetched the CrossWire rawzip
and printed the `.conf` before decoding (log:
`barnes-crosswire-license-verification-2026-08-13T04-21-*.log`):

- `Description=Barnes' New Testament Notes`
- `DistributionLicense=Public Domain` → **PASS** against the allowed set
  (`src/ingest/allowed-licenses.mjs`); the zVerse decoder re-checks the same gate at
  its own mouth.
- Package contents: `nt.czv/czz/czs` only — **no OT files**. The rawzip listing has no
  other Barnes module. CrossWire carries no Barnes OT.

Decoded: 7,431 per-verse entries, 27 NT books (`data/raw/sword/barnes.jsonl`).
Verse-label alignment self-check 6,791/6,797 — the 6 disagreements are module-internal
linked-range labels ("Verse 23-24." keyed at :24 etc.), all within the correct chapter;
irrelevant at chapter-aggregation granularity.

## Red-proof (watched RED, then green — THE_LOOP rule 4)

`scripts/resourcing/match-test.mts --redproof` — fixture + all three runs in this dir
(`match-redproof-fixture-*.json`, `match-redproof-result-*.json`).

- **Run 1 (RED, as required):** `RED:paragraph-shuffle` returned MATCH — token
  Jaccard/containment are set tests and cannot see word order. Added a 4-gram shingle
  guard.
- **Run 2 (still RED):** shingle containment passed the half-swap at 0.986 (only seam
  shingles break), and the token-LCS guard's denominator bug (set cardinality vs list
  length, containment 1.56) let it through. Fixed: LCS over token lists, list-length
  denominator.
- **Run 3 (SOUND):** all 5 corruptions DIFFER (drop-words → shingle guard 0.74;
  word-substitution → shingle 0.56; half-swap → order guard 0.50; different edition →
  token Jaccard 0.15; empty → 0), all 3 controls PASS (identical/typography-only →
  match; truncated copy → truncated).

The shipped comparator (`compareTexts`): exact normalized equality (sanitizeForIngest
+ normalizeForMatch), else token Jaccard/containment ≥ 0.98 (`resource-textmatch.ts`
`classify`), vetoed to DIFFER by either order-sensitive guard (4-gram shingle
containment, token-LCS containment). Guards only ever downgrade — fail-closed.

## Pilot dry-run (dev, read-only) — verdict counts

`barnes-pilot-dryrun-2026-08-13T04-24-09-937Z.jsonl` (per-section) +
`barnes-pilot-dryrun-summary-2026-08-13T04-24-09-937Z.json`.

| verdict | chapters | sections |
|---|---:|---:|
| match | 0 | 0 |
| truncated ($0-repairable) | 2 | 2 |
| differ | 258 | 369 |
| **no-source (OT — module has no OT)** | **929** | **929** |

Match unit = chapter: the stored NT sections are ~800-char chunks anchored at the
chapter's first verse (e.g. 5 chunks on Matt 1:1), the OT sections one ~5,000-char
section per chapter (929 = exactly the OT chapter count), and the module is per-verse —
so both sides were aggregated to chapter text and compared once per chapter.

**Why the NT differs (measured, not assumed):** the stored text is the same work but
(a) **heavily truncated** — stored Matt 1 = 4,397 chars vs the module's 65,462
(~7% kept; NT overall ≈ 8%), and (b) **lightly modernized** — stored reads "In
ancient times, when kings and priests…" where the module has Barnes's original
"Anciently, when kings and priests…". Token containment of stored-in-module is
0.93–0.96 — below the 0.98 floor, correctly DIFFER (the plan's rigor: no blessing a
drifted edition). Verbatim 20-word probes confirm stored chunks are genuine Barnes
text (ord 930 probe is verbatim in the module).

## What this means for the batch plan (decision #5)

1. **OT (929 sections): no CrossWire source exists.** NO-SOURCE → stays quarantined.
   Any OT recovery needs a different permitted edition (Barnes's OT notes exist in
   print for Isaiah/Daniel/Job/Psalms only — not the whole OT).
2. **NT (371 sections): in-place repair is the wrong shape.** DIFFER replacement would
   re-slice ~57k chars/chapter into the existing 1–5 sections/chapter (up to ~28k-char
   bodies) while bge-large embeddings only see the first ~1,200 chars — a retrieval
   regression. The clean path is decision #5's actual wording: **re-ingest
   `barnes-crosswire-nt` fresh from the module** (per-verse sections), leaving
   `barnes-notes` quarantined as-is.
3. Hypothetical `--apply` cost proxy (not executed): 369 sections re-embedded,
   14.8M permitted chars ≈ 3.7M tokens ≈ $0.04 at DeepInfra's published
   $0.01/1M-token bge-large rate.

`--apply` is implemented in `scripts/resourcing/pilot-barnes.mts` (batched
transactions, idempotent via `IS DISTINCT FROM`, sources row stays `staged`,
work-level provenance only rewritten on a complete repair) but was **not run** —
the stop condition fired first.
