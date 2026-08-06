// The three searches over a user's own corpus (§3, and the order's "What the three searches
// actually are" amendment).
//
// TWO FUNCTIONS, THREE SURFACES. The order is explicit: "search this document" and "search all my
// works" are `semanticSearch` with and without a documentId filter — one function, an optional
// scope, not two code paths that drift.
//
// EVERY QUERY IS USER-SCOPED THROUGH runAsUser, so RLS binds and the explicit `user_id` predicate
// is a second, independent filter rather than the only one. A pastor's search never reaches another
// user's uploads, and never reaches the corpus at all — that is the tradition-gap join's job, and
// it is a different function with a different fence.

import { runAsUser } from '@/lib/db';
import { EMBEDDING_DB_SLUG, EMBEDDING_DIMS } from './model';

/** Bounds copied from `web/src/lib/search-sections.ts`, where each is a scar. */
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
/**
 * `?offset=1e21` serialises to `1e+21` and Postgres rejects it (22P02); a bigger one overflows
 * (22003). A 2026-08-02 fix validated integer-NESS and never bounded MAGNITUDE, so it 500'd again.
 */
export const MAX_OFFSET = 100_000;

export interface UserHit {
  documentId: string;
  sectionId: string;
  title: string;
  heading: string | null;
  ordinal: number;
  text: string;
  score: number;
  createdAt: string;
}

export interface SearchScope {
  /** Restrict to one document. Absent = across all of the user's works. */
  documentId?: string;
  limit?: number;
  offset?: number;
}

const clampLimit = (n: number | undefined) =>
  Math.min(MAX_LIMIT, Math.max(1, Math.trunc(Number.isFinite(n) ? (n as number) : DEFAULT_LIMIT)));
const clampOffset = (n: number | undefined) =>
  Math.min(MAX_OFFSET, Math.max(0, Math.trunc(Number.isFinite(n) ? (n as number) : 0)));

function toVectorLiteral(v: number[]): string {
  if (v.length !== EMBEDDING_DIMS) throw new Error(`query vector has ${v.length} dims, expected ${EMBEDDING_DIMS}`);
  return `[${v.join(',')}]`;
}

interface Row {
  document_id: string;
  section_id: string;
  title: string;
  heading: string | null;
  ordinal: number;
  body: string;
  score: number;
  created_at: string;
}

const toHit = (r: Row): UserHit => ({
  documentId: r.document_id,
  sectionId: r.section_id,
  title: r.title,
  heading: r.heading,
  ordinal: r.ordinal,
  text: r.body,
  score: Number(r.score),
  createdAt: r.created_at,
});

/**
 * "What have I said about X" — brute-force cosine over ONE user's vectors.
 *
 * NO INDEX, BY DESIGN (§5, migration 100). A shared HNSW starves exactly the way the corpus index
 * did: ef_search collects N neighbours and the user_id filter guts them. One user's chunks are a
 * low-thousands scan, which is fast and 100% recall. The escape hatch is a per-user partition above
 * ~20-30k chunks, fired by a tripwire, and it is a separate migration — not a thing to pre-build.
 *
 * The `model_slug` filter is parity at query time (§6): if a user's rows were ever embedded by a
 * different model, mixing them into one cosine ranking compares vectors from two spaces and returns
 * plausible garbage. This is NOT the tautology ADR-102 warns about — that one is about comparing
 * against the CORPUS. Here we are filtering our own plane down to the space the query lives in.
 */
export async function semanticSearch(
  userId: string,
  queryVector: number[],
  scope: SearchScope = {},
): Promise<UserHit[]> {
  const vec = toVectorLiteral(queryVector);
  const limit = clampLimit(scope.limit);
  const offset = clampOffset(scope.offset);
  const doc = scope.documentId ?? null;

  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT s.document_id, s.id AS section_id, d.title, s.heading, s.ordinal, s.body,
               1 - (e.embedding <=> ${vec}::vector) AS score, d.created_at
          FROM user_section_embeddings e
          JOIN user_sections  s ON s.id = e.section_id
          JOIN user_documents d ON d.id = s.document_id
         WHERE e.user_id = ${userId}
           AND e.model_slug = ${EMBEDDING_DB_SLUG}
           AND (${doc}::text IS NULL OR s.document_id = ${doc}::text)
         ORDER BY e.embedding <=> ${vec}::vector
         LIMIT ${limit} OFFSET ${offset}`,
  ]);
  return (rows as Row[]).map(toHit);
}

/**
 * "Find that exact line I wrote" — Postgres FTS over the generated `tsv`.
 *
 * `websearch_to_tsquery` rather than `plainto_tsquery`: it understands quoted phrases and `-term`,
 * which is what someone reaching for exact-line search actually types, and it never throws on
 * malformed input the way `to_tsquery` does.
 */
export async function keywordSearch(userId: string, query: string, scope: SearchScope = {}): Promise<UserHit[]> {
  const q = query.trim();
  if (!q) return [];
  const limit = clampLimit(scope.limit);
  const offset = clampOffset(scope.offset);
  const doc = scope.documentId ?? null;

  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT s.document_id, s.id AS section_id, d.title, s.heading, s.ordinal, s.body,
               ts_rank(s.tsv, websearch_to_tsquery('english', ${q})) AS score, d.created_at
          FROM user_sections  s
          JOIN user_documents d ON d.id = s.document_id
         WHERE s.user_id = ${userId}
           AND s.tsv @@ websearch_to_tsquery('english', ${q})
           AND (${doc}::text IS NULL OR s.document_id = ${doc}::text)
         ORDER BY score DESC, s.document_id, s.ordinal
         LIMIT ${limit} OFFSET ${offset}`,
  ]);
  return (rows as Row[]).map(toHit);
}

