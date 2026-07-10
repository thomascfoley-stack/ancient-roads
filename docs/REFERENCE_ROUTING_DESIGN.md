# Design — Reference/Pericope Intent Routing for Retrieval

**Status: DESIGN ONLY — awaiting owner approval. No code until approved** (design-before-code rail; this touches retrieval + sync-guarded `ref-parse`).

## 1. Context — what we're fixing (measured, §14)

The 88-query failure-code eval on the legal corpus found **`no-content = 0%`** — the corpus is never missing the passage — and the whole accuracy gap is **ranking drift concentrated in verse-ref queries**: the query *names* a passage but retrieval drifts to a semantically-similar one (1 Cor 13 → John 15 "greater love"; "Sermon on the Mount" → scattered). Failures: `<2-voices 10%` + `wrong-passage 6%`. The full-corpus 100% only held because voice volume kept ≥2 in-range results in the top-6 despite the drift; a smaller *legal* corpus exposes the underlying weakness.

So the fix is a **general retrieval mechanism**: when a query resolves to a scripture reference or a named pericope, ensure that passage's voices reach the reranker — *not* patches for the 14 queries, and *not* more corpus (`no-content=0%`, so CrossWire-5 is 0-ROI).

## 2. The mechanism — SOFT-BOOST (candidate injection), NOT hard-filter

**Decision: soft-boost.** When a reference resolves to verse range(s), the candidate pool the reranker sees = **the normal hybrid pool ∪ the top vector matches *within* the resolved range(s)**. Then rerank the combined pool → top-K. No `WHERE verseId IN (range)` hard-filter on the primary query.

**Why not hard-filter:** a hard-filter narrows exactly the breadth a concordance exists to provide.
- Multi-passage references are the norm: "Melchizedek" → Gen 14 + Heb 7 + Ps 110; "propitiation" → Rom 3 + 1 John + Heb; the new covenant → Jer 31 + Heb 8. A hard-filter to one parsed ref drops the others.
- A false-positive detection on a topical query ("the good shepherd") would wrongly restrict it. Soft-boost is safe under false positives: the worst case is a few extra on-passage candidates in a 20+ pool — the reranker ignores them if irrelevant.
- Breadth is preserved by construction: the normal pool is still there; other passages still win when more relevant.

**Why it fixes the drift:** the failure is that the named passage's voices don't survive into the top-20 candidate pool (dominated by semantically-closer passages), so the reranker never sees them. Injecting the range's top vector matches *guarantees the reranker sees them*; for a query that names the passage, the reranker then scores them highly. This addresses `wrong-passage` (the passage becomes reachable) and `<2-voices` (≥2 range candidates enter the pool).

**Optional ≥2-voices floor (Phase 2, only if `<2-voices` persists):** for a *high-confidence single* reference, if the reranked top-K still has <2 in-range, fill up to 2 from the injected range candidates (all legitimately on-passage). This *adds* on-passage voices; it never removes topical ones and never applies to multi-passage/topical intents. Deferred until Phase-1 re-measure shows whether it's needed.

## 3. Intent detection — route the referenced, leave the topical

Two resolvers, both **high-precision (route only when confident); anything ambiguous falls through to today's semantic retrieval unchanged.**

**(a) Numeric references — extend `ref-parse`.** `ref-parse` today parses a *whole* input (typeahead). Add a pure `scanReferences(text): ResolvedRef[]` that finds reference token-spans *inside* free text — "**1 Corinthians 13** the greatest…", "**Isaiah 53** the suffering servant", "**Romans 8**", "**John 3:16**". Reuses the existing book-alias table + bounds validation (numbered-book handling, chapter/verse bounds already solved). Emits resolved verse ranges (or nothing).

**(b) Named pericopes — a gazetteer (§4).** The failures aren't all numeric: "Sermon on the Mount", "the Lord's Prayer", "the whole armor of God", "the ten commandments". A curated map name→range(s) resolves these.

Detection precedence: run both; union the resolved ranges. **Route iff ≥1 range resolved with high confidence.** No hit → topical → unchanged path. (Confidence guards: a numeric ref must match the book-alias + valid bounds; a pericope must match a gazetteer key as a phrase, not a stray word.)

## 4. The named-pericope gazetteer

A checked-in data table (`src/bible/pericopes.ts`, byte-synced to `web/src/bible/`), entries `{ aliases: string[], ranges: VerseRange[] }` reusing `ref-parse`'s `VerseRange`. Starter set (grows reactively as the eval surfaces misses — a data change, not a code change):

| Pericope (aliases) | Range(s) |
|---|---|
| Sermon on the Mount | Matt 5–7 |
| the Lord's Prayer / our Father | Matt 6:9–13, Luke 11:2–4 |
| the whole armor of God | Eph 6:10–18 |
| the ten commandments / decalogue | Exod 20:1–17, Deut 5:6–21 |
| the beatitudes | Matt 5:3–12, Luke 6:20–23 |
| the good shepherd | John 10 |
| the prodigal son | Luke 15:11–32 |
| the good Samaritan | Luke 10:25–37 |
| the road to Emmaus | Luke 24:13–35 |
| the fruit of the Spirit | Gal 5:22–23 |
| the love chapter | 1 Cor 13 |
| the great commission | Matt 28:16–20 |
| … (extend on measured misses) | |

