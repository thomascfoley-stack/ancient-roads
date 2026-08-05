// Reference-routing orchestration — the SINGLE SOURCE OF TRUTH shared by the
// production retrieval path (retrieve.ts → retrieveCommentary) and the accuracy
// eval (scripts/eval-routing.mts). The eval cannot import retrieve.ts (it pulls
// in `server-only` via rerank.ts), so before this module the eval hand-duplicated
// the inject cap, injection SQL, pool merge, and floor — meaning the measured
// number was validated on a look-alike, not the shipped pipeline. Everything that
// could silently drift now lives here; the server-only pieces (the rerank model
// call, the db handle) are injected by each caller.
//
// This module must stay free of `server-only` and any server-only import so a
// plain tsx script can load it. Keep it pure orchestration + constants.

import type { VerseRange } from '../../bible/ref-parse';
import type { NeonQueryFunction } from '@neondatabase/serverless';

export const CANDIDATE_POOL = 20; // base hybrid/vector pool size fed to the reranker
const INJECT_CAP = 8; // max on-range candidates injected into the pool (baked into injectionSql)
export const RERANK_MODEL = 'Qwen/Qwen3-Reranker-0.6B';
export const RERANK_DOC_CHARS = 1200; // per-doc truncation fed to the reranker

// ⚠️ BETA DEBT (beta wall 2, 2026-07-11) — the license-verified corpus as a HARD-CODED
// author allowlist, the SINGLE source shared by production retrieveCommentary AND the
// held-out eval so the two can never diverge again (that divergence was the bug: the
// eval measured pure-vector-on-this-filter = 65/72, while prod ran hybrid over the WHOLE
// table incl. quarantined content). The permanent fix is the sources/sections `status`
// column at GA (docs/MIGRATION_DESIGN.md); until then this constant IS "published".
// Verified against the DB 2026-07-11: 0 biblehub/studylight rows inside it; excluded
// authors are all non-verified provenance. KNOWN residual: Augustine + Chrysostom rows
// carry historicalchristian.faith provenance (text PD-verified vs New Advent NPNF/ANF,
// provenance repair to New Advent pending) — flagged as pre-beta debt in the work order.
// ── REGISTERS (CONTENT_GO_LIVE.md decision 2, 2026-07-16) ──
// The served corpus is register-aware. PROSE registers (commentary, sermons,
// fathers, theology, confessions, lexicons) share ONE pool — they are exegetical
// voices. SONG/VERSE registers (hymns, poetry) are a DISTINCT labeled register:
// retrieved by their own pool + partial index, surfaced separately, NEVER blended
// into the exegetical voices and NEVER counted toward the exegetical ≥2-voices
// floor. Membership below IS the publish switch for the flat table (the owner
// authorized auto-publish of the verified-PD clean tier once Gate B + quality
// gates pass): a work's rows are served iff its slug is in the served list and
// the row's metadata->>'work' carries it. The 006 status column remains the
// permanent fix (GA cutover, tracked separately).
export const SERVED_PROSE_TYPES = ['commentary', 'sermon', 'father', 'theology', 'confession', 'lexicon'] as const;
export const SERVED_SONG_VERSE_TYPES = ['hymn', 'poetry'] as const;