export interface VerseRange {
  start: number;
  end: number;
}

export interface VersePresence {
  documentId: string;
  title: string;
  sectionId: string;
  ordinal: number;
  verseStart: number;
  verseEnd: number;
  channel: string;
  matchCount: number | null;
  confidence: number;
}

/**
 * "Have I written on Romans 8?" — the presence fast path.
 *
 * AN INDEX LOOKUP, NEVER A VECTOR SCAN (§3). It answers a different question from the other two:
 * presence, not ranking. Range OVERLAP, not containment — a chunk anchored to 8:28-30 must answer a
 * query for 8:1-39, and one anchored to the whole chapter must answer a query for a single verse.
 *
 * Anchors are returned rather than collapsed to documents, because `channel` and `match_count` are
 * how the caller tells "I quoted this at length" from "I mentioned it once" — and the surface
 * default filters on exactly that.
 */
export async function verseAnchorScan(
  userId: string,
  range: VerseRange,
  scope: SearchScope & { minMatchCount?: number } = {},
): Promise<VersePresence[]> {
  const limit = clampLimit(scope.limit);
  const doc = scope.documentId ?? null;
  // NULL means "no floor": an explicit citation carries match_count NULL by design (migration 103),
  // and a floor must not silently exclude every citation.
  const minCount = scope.minMatchCount ?? null;

  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT a.section_id, a.verse_id_start, a.verse_id_end, a.channel, a.match_count, a.confidence,
               s.document_id, s.ordinal, d.title
          FROM user_section_anchors a
          JOIN user_sections  s ON s.id = a.section_id
          JOIN user_documents d ON d.id = s.document_id
         WHERE a.user_id = ${userId}
           AND a.verse_id_start <= ${range.end}
           AND a.verse_id_end   >= ${range.start}
           AND (${doc}::text IS NULL OR s.document_id = ${doc}::text)
           AND (${minCount}::int IS NULL OR a.match_count IS NULL OR a.match_count >= ${minCount}::int)
         ORDER BY a.verse_id_start, s.document_id, s.ordinal
         LIMIT ${limit}`,
  ]);
  return (rows as {
    section_id: string; verse_id_start: number; verse_id_end: number; channel: string;
    match_count: number | null; confidence: number; document_id: string; ordinal: number; title: string;
  }[]).map((r) => ({
    documentId: r.document_id,
    title: r.title,
    sectionId: r.section_id,
    ordinal: r.ordinal,
    verseStart: r.verse_id_start,
    verseEnd: r.verse_id_end,
    channel: r.channel,
    matchCount: r.match_count,
    confidence: Number(r.confidence),
  }));
}

/** RRF constant. 60 is the value from the original Cormack et al. paper and the corpus path's. */
const RRF_K = 60;

/**
 * Fuse semantic and keyword results by reciprocal rank (§3: "semantic + FTS are fused ... as the
 * corpus path does").
 *
 * RRF rather than score blending because the two scores are not commensurable: cosine similarity
 * and `ts_rank` live on different scales with different distributions, and normalising them would
 * invent a relationship neither has. Rank is the only thing they share.
 */
export function fuseByRRF(lists: UserHit[][], limit = DEFAULT_LIMIT): UserHit[] {
  const scores = new Map<string, number>();
  const best = new Map<string, UserHit>();
  for (const list of lists) {
    list.forEach((hit, i) => {
      scores.set(hit.sectionId, (scores.get(hit.sectionId) ?? 0) + 1 / (RRF_K + i + 1));
      if (!best.has(hit.sectionId)) best.set(hit.sectionId, hit);
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, clampLimit(limit))
    .map(([id, score]) => ({ ...best.get(id)!, score }));
}

/** "What have I said about X", the fused surface the UI calls. */
export async function searchMyWorks(
  userId: string,
  queryVector: number[],
  queryText: string,
  scope: SearchScope = {},
): Promise<UserHit[]> {
  const [semantic, keyword] = await Promise.all([
    semanticSearch(userId, queryVector, { ...scope, limit: MAX_LIMIT }),
    keywordSearch(userId, queryText, { ...scope, limit: MAX_LIMIT }),
  ]);
  return fuseByRRF([semantic, keyword], scope.limit ?? DEFAULT_LIMIT);
}