Gazetteer entries are **references, never interpretations** — they map a name to a location, exactly like a study-Bible index; no claim about meaning.

## 5. Retrieval integration (where it hooks)

In the retrieval layer only (`retrieveCommentary`, `web/src/lib/teacher/retrieve.ts` + the CLI `src/retrieval/*` — **intentionally NOT sync-guarded** per the web-core-sync comment):

1. `ranges = resolveIntent(queryText)` (calls the synced `scanReferences` + gazetteer).
2. If `ranges` non-empty: for each range, one indexed query `… WHERE verseId BETWEEN lo AND hi ORDER BY embedding <=> vec LIMIT n_inject` (≈8/range); union with the existing `hybrid_search` pool; dedup by `source_id`.
3. Rerank the combined pool against the raw query → top-K (unchanged reranker).
4. No `ranges` → today's path, byte-for-byte.

**Index (named scaling risk).** The injection filters `(metadata->>'verseId')::int BETWEEN …`. That needs an index or it seq-scans 173k rows on the request path (violates CLAUDE.md "every filtered path has its index" + "keep off the request path"). Slice includes an **additive** expression index `CREATE INDEX … ON embeddings (((metadata->>'verseId')::int))` (migration `007`, non-breaking); later the sources/sections model gives `section_anchors(verse_id_start)` natively.

## 6. Concordance guarantee — preserved (unchanged), how

- **Retrieval-only.** Routing changes *which passages' commentary* reaches the reranker. It does **not** touch the output contract, the compose prompt, or the verifier — those run unchanged downstream. No unverified model text; the verifier still fails closed.
- **No interpretation.** Reference/pericope resolution is deterministic location lookup (a concordance index), never a claim about meaning. The product still only quotes + attributes.
- **Strengthens, not weakens, "≥2 grounded voices."** Injecting the named passage's voices makes it *more* likely ≥2 in-range voices survive to the answer (it's the direct fix for `<2-voices`); the optional floor (§2) makes it explicit for single-reference intents. Breadth for topical queries is untouched (soft-boost).
- **Accuracy re-measured on every retrieval change** (CLAUDE.md): §9.

## 7. Sync guard — how `ref-parse` stays byte-identical

- **Correction to note:** `ref-parse` is guarded by **`test/bible-sync.test.ts`** (whole `src/bible/` ↔ `web/src/bible/` — same file set, byte-identical), *not* `web-core-sync.test.ts` as CLAUDE.md states. I'll fix that CLAUDE.md line as part of this.
- **What's synced:** the deterministic parsing/data — `scanReferences` (in `ref-parse.ts`) and the new `pericopes.ts` — live in `src/bible/` and are copied byte-identical to `web/src/bible/`. `bible-sync` enforces both *same file set* and *byte-identity*, so adding `pericopes.ts` requires adding it to both, and any edit must be mirrored. Unit tests (`ref-parse.test.ts`) cover `scanReferences` + the gazetteer.
- **What's NOT synced:** the retrieval wiring (candidate injection) — it's app glue, deliberately un-synced, and calls the synced parser.

## 8. Smallest first slice + out of scope

**Slice:** `scanReferences` (numeric, in `ref-parse`) + a starter `pericopes.ts` + `resolveIntent` + soft-boost injection in the retrieval layer + migration `007` (verseId index) + unit tests. Re-measure (§9). **No ≥2-voices floor yet** (Phase 2, only if needed).

**Out of scope:** the optional voices floor; the omnibox navigation intent (`NAVIGATION_AND_SEARCH.md` §5 — separate); cross-reference expansion ("propitiation" → auto-add typology); UI disambiguation of ambiguous refs; any corpus change (CrossWire-5 dropped).

## 9. Re-measure plan (the proof)

Run the **frozen 88-query eval on BOTH legal and full corpus**, with routing on:
- Report **verse-ref HIT=1 specifically** (the category the drift lives in), plus overall HIT=1/HIT=2 and the failure-code breakdown, vs the current legal 64%/84% and full-corpus baseline.
- Target: verse-ref HIT=1 up materially on legal; full corpus unchanged-or-up (routing must not regress the corpus that already passed).
- **Then decide Catena Aurea** only for whatever Gospel `<2-voices` residual remains after routing.

## 10. Scaling risks (named)

- **False-positive routing** narrowing breadth → mitigated by soft-boost (not filter) + high-precision detection.
- **Gazetteer coverage** is open-ended → start small, grow reactively on measured misses (data, not code); never block on completeness.
- **Index/latency** on the injection query → the additive verseId index (§5); inject a small `n` per range.
- **Reranker still deprioritizing** injected voices → the Phase-2 floor is the backstop; Phase-1 measures whether it's needed.
- **Sync drift** on `ref-parse`/`pericopes` → `bible-sync` guard (red on drift).

---
*No code until approved. On approval, first deliverable is the slice in §8, proven by the §9 re-measure before anything ships.*