// Auto-publish tier (Gate B verified-PD/CC-BY; owner-authorized). Deliberately
// EXCLUDED and staged instead: origen-commentary (standing MUST_NOT_SERVE
// 'Origen' ruling — escalated, owner reconciles), thayers-lexicon (OCR tier),
// the three historians (no read path), and the v2 staged commentaries
// (poole-tcp/scofield/pnt — the parked LEGAL_CORPUS_FILTER collision call).
// ONLY works that are ingested (or in tonight's gated queue) AND clean. A slug
// here is the publish switch — a work that was never ingested, or is
// quarantined, must NOT be pre-authorized (A6 2026-07-17: the full 46-work list
// made one-line publishes of quarantined/never-verified works invisible).
// Removed pending follow-ups: spurgeon-treasury (CCEL = page scans), ryle/
// vincent (author-page mislabeling), isbe/eastons/smiths/naves/bdb/thayers
// (zLD/RawLD + structured-data decoders not built).
// EXEGETICAL pool (the /ask ≥2-voices commentary pool) = verse-anchored
// commentary + fathers ONLY. Sermons and systematic-theology are DISTINCT
// registers with their own lanes below — they are not exegetical verse-commentary
// and (measured, docs/SERMON_LANE_DIAGNOSIS.md 2026-07-18) diluted broad-query
// retrieval when pooled together. Owner decision (c): keep verse-commentary +
// fathers exegetical; route sermons + theology to labeled lanes.
export const SERVED_PROSE_WORKS = [
  'keil-delitzsch', 'catena-aurea', 'chrysostom-homilies', 'augustine-homilies',
] as const;
// The SERMON register lane (homiletical exposition — Spurgeon, Maclaren, the
// Puritans). Retrieve-and-quote in its own pool + labeled payload; the reusable
// sermon-search retrieval core. NEVER in the exegetical pool or its voice floor.
// `spurgeon-talks-to-farmers` added 2026-08-02 by owner decision ("add it so all sermons are
// live"). It was the ONLY clean, unquarantined sermon-type work in the manifest absent from this
// list, and nothing recorded why — the A8 draft flagged the omission's intent as NOT ESTABLISHED.
// Its non-authorial back matter is already suppressed (`suppress-nonauthorial-matter.ts`: ordinals
// 299-300, "publisher's back-matter"), so it is curated, not raw.
// NOT added, and this is the one sermon that stays out: `whitefield-works` is `serve:false` in the
// manifest for a QUALITY reason, not an oversight — Project Gutenberg vol 1 of 6, no clean sermon
// boundaries. "All sermons live" does not reach it without revisiting that ruling.
export const SERVED_SERMON_WORKS = [
  'spurgeon-sermons', 'maclaren-expositions', 'watson-works', 'flavel-works',
  'edwards-works', 'wesley-sermons', 'spurgeon-talks-to-farmers',
] as const;
// The THEOLOGY/CONFESSION register lane (systematic + confessional — topical
// treatises, not verse-commentary). Same lane machinery, its own labeled payload.
export const SERVED_THEOLOGY_WORKS = [
  'owen-works', 'hodge-systematic', 'calvin-institutes', 'schaff-creeds',
] as const;
// whitefield-works quarantined 2026-07-18 (PG vol 1/6, no clean sermon boundaries)
// herbert-temple/montgomery-sacred-poems/rossetti-verses RECOVERED 2026-07-17
// (archive.org Cassell 1887 / CCEL title-div fallback / PG title-line splitter).
// Still quarantined: bramley-carols (all sources are engraved-music editions,
// 27-31% OCR garbage), donne-divine-poems/herrick-noble-numbers (A6: whole
// secular volumes under sacred titles — need section-scoped profiles).
export const SERVED_SONG_VERSE_WORKS = [
  'olney-hymns', 'scottish-psalter-1650', 'neale-eastern-hymns',
  'watts-hymns', 'watts-psalms',
  'keble-christian-year', 'herbert-temple', 'montgomery-sacred-poems',
  'rossetti-verses',
  'traherne-poems', 'milton-poetical-works', 'hopkins-poems',
  'tennyson-in-memoriam', 'dante-divine-comedy', 'wheatley-poems',
] as const;

const sqlStrList = (xs: readonly string[]) => xs.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');
export const PROSE_TYPE_SQL = `source_type IN (${sqlStrList(SERVED_PROSE_TYPES)})`;
export const SONG_VERSE_TYPE_SQL = `source_type IN (${sqlStrList(SERVED_SONG_VERSE_TYPES)})`;

// The two prose LANES (sermon, theology) — distinct registers, their own pools.
// SERVED_LANE_WORKS = every work routed to a lane (never exegetical). Used by the
// register wall + FTS exclusion so a lane work can never re-enter the /ask
// exegetical pool or the FTS commentary search.
export const SERVED_LANE_WORKS = [...SERVED_SERMON_WORKS, ...SERVED_THEOLOGY_WORKS] as const;

