import { getDb } from '../db';
import { rerank } from './rerank';
import { resolveIntent } from '../../bible/pericopes';
import type { VerseRange } from '../../bible/ref-parse';
import { RERANK_DOC_CHARS, injectionSql, mergeById, floorOnRange, selectDiverse, legalBasePool, LEGAL_CORPUS_FILTER, chapterKeysOf, diversityBackfillSql, insertBackfill, BACKFILL_TOP_CHAPTERS, songVerseOnRangeSql, songVersePoolSql, SONG_VERSE_LIMIT, laneOnRangeSql, lanePoolSql, LANE_LIMIT, SERMON_CORPUS_FILTER, THEOLOGY_CORPUS_FILTER } from './routing';

// A retrieved commentary chunk, fully hydrated (attribution + content on the row).
export interface RetrievedChunk {
  sourceId: string;
  score: number; // cosine similarity or combined/rerank score, 0..1
  content: string;
  metadata: {
    author: string;
    year: number | null;
    tradition: string | null;
    sourceTitle: string;
    sourceUrl: string | null;
    verseId: number;
    verseEnd: number;
    model: string;
  };
}

// Legal-corpus vector retrieval with cross-encoder reranking.
//
// 1. legalBasePoolSql (./routing) = the top-CANDIDATE_POOL pure-vector matches over
//    the LEGAL_CORPUS_FILTER (the license-verified author allowlist). BM25/hybrid was
//    dropped deliberately — measured no-loss (vector 97% ≈ hybrid 97%); the reranker
//    carries the lift. The filter is what makes prod serve ONLY license-verified
//    content (beta wall 2); it is the SINGLE source shared with the eval so the
//    measured number is exactly what production serves — they can never diverge again.
// 2. BGE-reranker cross-encoder rescores the candidates, picking the topically best
//    `limit`. The routing orchestration (inject, floor, diversity) lives in ./routing.

// The top on-range vector matches WITHIN the legal corpus, hydrated (SQL from ./routing).
async function fetchOnRange(
  sql: ReturnType<typeof getDb>,
  vecStr: string,
  ranges: readonly VerseRange[],
): Promise<RetrievedChunk[]> {
  const rows = (await sql.query(injectionSql(ranges, LEGAL_CORPUS_FILTER), [vecStr])) as Array<{
    source_id: string; score: number; content: string; metadata: unknown;
  }>;
  return rows.map((r) => ({
    sourceId: r.source_id,
    score: Number(r.score),
    content: r.content,
    metadata: (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) as RetrievedChunk['metadata'],
  }));
}

// The SONG/VERSE register (hymns + poetry): its own pool, its own labeled payload.
// Retrieve-and-quote — never fed to the composer, never counted toward the
// exegetical ≥2-voices floor (CONTENT_GO_LIVE.md decision 2). `register` and
// `paraphrase` ride in metadata; a PARAPHRASE-tagged item (metrical psalters,
// Watts' Psalms Imitated) is a paraphrase-voice, never rendered as Scripture.
export interface SongVerseChunk extends RetrievedChunk {
  metadata: RetrievedChunk['metadata'] & { work: string; register: 'hymn' | 'poetry'; paraphrase?: boolean };
}

export async function retrieveSongVerse(
  queryVec: number[],
  ranges: readonly VerseRange[],
  limit = SONG_VERSE_LIMIT,
): Promise<SongVerseChunk[]> {
  const sql = getDb();
  const vecStr = `[${queryVec.join(',')}]`;
  const hydrate = (rows: Array<{ source_id: string; score: number; content: string; metadata: unknown }>): SongVerseChunk[] =>
    rows.map((r) => ({
      sourceId: r.source_id,
      score: Number(r.score),
      content: r.content,
      metadata: (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) as SongVerseChunk['metadata'],
    }));
  try {
    const onRange = ranges.length > 0
      ? hydrate((await sql.query(songVerseOnRangeSql(ranges), [vecStr])) as Parameters<typeof hydrate>[0])
      : [];
    if (onRange.length >= limit) return onRange.slice(0, limit);
    const fill = hydrate((await sql.query(songVersePoolSql(limit), [vecStr])) as Parameters<typeof hydrate>[0]);
    const seen = new Set(onRange.map((c) => c.sourceId));
    return [...onRange, ...fill.filter((c) => !seen.has(c.sourceId))].slice(0, limit);
  } catch {
    return []; // the register is additive — its failure must never break the exegetical answer
  }
}

// ── the REUSABLE prose-register LANE (sermon-lane slice 2026-07-18) ──
// A prose register (sermon, theology) retrieved in its OWN pool + labeled payload.
// Retrieve-and-quote — never fed to the composer, never counted toward the
// exegetical ≥2-voices floor. Verse-anchored items first (a sermon ON this
// passage), semantic fill behind. This is the reusable sermon-search core; a
// caller passes its register key + corpusFilter (a routing constant, not user
// input). Fail-soft: the lane is additive and must never break the exegetical answer.
export interface RegisterLaneChunk extends RetrievedChunk {
  metadata: RetrievedChunk['metadata'] & { work: string; register?: string };
  lane: string; // 'sermon' | 'theology'
}

