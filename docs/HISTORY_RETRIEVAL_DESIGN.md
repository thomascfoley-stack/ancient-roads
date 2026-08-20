# HISTORY_RETRIEVAL_DESIGN — the history lane, end to end

**Status: DESIGN FOR OWNER APPROVAL — nothing below is implemented.** This is the document
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

## 3. Retrieval pipeline (deterministic, no LLM in v1)

`searchHistory(query)`:
1. **Entity match** — gazetteer (`history-gazetteer`) tokens found VERBATIM in the query →
   `entity_slug[]`. No fuzzy, no embedding-based entity guessing.
2. **Period parse** — verbatim "A.D. 325"/"325 B.C." forms plus a fixed table of natural spans
   ("first century" → 1..100). Deterministic mapping, exported constant, unit-tested.
3. **Candidates** (union, capped 200):
   a. sections joined via `section_history_anchors` on matched entities
   b. sections with `period_*` overlapping a parsed period
   c. vector top-50 from `history_embeddings WHERE served` (embed the query, bge-large)
   d. FTS over `sections.tsv` scoped to historian works (heading-weighted; the 016 tsv fix)
4. **Rank** — one exported constant, one test:
   `score = 3·entityHit + 2·periodOverlap + cosine(normalized) + 0.5·ftsRank(normalized)`
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
Thread persistence: reuse Research History threads with `mode:'history'`; results render at
`/ask/[id]` by mode branch. Telemetry: PostHog event `history_search` carrying ONLY
`{result_count, had_entity, had_period}` — never query text (PostHog ruling, 2026-08-18).

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
   the honesty mechanism: the user SEES that "cease" matched nothing.
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

## 6. Tests the agent writes FIRST (red before fix)
1. excerpt-is-exact-substring contract test (the v1 faithfulness gate) — seed a mutated excerpt, red.
2. route auth + zod rejection + rate-limit tests (A1-16 pattern).
3. ranking determinism: same inputs, same order; weights only from the exported constant.
4. history never joins voices: assert the history query text contains no exegetical
   predicate and `/api/ask` retrieval touches no `history_embeddings` (derived, not typed).
5. serve tooling: `--table=history_embeddings` preflight red-proof (refuses unpublished work).
6. Browser walk at 390px + desktop per DoD, screenshots into evidence.

## 7. Eval (quality-slice discipline)
Freeze a ~20-query set (entity, period, entity+period, no-match controls) BEFORE the first
accuracy number; pre-register bars; failure-code misses (no-entity / wrong-section / no-content).
No bar exists yet and none may be invented after seeing results.

## 8. Out of scope
Reader overhaul · conversational layer (v2, bait-gated, premium) · ingesting ANF09/ANF10 ·
Great Awakening acquisitions (parked: CCEL search inconclusive) · any change to voices retrieval.

## 9. Open owner decisions
1. npnf201/202/203 in history search scope (allowlist) — default OUT.
2. Advertise unserved-but-matching works in empty states — default OFF.
3. v2 conversational layer: pricing/gating (owner floated premium).
