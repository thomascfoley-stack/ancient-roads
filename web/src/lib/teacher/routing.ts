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

export const CANDIDATE_POOL = 20; // base hybrid/vector pool size fed to the reranker
const INJECT_CAP = 8; // max on-range candidates injected into the pool (baked into injectionSql)
export const RERANK_MODEL = 'Qwen/Qwen3-Reranker-0.6B';
export const RERANK_DOC_CHARS = 1200; // per-doc truncation fed to the reranker

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
     WHERE user_id IS NULL AND source_type = 'commentary'${corpusFilter ? ` AND ${corpusFilter}` : ''} AND (${conds})
   )
   SELECT source_id, 1 - (embedding <=> $1::vector) AS score, content, metadata
   FROM inrange ORDER BY embedding <=> $1::vector LIMIT ${INJECT_CAP}`;
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

export const AUTHOR_CAP = 2; // max entries per author in the final top-K (off-reference)

// DIVERSITY-AWARE top-K selection. Measured (WORKLOG 2026-07-10): after the corpus
// grew, the reranker fills the top-6 with multiple same-author, near-passage entries
// that crowd out the second distinct author on diffuse topical queries — and a bigger
// pool doesn't help. This caps off-reference entries at `cap` per author so a second
// distinct voice survives; ON-REFERENCE items (the ADR-015 routing guarantee) are
// EXEMPT and always kept (floor-first, then cap the rest). Deferred items backfill if
// the cap would otherwise leave fewer than k. Pure reordering — no extra API/DB call.
export function selectDiverse<T>(
  ordered: readonly T[],
  k: number,
  author: (t: T) => string,
  onRef: (t: T) => boolean,
  cap: number = AUTHOR_CAP,
): T[] {
  const final: T[] = [];
  const count = new Map<string, number>();
  const deferred: T[] = [];
  for (const r of ordered) {
    if (final.length >= k) break;
    const a = author(r);
    if (onRef(r) || (count.get(a) ?? 0) < cap) { final.push(r); count.set(a, (count.get(a) ?? 0) + 1); }
    else deferred.push(r);
  }
  for (const r of deferred) { if (final.length >= k) break; final.push(r); }
  return final;
}