// EVERY work list that decides retrieval serving, named once. This exists because the publish
// admission rule (MASTER.md #a3-rule) asks ONE question — "will anything actually serve this
// work's rows?" — and until 2026-08-02 two separate tools each answered it by hand-composing
// SERVED_PROSE_WORKS ∪ SERVED_LANE_WORKS. That union silently omits SERVED_SONG_VERSE_WORKS, so
// all 15 hymn/poetry works were NOT-ADMITTED against a SONG_VERSE_CORPUS_FILTER that serves
// exactly them: a published hymn would have STOPPED the flip with "served by nothing", which is
// false, and no hymn could ever reach a flip list at all. Eleventh instance of this repo's most
// frequent defect class (MASTER.md failure-mode watchlist, artefact 1) — and the test that was
// supposed to prove the census imports the right predicates named the same two lists by hand, so
// it certified the gap rather than catching it.
//
// ADD A NEW SERVED_*_WORKS LIST AND YOU MUST ADD IT HERE. That is not a convention: it is
// enforced by test/invariants/publish-admission-covers-served-lists.test.ts, which derives the
// list set from this file's own source rather than from a second hand-typed copy.
//
// NOT a serving predicate and deliberately absent: `historian`. Historians have a catalog shelf
// and a Book Reader path (catalog-defs.ts, published-gated) but NO retrieval lane, so they are
// served-as-shelf and unserved-as-retrieval. That distinction is an open owner decision, not
// something to paper over by inventing a list here — see the A8 decision list.
export const SERVED_WORK_LISTS = {
  prose: SERVED_PROSE_WORKS,
  sermon: SERVED_SERMON_WORKS,
  theology: SERVED_THEOLOGY_WORKS,
  songVerse: SERVED_SONG_VERSE_WORKS,
} as const;

/** The admission population: every work some retrieval predicate serves. Derived, never typed. */
export const ALL_SERVED_WORKS: readonly string[] = Object.values(SERVED_WORK_LISTS).flat();

// ── THE SERVING SWITCH, AS OF MIGRATION 044 ──────────────────────────────────────────────────
// `embeddings.served` is the switch for VECTOR RETRIEVAL: the four *_CORPUS_FILTER constants
// below and the four partial HNSW indexes consult it and nothing else.
//
// ⚠ THE SERVED_*_WORKS LISTS ABOVE ARE STILL LIVE GATES ON THREE OTHER SURFACES. The first
// version of this comment said "adding a slug to one of them serves nothing" — FALSE, caught by
// the 2026-08-03 audit, and false in the fail-open direction for one of the three:
//   1. legal-corpus.ts PUBLISHED_WORKS       — the static-reader filter (what the verse reader
//      renders from web/public/commentaries) unions SERVED_PROSE_WORKS in.
//   2. legal-corpus.ts LEGAL_COMMENTARY_ENTRIES_PREDICATE — the commentary_entries FTS surface
//      admits by a work-IN leg built from these lists (that table has no `served` column).
//   3. EXEGETICAL_FTS_EXCLUSION (below)      — the FTS wall excludes lane/hymn works BY SLUG as
//      its second leg; pruning a list widens what FTS treats as exegesis.
// For vector retrieval the lists are the frozen record of what 044's backfill turned on; for
// those three surfaces they are load-bearing until their own cutover (filed, separate work).
// Editing them therefore still changes production behaviour. Do not prune.
//
// WHY THE CHANGE. `sources.status='published'` and "served" were two unrelated facts. 76 of the
// 77 works published to production on 2026-08-03 were in none of these lists, so they were
// shelf-readable and invisible to /ask, and making one serve meant a code edit plus a rebuild
// migration plus an HNSW graph rebuild, in lockstep, forever. The lists were the thirteenth instance
// of the hand-maintained-expected-set class (MASTER.md watchlist, artefact 1). The others were
// closed by DERIVATION; this one cannot be, because a partial index predicate may not contain a
// subquery — so it is MATERIALIZED, and `scripts/publish-flip.mjs` is the only writer.
//
// THE SURFACE A ROW REACHES IS ITS REGISTER, not its slug. That is the register wall, expressed
// once, in the column the ingest already writes:
//   commentary, father    -> the composed exegetical pool (counts toward the ≥2-voices floor)
//   sermon                -> the sermon lane      (retrieve-and-quote, labeled, never composed)
//   theology, confession  -> the theology lane    (ditto)
//   hymn, poetry          -> the song/verse lane  (ditto, never counted toward the floor)
//   lexicon               -> served by nothing; no lane exists (open A8 decision, not an oversight)
// Each conjunct below is byte-matched by a partial HNSW index predicate in migration 044
// (044_embeddings_served_expand.sql; the old-name indexes survive until 045 so the pre-044
// bundle keeps planning during the deploy window). If they drift, the planner silently falls
// back and the pool starves with no error — how migration 009 died — so
// `legal-hnsw-index-sync.test.ts` compares them, and `verify-served-backfill.mjs` proves the
// backfilled column against the FROZEN pre-044 filters (never against this module: deriving the
// expectation from the file under test is the circularity the 2026-08-03 audit confirmed).
export const EXEGETICAL_TYPE_SQL = `source_type IN ('commentary','father')`;
export const SERMON_CORPUS_FILTER = `(served AND source_type = 'sermon')`;
export const THEOLOGY_CORPUS_FILTER = `(served AND source_type IN ('theology','confession'))`;

