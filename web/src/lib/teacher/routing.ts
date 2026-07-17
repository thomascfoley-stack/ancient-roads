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
export const SERVED_PROSE_WORKS = [
  'keil-delitzsch', 'catena-aurea', 'isbe', 'eastons-dictionary', 'smiths-dictionary',
  'naves-topical', 'bdb-lexicon', 'spurgeon-sermons', 'spurgeon-treasury',
  'maclaren-expositions', 'chrysostom-homilies', 'augustine-homilies', 'owen-works',
  'watson-works', 'flavel-works', 'edwards-works', 'wesley-sermons', 'ryle-expository',
  'vincent-word-studies', 'hodge-systematic', 'calvin-institutes', 'schaff-creeds',
  'whitefield-works',
] as const;
export const SERVED_SONG_VERSE_WORKS = [
  'olney-hymns', 'scottish-psalter-1650', 'neale-eastern-hymns', 'bramley-carols',
  'watts-hymns', 'watts-psalms', 'herbert-temple', 'montgomery-sacred-poems',
  'keble-christian-year', 'donne-divine-poems', 'herrick-noble-numbers',
  'traherne-poems', 'milton-poetical-works', 'rossetti-verses', 'hopkins-poems',
  'tennyson-in-memoriam', 'dante-divine-comedy', 'wheatley-poems',
] as const;

const sqlStrList = (xs: readonly string[]) => xs.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');
export const PROSE_TYPE_SQL = `source_type IN (${sqlStrList(SERVED_PROSE_TYPES)})`;
export const SONG_VERSE_TYPE_SQL = `source_type IN (${sqlStrList(SERVED_SONG_VERSE_TYPES)})`;

export const LEGAL_CORPUS_FILTER = `(metadata->>'author' IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry')
   OR (metadata->>'author'='John Chrysostom'    AND (metadata->>'verseId')::int/1000000 IN (40,43,44))
   OR (metadata->>'author'='Augustine of Hippo' AND (metadata->>'verseId')::int/1000000 IN (19,43))
   OR (metadata->>'author' IN ('Albert Barnes','John Wesley','John Calvin') AND metadata->>'sourceUrl' ILIKE '%crosswire%')
   OR metadata->>'work' IN (${sqlStrList(SERVED_PROSE_WORKS)}))`;

// The song/verse register's own served filter (its partial index twin lives in
// migration 018; legal-hnsw-index-sync-style lockstep applies).
export const SONG_VERSE_CORPUS_FILTER = `(metadata->>'work' IN (${sqlStrList(SERVED_SONG_VERSE_WORKS)}))`;

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
function legalBasePoolSql(pool: number): string {
  return `SELECT source_id, 1 - (embedding <=> $1::vector) AS score, content, metadata
     FROM embeddings
     WHERE user_id IS NULL AND ${PROSE_TYPE_SQL} AND ${LEGAL_CORPUS_FILTER}
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
): Promise<BasePoolRow[]> {
  const results = await sql.transaction([
    sql`SELECT set_config('hnsw.ef_search', ${String(ef)}, true)`,
    sql.query(legalBasePoolSql(pool), [vec]),
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
  return `WITH inrange AS MATERIALIZED (
     SELECT source_id, content, metadata, embedding FROM embeddings
     WHERE user_id IS NULL AND ${PROSE_TYPE_SQL}${corpusFilter ? ` AND ${corpusFilter}` : ''} AND (${conds})
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
  // DISTINCT ON already bounds output to ≤ chapters×authors; the LIMIT is a hard
  // ceiling (defence against an unbounded set if the chapter cap ever grows).
  return `SELECT DISTINCT ON ((metadata->>'verseId')::int/1000, metadata->>'author')
     source_id, 1 - (embedding <=> $1::vector) AS score, content, metadata
   FROM embeddings
   WHERE user_id IS NULL AND ${PROSE_TYPE_SQL}${corpusFilter ? ` AND ${corpusFilter}` : ''} AND (${conds})
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
