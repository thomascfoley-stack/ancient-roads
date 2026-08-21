# My Works — draft check + sermon metadata (design, 2026-08-21)

Two Tier-3 items from the uploader deep-dive's plan
(`docs/pm/orders/2026-08-20-uploader-deep-dive.md`), built under the owner's "do it all"
directive on that plan. Smallest slices stated; scaling risks named; out-of-scope explicit.

## 1. "Have I preached this before?" — the draft check

**The loop's three questions fused into one action** (SERMON_SEARCH_DESIGN §1): paste a draft →
your own past documents on the same passages, with the overlap shown → the tradition voices on
those passages you have not cited.

**Mechanism — nothing new is invented:**
- The draft is anchored by the SHIPPED `anchorChunk` per chunk (`chunkProse` → explicit +
  uncited channels, translation detection live) — pure, in-process, no rows written.
- Overlap: `verseAnchorScan` per anchored range across the user's corpus (existing fast path).
- The gap: the `traditionGap` hits query, refactored to accept ranges directly
  (`traditionGapForRanges`) so a stored document and a pasted draft share ONE SQL body — the
  repo's no-second-copy rule.

**Spend: zero.** Anchor-only — no embedding call anywhere on this path (the semantic overlap
leg is OUT OF SCOPE v1, stated in the UI copy as "matched by quoted Scripture"). Metered anyway
with the corpus-search limiter (DB reads are not free), text capped at 120k chars.

**Surface:** `POST /api/user-corpus/draft-check` `{ text }` → `{ detection, ranges, overlaps:
[{range, documents:[{id,title,createdAt,channel,matchCount}]}], gaps: TraditionGapResult }`,
guarded by `guardUser`, 400 over the cap. UI: a "Check a draft" disclosure on My Works — paste
area → grouped results; empty states for "no Scripture found in the draft" and "you have not
written on any of these passages yet".

**Scaling risks:** the per-range scan is N ranges × an indexed lookup (bounded by the same
MAX_RANGES=200); the gap query is the existing bounded join. Worst case equals one document's
existing voices panel.

**Out of scope v1:** semantic (paraphrase) overlap; saving the draft; diffing drafts.

## 2. Sermon-shaped metadata, extracted not typed

At parse time the pipeline already sees the manuscript head. Sermon manuscripts are highly
regular: the stated text and often a preached-on date sit in the first lines.

**Mechanism:** a pure `extractSermonMetadata(text)` over the first 2,000 chars —
`scanReferences`+`isExplicitCitation` for the first stated reference; a conservative date
grammar (named-month forms only, no ambiguous numerics) for `preachedOn`. Stored on
`user_documents` (migration 124: `suggested_reference text`, `suggested_date date`) by the
drain in the same walk that writes parse metadata. Display-only chips beside the title in My
Works ("Looks like: Romans 8 · 21 March 1871").

**Deliberately NOT in v1 (filed):** the confirm flow that copies a suggestion into the title or
a real `preached_on` field — display-only is additive and cannot corrupt user data; a wrong
suggestion is a chip, not a renamed document.

**Scaling risks:** none — pure function over a bounded prefix at ingest time.

**Out of scope:** series detection; non-English date grammars; backfilling existing documents
(same backfill runbook item as detection).