// Exegetical-surface exclusion for commentary_entries (the FTS search). Excludes
// song/verse AND lane (sermon/theology/confession) rows TWO ways so neither a
// NULL/missing register column NOR a slug rename/NULL work can fail the wall
// open (A6 line-by-line 2026-07-17; sermon lane 2026-07-18; deep-audit
// 2026-07-18 closed the sermon/theology register leg — before that, lane rows
// were excluded by slug enumeration ONLY). Legacy commentary rows (register
// NULL, work NULL) still pass.
export const EXEGETICAL_FTS_EXCLUSION = `(register IS NULL OR register NOT IN ('hymn','poetry','sermon','theology','confession')) AND (work IS NULL OR work NOT IN (${sqlStrList([...SERVED_SONG_VERSE_WORKS, ...SERVED_LANE_WORKS])}))`;

// AUTHOR COUNT, settled (dev-measured 2026-07-20, positive control fires): this filter names 9
// author STRINGS below but ADMITS 11 distinct authors — the final `work IN (SERVED_PROSE_WORKS)`
// leg adds "C.F. Keil & Franz Delitzsch" (keil-delitzsch) and "Thomas Aquinas (comp.), trans.
// J.H. Newman" (catena-aurea), which no name leg covers. Use 11 for "authors served"; 9 only means
// "names written here". A "12" anywhere is a miscount — it reads "Keil & Delitzsch" as two people;
// it is one metadata->>'author' string. See docs/STATE_OF_TRUTH.md §2.
// MIGRATION 044 (first committed as 039; renumbered for the /plans collision) replaced the author allowlist that stood here with `served`. The allowlist was
// load-bearing in the LICENSING sense, not just the routing sense — the flat table carries 124,955
// rows with no work key, and that cohort holds Tyndale Study Notes (13,455), CS Lewis (745) and
// Origen of Alexandria (794), all copyrighted or under a standing MUST_NOT_SERVE ruling. They were
// excluded by not being named. They are now excluded by `served` defaulting to false and the
// publish flip addressing rows BY SLUG, which those rows do not have: unreachable rather than
// unnamed, which is strictly stronger. 044's backfill reproduced this filter's row set exactly, so
// the pool did not change when the mechanism did — proven, not asserted, by
// `scripts/verify-served-backfill.mjs` diffing both directions on a live database.
export const LEGAL_CORPUS_FILTER = `(served)`;

// The song/verse register's own served filter (its partial index twin lives in
// migration 018; legal-hnsw-index-sync-style lockstep applies).
export const SONG_VERSE_CORPUS_FILTER = `(served)`;

// hnsw.ef_search for the base-pool KNN walk. With the partial legal HNSW index (migration
// 012) every neighbour is already legal, so a modest ef fills the pool — no iterative_scan,
// no full-graph re-walk (which is where Phase A's 12–14s came from). Swept ef∈{64,128,200}
// on v3 2026-07-14: accuracy is IDENTICAL across all three (once ef fills the pool, walk
// depth doesn't change the reranked top-6), so we ship the SMALLEST that reliably fills —
// ef=64 returns 50/50 across sampled vectors, at ~270ms. Re-tune via the eval's --ef sweep.
export const HNSW_EF_SEARCH = 64;

