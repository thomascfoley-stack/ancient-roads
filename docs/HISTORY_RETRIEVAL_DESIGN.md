# HISTORY_RETRIEVAL_DESIGN — the history lane, end to end

**Status: LIVE ON PRODUCTION — corrected 2026-08-21.** The header read "DESIGN FOR OWNER
APPROVAL — nothing below is implemented" while `/ask?mode=history` had shipped, 28 works were
serving, and the study entrance (order 2026-08-20-historians-study-entrance) had extended the
lane — a header a reader could trust in neither direction, sitting above sections that report
measured baselines and shipped filenames (deep-audit docs finding 2). **One launch gate remains
open: the §8b similarity floor** — a nonsense query still renders a confident "Closest match"
hero, held safe today only by the SEC-1 site-password gate (owner-only), NOT by code. Resolve it
before this lane is any real user's front door. The wireframes in §5 are the ORIGINAL design;
several fields diverged in implementation (deep-audit docs finding 6) — read the code, not §5, for
current behavior. Historical context of this doc's own creation follows. Amended 2026-08-20 after
independent review (Kimi): entity vocabulary source of truth stated (§3.1), weights reframed as ordinal priors with tuning deferred to adequate n (§3.4/§7), the Josephus transition written (§2b), chip-filter framing + coverage derivation + threads migration + behavioral test #4 (§4/§5/§6). Review pushbacks and their dispositions are in the 2026-08-20 session log. This is the document
`src/ingest/ingest-historian.ts` and three manifest notes have cited since migration 016. It did
not exist until 2026-08-20 (bylaw 1). Written for an implementing agent: exact routes, contracts,
click behavior, states, and exit criteria. CLAUDE.md requires owner approval before code.

## 0. Rulings this encodes (do not relitigate)

- **ADR-114**: history is Christian writers writing to a Christian audience. Renan removed.
- **History is standalone from day one.** Never searchable with commentary/sermon/theology.
  Never in the exegetical pool or its ≥2-voices floor. (Owner, 2026-08-20.)
- **Point, don't fill.** A history response locates passages; it never synthesizes an answer.
  v1 ships with ZERO generative output — every rendered string is either a fixed template or a
  verbatim excerpt with citation. The conversational layer is v2 and carries its own
  interpretation_bait obligation before it ships.
- **Reader overhaul is out of scope** (owner: "we'll get to that later"). v1 adds one landing
  affordance to the existing Book Reader, nothing more.

## 1. Product contract

The user asks an open question ("when did the church at Ephesus cease?"). The system returns:
what it matched (entities, period), the closest passage, and every relevant passage grouped by
work — each a verbatim excerpt with work/author/heading-path/period citation, each opening the
book at that spot. The system's own words are fixed UI strings only. If nothing matches, it says
nothing matches. Faithfulness gate for v1: **every excerpt must be an exact substring of
`sections.body`, asserted server-side before render** (the no-LLM analogue of the verifier).

## 2. Storage & serving (ruled 2026-08-20)

- `sources`/`sections` are SHARED. No new content tables. Period + entity live where migration
  016 put them: `sections.period_start_year/period_end_year`, `section_history_anchors`,
  `sections.heading` (tree path). Indexes exist: `sections_period_idx`, `history_anchors_entity_idx`.
- **NEW: `history_embeddings`** — history vectors NEVER enter `embeddings`.
  ```sql
  CREATE TABLE history_embeddings (
    section_id BIGINT PRIMARY KEY REFERENCES sections(id) ON DELETE CASCADE,
    embedding  VECTOR(1024) NOT NULL,
    model_slug TEXT NOT NULL,            -- derived from the API id, one module (B2 lesson)
    served     BOOLEAN NOT NULL DEFAULT false
  );
  CREATE INDEX idx_history_embeddings_served ON history_embeddings
    USING hnsw (embedding vector_cosine_ops) WHERE served;
  ```
  Rationale (measured 2026-08-19): the shared `embeddings` table carries 14 indexes / 13 GB and
  serves at 20–36 rows/sec because `served` is six-ways indexed and rows are 4,100 B (no HOT).
  A history-only table keeps the graph tens of MB; serving the whole register is seconds.
- **Voices registers stay in `embeddings`.** The exegetical pool spans commentary+father in ONE
  vector search; per-register splits would force cross-table merges on the request path. The
  served-partial indexes already isolate reads per lane. Separate follow-up (NOT this slice):
  measure whether `idx_embeddings_vector` (8 GB, all-rows) is used by any shipped query; if not,
  dropping it is the cheap write-amplification win.