export async function retrieveRegisterLane(
  laneKey: string,
  corpusFilter: string,
  queryVec: number[],
  ranges: readonly VerseRange[],
  limit = LANE_LIMIT,
): Promise<RegisterLaneChunk[]> {
  const sql = getDb();
  const vecStr = `[${queryVec.join(',')}]`;
  const hydrate = (rows: Array<{ source_id: string; score: number; content: string; metadata: unknown }>): RegisterLaneChunk[] =>
    rows.map((r) => ({
      sourceId: r.source_id,
      score: Number(r.score),
      content: r.content,
      metadata: (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) as RegisterLaneChunk['metadata'],
      lane: laneKey,
    }));
  try {
    const onRange = ranges.length > 0
      ? hydrate((await sql.query(laneOnRangeSql(corpusFilter, ranges, limit), [vecStr])) as Parameters<typeof hydrate>[0])
      : [];
    if (onRange.length >= limit) return onRange.slice(0, limit);
    const fill = hydrate((await sql.query(lanePoolSql(corpusFilter, limit), [vecStr])) as Parameters<typeof hydrate>[0]);
    const seen = new Set(onRange.map((c) => c.sourceId));
    return [...onRange, ...fill.filter((c) => !seen.has(c.sourceId))].slice(0, limit);
  } catch {
    return []; // additive — its failure must never break the exegetical answer
  }
}

export const retrieveSermonLane = (queryVec: number[], ranges: readonly VerseRange[], limit = LANE_LIMIT) =>
  retrieveRegisterLane('sermon', SERMON_CORPUS_FILTER, queryVec, ranges, limit);
export const retrieveTheologyLane = (queryVec: number[], ranges: readonly VerseRange[], limit = LANE_LIMIT) =>
  retrieveRegisterLane('theology', THEOLOGY_CORPUS_FILTER, queryVec, ranges, limit);

export async function retrieveCommentary(
  queryVec: number[],
  limit = 6,
  opts?: { query?: string },
): Promise<RetrievedChunk[]> {
  const sql = getDb();
  const vecStr = `[${queryVec.join(',')}]`;
  const queryText = opts?.query ?? '';

  // Base pool: pure-vector over the legal corpus, via the partial legal HNSW index with
  // hnsw.ef_search owned inside legalBasePool (shared with the eval — routing.ts).
  const rows = await legalBasePool(sql, vecStr);
  let candidates: RetrievedChunk[] = rows.map((r) => ({
    sourceId: r.source_id,
    score: Number(r.score),
    content: r.content,
    metadata: (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) as RetrievedChunk['metadata'],
  }));

  // Reference/pericope routing. `intent.inject` = every named range (soft-boost
  // the pool, false-positive-safe); `intent.floor` = the high-confidence subset
  // (numeric refs + corroborated pericopes) that earns the reserved top slots.
  // Retrieval-only — the JSON contract + verifier are untouched, so the
  // concordance guarantee holds. Topical queries yield empty on both.
  const intent = queryText ? resolveIntent(queryText) : { inject: [], floor: [] };
  if (intent.inject.length > 0) {
    const injected = await fetchOnRange(sql, vecStr, intent.inject);
    candidates = mergeById(injected, candidates, (c) => c.sourceId);
  }

  if (candidates.length <= limit && intent.floor.length === 0) return candidates;

  // Rerank the full pool, then floor the top on-passage voices into the lead slots
  // (only for the high-confidence `floor` ranges) before taking `limit`.
  try {
    const docs = candidates.map((c) => c.content.slice(0, RERANK_DOC_CHARS));
    const ranked = await rerank(queryText || 'commentary', docs);
    let ordered = ranked.map((r) => ({ ...candidates[r.index]!, score: r.relevance_score }));
    if (intent.floor.length > 0) ordered = floorOnRange(ordered, intent.floor, (c) => c.metadata.verseId);
    // On-passage backfill (Phase A item 2): fetch the 2nd+ distinct voices on the
    // chapters retrieval already surfaced, so selectDiverse has a 2nd voice to keep.
    const chapterKey = (c: RetrievedChunk) => Math.floor(c.metadata.verseId / 1000);
    const chapters = chapterKeysOf(ordered.slice(0, BACKFILL_TOP_CHAPTERS), chapterKey);
    if (chapters.length > 0) {
      const bf = (await sql.query(diversityBackfillSql(chapters, LEGAL_CORPUS_FILTER), [vecStr])) as Array<{
        source_id: string; score: number; content: string; metadata: unknown;
      }>;
      const fetched: RetrievedChunk[] = bf.map((r) => ({
        sourceId: r.source_id, score: Number(r.score), content: r.content,
        metadata: (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) as RetrievedChunk['metadata'],
      }));
      ordered = insertBackfill(ordered, fetched, (c) => c.sourceId, chapterKey, (c) => c.metadata.author);
    }
    // Diversity-aware top-K: per-PASSAGE cap keeps ≥2 voices on a passage without
    // collapsing coverage; on-reference (floored) voices are exempt (HIT@1 preserved).
    const onRef = (c: RetrievedChunk) => intent.floor.some((r) => c.metadata.verseId >= r.start && c.metadata.verseId <= r.end);
    return selectDiverse(ordered, limit, chapterKey, onRef);
  } catch {
    // Reranker failure: fall back to the legal-corpus vector ordering
    return candidates.slice(0, limit);
  }
}