// The base candidate pool SQL. PRIVATE on purpose — the ONLY public entry is
// legalBasePool(), which wraps this in a transaction that sets hnsw.ef_search. Exporting
// the raw string is exactly how a 4th call site silently ships at the default ef_search=40
// and starves (asking for 50 legal rows returned 5, diagnostic 2026-07-14). One way in.
function legalBasePoolSql(pool: number, extraFilter = ''): string {
  // extraFilter: a read-only DIAGNOSTIC knob (default '' → identical production
  // SQL). The sermon-lane slice (2026-07-18) uses it to measure the pool with
  // certain source_types/works excluded, through THIS shipped path — never a
  // lookalike. Production callers never pass it.
  // EXEGETICAL_TYPE_SQL, not PROSE_TYPE_SQL: the six-type list was never the pool's real boundary
  // (every row the old author allowlist admitted was source_type='commentary', and its work leg
  // named commentary + father works, so sermon/theology/confession/lexicon were carried in the
  // type list and excluded again by the allowlist). These two conjuncts byte-match migration 044's
  // `idx_embeddings_vector_legal` predicate; drift starves the pool silently.
  return `SELECT source_id, 1 - (embedding <=> $1::vector) AS score, content, metadata
     FROM embeddings
     WHERE user_id IS NULL AND ${EXEGETICAL_TYPE_SQL} AND ${LEGAL_CORPUS_FILTER}${extraFilter ? ` AND ${extraFilter}` : ''}
     ORDER BY embedding <=> $1::vector LIMIT ${pool}`;
}

export interface BasePoolRow { source_id: string; score: number; content: string; metadata: unknown }

// THE base candidate pool: top-`pool` PURE-VECTOR matches over the legal corpus, via the
// partial legal HNSW index (012). Owns the GUC: `set_config('hnsw.ef_search', …, true)` is
// transaction-local, and a bare SET LOCAL on stateless HTTP is a no-op — so it MUST run in
// the same sql.transaction() as the SELECT (the runAsUser pattern, proven through the
// pooler). This is what makes CANDIDATE_POOL real: `pool` in, `pool` out, not ~5. Shared by
// prod (retrieve.ts) and the eval so the measured number is exactly what production serves.
// `vec` is the '[…]' vector literal; `ef` defaults to the shipped HNSW_EF_SEARCH.
export async function legalBasePool(
  sql: NeonQueryFunction<false, false>,
  vec: string,
  pool: number = CANDIDATE_POOL,
  ef: number = HNSW_EF_SEARCH,
  extraFilter = '', // read-only diagnostic knob; default '' = production SQL
): Promise<BasePoolRow[]> {
  const results = await sql.transaction([
    sql`SELECT set_config('hnsw.ef_search', ${String(ef)}, true)`,
    sql.query(legalBasePoolSql(pool, extraFilter), [vec]),
  ]);
  return results[1] as BasePoolRow[];
}

// On-range injection: the top INJECT_CAP vector matches WITHIN the named passage's
// verse range(s). A MATERIALIZED CTE range-scan (served by the 007 partial verseId
// index) — NOT an HNSW post-filter, which returns empty on a selective filter.
// $1 = query vector. `corpusFilter` splices an extra predicate with AND (the eval's
// legal PUBLISHABLE set; empty for the full production corpus). Range bounds are
// integers straight from parseRef, so inlining them is injection-safe.
export function injectionSql(ranges: readonly VerseRange[], corpusFilter = ''): string {
  const conds = ranges
    .map((r) => `(metadata->>'verseId')::int BETWEEN ${r.start} AND ${r.end}`)
    .join(' OR ');
  // `served` here is what makes migration 044's `idx_embeddings_verseid_served` usable for the
  // range scan. Without it this falls back to the register-scoped 018 btree and re-reads rows the
  // pool cannot serve anyway. The eval splices its own corpusFilter on top; production passes ''.
  return `WITH inrange AS MATERIALIZED (
     SELECT source_id, content, metadata, embedding FROM embeddings
     WHERE user_id IS NULL AND served AND ${EXEGETICAL_TYPE_SQL}${corpusFilter ? ` AND ${corpusFilter}` : ''} AND (${conds})
   )
   SELECT source_id, 1 - (embedding <=> $1::vector) AS score, content, metadata
   FROM inrange ORDER BY embedding <=> $1::vector LIMIT ${INJECT_CAP}`;
}