- Serving: `scripts/serve-batched.mjs` gains `--table=history_embeddings` (same preflight, same
  `served IS NOT TRUE` idempotency, same TTY gate) — or a 40-line sibling if a flag is uglier.

## 2b. The Josephus transition (the one history work serving TODAY)

`josephus-whiston` serves right now through **6,492 flat rows in the shared `embeddings` table**
(`idx_embeddings_served_historian`, `SERVED_HISTORIAN_WORKS=['josephus-whiston']`), put there by
the one-off `copy-josephus-flat.mjs`. This design's "history never enters `embeddings`" is the END
state; the transition is:

1. **Backfill** `history_embeddings` from `section_embeddings` — `INSERT..SELECT`, **zero
   re-embedding**: dev verifiably holds 4,112/4,112 section vectors for josephus
   (`ingest-historian` has always written them; measured 2026-08-20).
2. **Serve** in the new table (`serve-batched --table=history_embeddings`, owner gate). Seconds,
   not hours — the graph is tens of MB.
3. **Cut the history read path** to the new table and prove it (frozen queries + browser walk).
4. **Only then retire the old side** (owner-gated migration): unserve/remove the 6,492 shared-table
   rows, drop `idx_embeddings_served_historian`, delete `SERVED_HISTORIAN_WORKS`. New path proven
   before old rows die; no serving gap.

**Consequence requiring an owner ruling (decision #4, §9):** the standalone ruling — history never
searches with anything else — read strictly RETIRES the `/ask` historian register lane, where
josephus answers today beside the other lanes. Step 4 executes that only if ruled.

## 3. Retrieval pipeline (deterministic, no LLM in v1)

`searchHistory(query)`:
1. **Entity match** — the query-time entity vocabulary is **DERIVED from
   `section_history_anchors`** (`SELECT DISTINCT entity_slug, entity_label`, cached), never a
   second copy of the gazetteer — so query matching cannot drift from what the corpus actually
   anchors. Matching is verbatim tokens only; no fuzzy, no embedding-based entity guessing.
   The INGEST-time gazetteer (`history-gazetteer`) stays hand-seeded — editorial curation — and
   its enforcement is (a) the verbatim-presence check and (b) a **per-work anchor-coverage gate**:
   the ingest digest reports anchors/section and distinct entities per work, and a work landing at
   ~zero anchors is FLAGGED for review, never silently admitted. Baseline (the one ingested work):
   josephus 4,540 anchors / 4,112 sections = 1.10/section. Coverage for the other 32 is a property
   of the ingest run and cannot be pre-measured — they have no rows yet.
2. **Period parse** — verbatim "A.D. 325"/"325 B.C." forms plus a fixed table of natural spans
   ("first century" → 1..100). Deterministic mapping, exported constant, unit-tested.
3. **Candidates** (union, capped 200):
   a. sections joined via `section_history_anchors` on matched entities
   b. sections with `period_*` overlapping a parsed period
   c. vector top-50 from `history_embeddings WHERE served` (embed the query, bge-large)
   d. FTS over `sections.tsv` scoped to historian works (heading-weighted; the 016 tsv fix)
4. **Rank** — one exported constant, one determinism test. The v1 weights are
   **pre-registered ORDINAL priors**: the design commitment is the ORDER — verbatim entity match >
   period overlap > cosine > fts — on precision grounds (a verbatim entity hit is near-certain
   relevance; cosine is a guess). Magnitudes `3 / 2 / 1 / 0.5` are declared, not derived, and the
   frozen eval set (§7) is a REGRESSION floor, never a tuning target. Weight TUNING is a defined
   later slice: once history search logs real usage (its own ask_outcomes-style table), build a
   dev set of n≥50 logged queries and apply the ADR-103 two-split (derive on dev, validate once on
   a disjoint held-out). A 12/8 split of the frozen 20 was considered and REJECTED as underpowered:
   one validation query = 12.5 points, below the resolution of any claim worth shipping.
   Ties: work tier, then `unit_ordinal`. Works ordered by their best section.
5. **Scope** — `source_type='historian' AND status='published'` AND served vectors only.
   OPEN (owner): whether npnf201/202/203 (Eusebius, Socrates/Sozomen, Theodoret — genre history,
   shelved `father`) join history search via an explicit allowlist. Default: OUT until ruled.

## 4. API

`POST /api/history/search` — auth `requireUser`; zod at the edge `{query: string 1..500}`;
rate limit 30/min·500/day per user (the corpus-search caps, own bucket); node runtime.
Response (the whole contract — no other fields reach the client):
```ts
{ interpretation: { entities: {slug,label}[], period: {start,end} | null },
  closest: Result | null,
  results: { work: {slug,title,author}, periodSpan: [number,number] | null,
             sections: Result[] }[],           // grouped, ≤3 shown per work
  coverage: { works: number, sections: number } }
// Result = { sectionId, ordinal, headingPath: string[], period: [number,number] | null,
//            excerpt: string /* exact substring, ≤420 chars, server-asserted */,
//            matched: ('entity'|'period'|'text')[] }
```
Thread persistence: rides chats/messages under persona `'history'` — NO migration was needed
(built 2026-08-20; `web/src/lib/history-threads.ts`); results render at `/ask/[id]` by persona.
**Telemetry: NO event ships in v1 — corrected 2026-08-20 after independent review found this doc
claiming a `history_search` PostHog event with zero `.capture()` calls in the tree.** The tuning
set (n≥50 logged queries, §3.4) sources from the history THREADS themselves — persona='history'
rows are already per-account persisted queries — so nothing depends on PostHog, matching the
owner's ruling that analytics stay beside the product. Any future event carries ONLY
`{result_count, had_entity, had_period}`, never query text (PostHog ruling, 2026-08-18).

## 5. Wireframes — stages & click matrix

(Reproduced in full in the 2026-08-20 session log; the stages below are normative.)

### Stage 0 — entry (/ask)
Segmented control `[ Voices | History ]` under the existing search box.
- Click History: sets `?mode=history` via replaceState (no nav); hides lane checkboxes; placeholder
  becomes "Ask about people, places, events — e.g. 'the church at Ephesus'"; renders coverage line
  ("Searches N history works"); focus returns to input. Deep-linkable.
- Submit (History): POST above → create thread → navigate `/ask/[id]`. Empty input: button disabled.
  >500 chars: client-blocked with count, same as voices.

### Stage 1 — history empty state (mode on, no query yet)
Contract line (fixed string): "History points you into the sources. It never summarizes."
Three example chips — click fills the input AND submits (one code path with the button).
Coverage panel: works-by-century counts from a cached census (never computed per-request).

### Stage 2 — results (/ask/[id], mode=history)
Top to bottom:
1. **QueryEcho**: the query verbatim (escaped) · "New search" → `/ask?mode=history`, input focused.
2. **InterpretationStrip**: chips for matched entities + period. Click a chip = client-side toggle
   filter over the already-returned set (no refetch), `aria-pressed`, counts update. This strip is
   the honesty mechanism: the user SEES that "cease" matched nothing. **Filtered counts are framed
   "within these results" (fixed string)** — the returned set is capped (200), so an unframed
   "0 matches" after toggling would be a lie about the corpus when it is only a fact about the cap.
   All coverage numbers on this page (works, sections, century buckets) are DERIVED from served
   state with their **invalidation point at serve flips** — never hand-counted, never cached past
   a flip (the 9-vs-10 source-count class).
3. **ClosestMatch card** (hero): fixed label "Closest match to your question" · work/author ·
   heading-path breadcrumb · period badge · excerpt (≤420 chars). Whole card is ONE `<a>` →
   `/work/[slug]?section=[ordinal]&hl=[sectionId]&from=[threadId]`. Enter activates.
4. **ResultsList** grouped by work: group header (title, author, N matched, period span) + ≤3
   section rows. "Show all N" → client-side reveal, `aria-expanded`, no fetch. Row = same deep
   link. Per-row cite icon → clipboard "Author, Title, Heading path (CCEL)" + toast. Match-reason
   glyphs (entity/period/text) with tooltip on desktop, tap-popover on mobile.
5. **TimelineRail**: desktop right rail, century buckets with counts; click bucket = same
   client-side period filter as the chips. Mobile: horizontal chip strip in its own
   `overflow-x-auto` container above the list. Empty buckets unrendered.
6. **CoverageFooter**: "Searched N works · M sections" → historian catalog in the Library.
ABSENT BY DESIGN: any generated prose block. v2's conversational layer docks above the hero and
does not ship without its own bait suite.

### Stage 3 — reader landing
`/work/[slug]?section=N&hl=…&from=…` reuses the B030 scroll-and-highlight path (generalize its
param handling; do not build a second mechanism). ONE new component, `ContextBar` (~40px):
heading-path breadcrumb · period badge · "← Back to results" (history.back() when `from` present
and referrer is same-origin, else `/ask/[threadId]`) · dismiss X (sessionStorage). Nothing else
changes in the reader.

### Stage 4 — states (all fail closed)
- No entity/period matched: fixed line "No known people or places matched — showing text matches."
- Zero results: "Nothing in the N served history works matches this." + shelf link + example chips.
  NO generated suggestions.
- API error: "History search is unavailable right now." + Retry. Never partial/unverified content.
- 429: card with reset time, input disabled with countdown.
- OPEN (owner, default OFF): whether to name unserved works that WOULD have matched.

### Stage 5 — mobile 390px
Full-width segmented control; timeline as scroll-x strip; excerpts clamp to 3 lines; heading paths
truncate the HEAD (tail = the specific chapter, most informative); tap targets ≥44px; no
hover-only affordances. DoD: loaded and screenshotted at 390px AND desktop, one real query
end-to-end, no horizontal overflow, no console errors.

Converter/ingest note: embedding-input discipline is ALREADY ENFORCED in the shipped ingester —
`ingest-historian.ts` caps chunks at `EMBED_MAX=1800` chars, asserted before the call (bge-large's
512-token budget). The converter feeds that path; it does not grow a second chunking mechanism.

## 6. Tests the agent writes FIRST (red before fix)
1. excerpt-is-exact-substring contract test (the v1 faithfulness gate) — seed a mutated excerpt, red.
2. route auth + zod rejection + rate-limit tests (A1-16 pattern).
3. ranking determinism: same inputs, same order; weights only from the exported constant.
4. history never joins voices — BEHAVIORAL, not string-matched: (a) every result row the
   history route returns carries `source_type='historian'` (or the ruled genre allowlist);
   (b) EXPLAIN on `/api/ask`'s shipped retrieval never references `history_embeddings`, the
   servability-belt pattern. A string assertion on SQL text was considered and rejected as
   brittle.
5. serve tooling: `--table=history_embeddings` preflight red-proof (refuses unpublished work).
6. Browser walk at 390px + desktop per DoD, screenshots into evidence.

## 7. Eval (quality-slice discipline)
Freeze a ~20-query set (entity, period, entity+period, no-match controls) BEFORE the first
accuracy number; pre-register bars; failure-code misses (no-entity / wrong-section / no-content).
No bar exists yet and none may be invented after seeing results.

## 8. Out of scope
Reader overhaul · conversational layer (v2, bait-gated, premium) · ingesting ANF09/ANF10 ·
Great Awakening acquisitions (parked: CCEL search inconclusive) · any change to voices retrieval.

## 8b. LAUNCH GATES (independent review, 2026-08-20 — hold LAUNCH, not the prod walk)

1. **Similarity floor for nonsense queries.** A control query ("best sourdough starter recipe")
   correctly matches zero entities and zero period — the honesty strip is clean — but the vector
   leg still surfaces nearest-neighbor text, so the reader sees a "Closest match to your question"
   hero for sourdough. The pre-registered bars gate interpretation honesty only, so this PASSES
   while rendering what Stage 4's empty state exists to prevent. The floor is derived on the
   logged-queries tuning set, never on the frozen 20. Fine for the owner walk behind the site
   gate; **must resolve before real users.**

**Known limit, recorded:** heading paths round-trip through ' — ' (the ingest contract joins on
it; the UI splits on it). A natural em-dash-with-spaces inside a heading mis-splits in DISPLAY
only; the real fix is an array-typed path — a schema change, out of v1 scope.

## 9. Open owner decisions
1. npnf201/202/203 in history search scope — both reviewer and author recommend IN (Eusebius is
   the father of church history; a history search that cannot find him is product-visibly absurd).
   Mechanism if ruled IN: **`genre:'history'` metadata on the manifest entries** — scope derived
   from data carried per work, never a slug list in code (a slug allowlist is the watchlist's
   hand-maintained-set artifact). Default OUT until ruled.
2. Advertise unserved-but-matching works in empty states — default OFF.
3. v2 conversational layer: pricing/gating (owner floated premium).
4. Does the `/ask` historian register lane RETIRE when standalone history ships? (§2b consequence —
   strict reading of the standalone ruling says yes; execution is step 4 of the transition.)