// ── the SONG/VERSE register pool (hymns + poetry) ──
// Retrieve-and-quote, never composed over: results surface as a separate labeled
// payload in /api/ask, so no verifier surface is added and the exegetical
// ≥2-voices floor never counts them. Verse-anchored items first (a hymn ON this
// passage), semantic fill behind them. Served by the 018 partial HNSW twin.
export const SONG_VERSE_LIMIT = 3;

export function songVerseOnRangeSql(ranges: readonly VerseRange[]): string {
  const conds = ranges
    .map((r) => `(metadata->>'verseId')::int BETWEEN ${r.start} AND ${r.end}`)
    .join(' OR ');
  return `WITH inrange AS MATERIALIZED (
     SELECT source_id, content, metadata, embedding FROM embeddings
     WHERE user_id IS NULL AND ${SONG_VERSE_TYPE_SQL} AND ${SONG_VERSE_CORPUS_FILTER} AND (${conds})
   )
   SELECT source_id, 1 - (embedding <=> $1::vector) AS score, content, metadata
   FROM inrange ORDER BY embedding <=> $1::vector LIMIT ${SONG_VERSE_LIMIT}`;
}

export function songVersePoolSql(pool: number = SONG_VERSE_LIMIT): string {
  return `SELECT source_id, 1 - (embedding <=> $1::vector) AS score, content, metadata
     FROM embeddings
     WHERE user_id IS NULL AND ${SONG_VERSE_TYPE_SQL} AND ${SONG_VERSE_CORPUS_FILTER}
     ORDER BY embedding <=> $1::vector LIMIT ${pool}`;
}

// ── the REUSABLE prose-register LANE primitive (sermon-lane slice 2026-07-18) ──
// A register lane is retrieve-and-quote over ONE work list, in its own pool,
// surfaced as a labeled payload — never composed over, never in the exegetical
// ≥2-voices floor. Same shape as the song/verse lane (kept separate so the proven
// hymn wall is untouched), but parameterized by corpusFilter so sermon, theology,
// and any future prose register share ONE machinery. This is the sermon-search
// retrieval core. `corpusFilter` MUST be a routing constant (SERMON_CORPUS_FILTER
// / THEOLOGY_CORPUS_FILTER), never user input — it interpolates work slugs only.
export const LANE_LIMIT = 3;

export function laneOnRangeSql(corpusFilter: string, ranges: readonly VerseRange[], limit = LANE_LIMIT): string {
  const conds = ranges.map((r) => `(metadata->>'verseId')::int BETWEEN ${r.start} AND ${r.end}`).join(' OR ');
  // The lane corpusFilter now carries its own `served AND source_type=…`, so the standalone type
  // conjunct that used to sit here is redundant for row selection. It is NOT redundant for the
  // planner: the btree predicate must be implied, or this seq-scans the table on the /ask request
  // path (deep-audit 2026-07-18, measured seq scan → index scan). Migration 044's
  // `idx_embeddings_verseid_served` is predicated on `served`, which the corpusFilter supplies,
  // so the implication holds without re-stating a register list the filter already names.
  return `WITH inrange AS MATERIALIZED (
     SELECT source_id, content, metadata, embedding FROM embeddings
     WHERE user_id IS NULL AND ${corpusFilter} AND (${conds})
   )
   SELECT source_id, 1 - (embedding <=> $1::vector) AS score, content, metadata
   FROM inrange ORDER BY embedding <=> $1::vector LIMIT ${limit}`;
}

export function lanePoolSql(corpusFilter: string, pool = LANE_LIMIT): string {
  return `SELECT source_id, 1 - (embedding <=> $1::vector) AS score, content, metadata
     FROM embeddings
     WHERE user_id IS NULL AND ${corpusFilter}
     ORDER BY embedding <=> $1::vector LIMIT ${pool}`;
}

// Merge injected candidates AHEAD of the base pool, de-duped by id (injected win).
export function mergeById<T>(injected: readonly T[], base: readonly T[], id: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of [...injected, ...base]) {
    const k = id(c);
    if (!seen.has(k)) { seen.add(k); out.push(c); }
  }
  return out;
}

// FLOOR: reserve the top 2 slots for the best-ranked items whose verseId falls in a
// high-confidence `floor` range. Guarantees the named passage leads + ≥2 of its
// voices survive; the rest keep rank order. Empty ranges ⇒ untouched. Caller slices
// to its top-K afterward.
export function floorOnRange<T>(
  ordered: readonly T[],
  ranges: readonly VerseRange[],
  verseId: (t: T) => number,
): T[] {
  if (ranges.length === 0) return [...ordered];
  const onRange = (t: T) => { const v = verseId(t); return ranges.some((r) => v >= r.start && v <= r.end); };
  const promote = ordered.filter(onRange).slice(0, 2);
  const rest = ordered.filter((t) => !promote.includes(t));
  return [...promote, ...rest];
}

// COVERAGE FLOOR: does the retrieved set actually cover a CONFIDENTLY-named passage?
// retrieveCommentary takes top-K with NO relevance floor, so a book with zero rows
// (e.g. Song of Solomon) still yields K confident-looking chunks from OTHER books
// scoring as low as 0.005. When the query floors to a passage (high-confidence
// `ranges`) but no retrieved chunk shares a CHAPTER with it, the pool is off-passage
// and the caller must not compose over it. Granularity is CHAPTER, not verse, on
// purpose: a verse-ref we DO cover whose nearest chunk is a neighbouring verse in the
// same chapter still counts as covered — only a wholly-absent book/chapter trips the
// floor. Empty `ranges` (topical queries) are never a coverage question ⇒ covered.
// Chapter key = verseId/1000 (book·1000+chapter), the same key floorOnRange/backfill use.
export function hasPassageCoverage(
  chunks: readonly { verseId: number; verseEnd: number }[],
  ranges: readonly VerseRange[],
): boolean {
  if (ranges.length === 0) return true;
  const asked = new Set<number>();
  for (const r of ranges) {
    for (let ck = Math.floor(r.start / 1000); ck <= Math.floor(r.end / 1000); ck++) asked.add(ck);
  }
  return chunks.some((c) => {
    // verseId is the authoritative start. verseEnd can be 0/null/invalid under data
    // drift; NEVER let a bogus verseEnd pull the low end to 0 (a min() with 0 would
    // span [0, chapter] and false-cover every lower asked chapter, defeating the floor).
    // Fall back to verseId when verseEnd is not a valid end (>= verseId).
    const lo = Math.floor(c.verseId / 1000);
    const hi = Math.floor((typeof c.verseEnd === 'number' && c.verseEnd >= c.verseId ? c.verseEnd : c.verseId) / 1000);
    for (const ck of asked) if (ck >= lo && ck <= hi) return true;
    return false;
  });
}

export const PASSAGE_CAP = 2; // max entries per PASSAGE (chapter) in the final top-K (off-reference)
// Backfill only the top-N surfaced chapters (not all K). The on-target chapter for a
// surfaced=1 miss is almost always among the top reranked; scoping to 3 roughly halves
// the backfill range-scan (measured p50 558→~300ms) with no accuracy loss (WORKLOG).
export const BACKFILL_TOP_CHAPTERS = 3;

// Chapter key = verseId/1000 (book·1000+chapter). Distinct keys among `entries`, first-seen order.
export function chapterKeysOf<T>(entries: readonly T[], chapterKey: (t: T) => number): number[] {
  const seen = new Set<number>();
  for (const e of entries) seen.add(chapterKey(e));
  return [...seen];
}

// ON-PASSAGE BACKFILL: the top-by-vector entry per (chapter, author) across the surfaced
// chapters — the candidate 2nd+ voices. A DISTINCT ON range-scan (007 verseId index);
// ordering by embedding<=>vec within each (chapter,author) self-selects the on-topic verse.
// $1 = query vector. `corpusFilter` splices the legal filter. Chapter keys are integers.
export function diversityBackfillSql(chapterKeys: readonly number[], corpusFilter = ''): string {
  const conds = chapterKeys
    .map((ck) => `(metadata->>'verseId')::int BETWEEN ${ck * 1000 + 1} AND ${ck * 1000 + 999}`)
    .join(' OR ');
  // EXEGETICAL_TYPE_SQL, NOT the six-type PROSE_TYPE_SQL — audit 2026-08-03, CONFIRMED register-
  // wall breach: this function fetches candidate 2nd+ VOICES for the COMPOSED /ask answer, and
  // with the six-type list plus the post-042 `(served)` filter it would splice served Spurgeon/
  // Owen/Hodge rows into composition. Pre-042 the author allowlist excluded lane rows only
  // incidentally; the wall must be structural here exactly as it is in legalBasePoolSql. The
  // three call sites (retrieve.ts, eval-heldout.mts) splice the legal filter via corpusFilter.
  // DISTINCT ON already bounds output to ≤ chapters×authors; the LIMIT is a hard
  // ceiling (defence against an unbounded set if the chapter cap ever grows).
  return `SELECT DISTINCT ON ((metadata->>'verseId')::int/1000, metadata->>'author')
     source_id, 1 - (embedding <=> $1::vector) AS score, content, metadata
   FROM embeddings
   WHERE user_id IS NULL AND ${EXEGETICAL_TYPE_SQL}${corpusFilter ? ` AND ${corpusFilter}` : ''} AND (${conds})
   ORDER BY (metadata->>'verseId')::int/1000, metadata->>'author', embedding <=> $1::vector
   LIMIT ${chapterKeys.length * 12 + 6}`;
}

// Splice the backfilled voices in: right after each surfaced chapter's FIRST (lead) entry,
// add its OTHER distinct authors — so a 2nd voice sits directly behind the lead and can
// survive selection. A fetched voice already present later is PROMOTED (its later dup is
// skipped). Fetched voices on chapters not in `ordered` are dropped (we only strengthen
// passages retrieval surfaced). Pure reordering; the DB fetch is the caller's.
export function insertBackfill<T>(
  ordered: readonly T[],
  fetched: readonly T[],
  id: (t: T) => string,
  chapterKey: (t: T) => number,
  author: (t: T) => string,
): T[] {
  const byChapter = new Map<number, T[]>();
  for (const f of fetched) {
    const ck = chapterKey(f);
    const list = byChapter.get(ck) ?? [];
    if (list.length === 0) byChapter.set(ck, list);
    list.push(f);
  }
  const out: T[] = [];
  const emitted = new Set<string>();
  const seenChapter = new Set<number>();
  for (const o of ordered) {
    if (emitted.has(id(o))) continue;
    out.push(o); emitted.add(id(o));
    const ck = chapterKey(o);
    if (seenChapter.has(ck)) continue;
    seenChapter.add(ck);
    const leadAuthor = author(o);
    for (const f of byChapter.get(ck) ?? []) {
      if (emitted.has(id(f)) || author(f) === leadAuthor) continue;
      out.push(f); emitted.add(id(f));
    }
  }
  return out;
}

// DIVERSITY-AWARE top-K selection — caps at `cap` entries per PASSAGE (chapter), NOT per
// author (the prior per-author cap let 6 distinct-author voices from ONE chapter fill the
// top-6, collapsing cross-passage coverage → topical 65→50). Per-passage preserves coverage
// (≤2 per chapter) while letting a backfilled 2nd voice onto the target passage. ON-REFERENCE
// (floored) items are EXEMPT (ADR-015 guarantee). Deferred items backfill to fill k. Pure reorder.
export function selectDiverse<T>(
  ordered: readonly T[],
  k: number,
  chapterKey: (t: T) => number,
  onRef: (t: T) => boolean,
  cap: number = PASSAGE_CAP,
): T[] {
  const final: T[] = [];
  const count = new Map<number, number>();
  const deferred: T[] = [];
  for (const r of ordered) {
    if (final.length >= k) break;
    const ch = chapterKey(r);
    if (onRef(r) || (count.get(ch) ?? 0) < cap) { final.push(r); count.set(ch, (count.get(ch) ?? 0) + 1); }
    else deferred.push(r);
  }
  for (const r of deferred) { if (final.length >= k) break; final.push(r); }
  return final;
}
