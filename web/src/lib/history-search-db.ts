// History-lane retrieval — the DB half. HISTORY_RETRIEVAL_DESIGN §3-§4. Server-only.
// Deterministic pipeline, no LLM: the only model call is embedding the query (bge-large via the
// SAME embedQuery the ask path uses — never a second embedder).
import { getDb } from './db';
import { embedQuery } from './teacher/deepinfra';
import {
  type Period, assertExcerptVerbatim, makeExcerpt, matchEntities, parsePeriod, scoreSection,
} from './history-search';

export interface HistoryResult {
  sectionId: number;
  ordinal: number;
  headingPath: string[];
  period: [number, number] | null;
  excerpt: string;
  matched: ('entity' | 'period' | 'text')[];
}
export interface HistoryResponse {
  interpretation: { entities: { slug: string; label: string }[]; period: Period | null };
  closest: (HistoryResult & { work: WorkRef }) | null;
  results: { work: WorkRef; periodSpan: [number, number] | null; sections: HistoryResult[] }[];
  coverage: { works: number; sections: number };
}
interface WorkRef { slug: string; title: string; author: string }

// Entity vocabulary + coverage are DERIVED (never typed) and cached 60s — the invalidation point
// is a serve flip, and 60s bounds the staleness window (§5 amendment: the 9-vs-10 class).
let vocabCache: { at: number; vocab: { slug: string; label: string }[] } | null = null;
let coverageCache: { at: number; works: number; sections: number } | null = null;
const TTL_MS = 60_000;

/** Scope predicate, applied at READ time even though writes enforce it too: a quarantined work
 *  must stop serving instantly even if its vectors still carry served=true. Fail closed. */
const SCOPE = `he.served AND src.status = 'published' AND src.source_type = 'historian'`;

async function vocab(): Promise<{ slug: string; label: string }[]> {
  if (vocabCache && Date.now() - vocabCache.at < TTL_MS) return vocabCache.vocab;
  const sql = getDb();
  const rows = (await sql.query(
    `SELECT DISTINCT a.entity_slug AS slug, a.entity_label AS label
       FROM section_history_anchors a
       JOIN sections s ON s.id = a.section_id
       JOIN history_embeddings he ON he.section_id = s.id
       JOIN sources src ON src.id = s.source_id
      WHERE ${SCOPE}
      LIMIT 5000`,
  )) as { slug: string; label: string }[];
  vocabCache = { at: Date.now(), vocab: rows };
  return rows;
}

interface Row {
  id: number; source_id: number; unit_ordinal: number; heading: string; body: string;
  period_start_year: number | null; period_end_year: number | null;
  slug: string; title: string; author: string;
  cosine?: number; fts?: number; entity?: boolean;
}
const ROW_COLS = `s.id, s.source_id, s.unit_ordinal, s.heading, s.body,
  s.period_start_year, s.period_end_year, src.slug, src.title, src.author`;

export async function searchHistory(query: string): Promise<HistoryResponse> {
  const sql = getDb();
  const entities = matchEntities(query, await vocab());
  const period = parsePeriod(query);
  const byId = new Map<number, Row>();
  const fold = (rows: Row[], mark: (r: Row) => void): void => {
    for (const r of rows) {
      const cur = byId.get(r.id) ?? r;
      mark(cur);
      byId.set(r.id, cur);
    }
  };

  if (entities.length) {
    fold((await sql.query(
      `SELECT DISTINCT ${ROW_COLS} FROM section_history_anchors a
         JOIN sections s ON s.id = a.section_id
         JOIN history_embeddings he ON he.section_id = s.id
         JOIN sources src ON src.id = s.source_id
        WHERE a.entity_slug = ANY($1) AND ${SCOPE} LIMIT 100`,
      [entities.map((e) => e.slug)],
    )) as Row[], (r) => { r.entity = true; });
  }
  if (period) {
    fold((await sql.query(
      `SELECT ${ROW_COLS} FROM sections s
         JOIN history_embeddings he ON he.section_id = s.id
         JOIN sources src ON src.id = s.source_id
        WHERE s.period_start_year IS NOT NULL AND s.period_start_year <= $2
          AND coalesce(s.period_end_year, s.period_start_year) >= $1 AND ${SCOPE} LIMIT 100`,
      [period.start, period.end],
    )) as Row[], () => { /* period overlap recomputed below from row columns */ });
  }
  const vec = await embedQuery(query);
  fold((await sql.query(
    `SELECT ${ROW_COLS}, 1 - (he.embedding <=> $1::vector) AS cosine
       FROM history_embeddings he
       JOIN sections s ON s.id = he.section_id
       JOIN sources src ON src.id = s.source_id
      WHERE ${SCOPE} ORDER BY he.embedding <=> $1::vector LIMIT 50`,
    [JSON.stringify(vec)],
  )) as Row[], () => { /* cosine carried on the row */ });
  fold((await sql.query(
    `SELECT ${ROW_COLS}, ts_rank(s.tsv, plainto_tsquery('english', $1)) AS fts
       FROM sections s
       JOIN history_embeddings he ON he.section_id = s.id
       JOIN sources src ON src.id = s.source_id
      WHERE s.tsv @@ plainto_tsquery('english', $1) AND ${SCOPE}
      ORDER BY fts DESC LIMIT 50`,
    [query],
  )) as Row[], () => { /* fts carried on the row */ });

  const maxFts = Math.max(...[...byId.values()].map((r) => r.fts ?? 0), 0) || 1;
  const scored = [...byId.values()].map((r) => {
    const overlap = period ? (r.period_start_year !== null || r.period_end_year !== null)
      && ((): boolean => {
        const bs = r.period_start_year ?? Number.NEGATIVE_INFINITY;
        const be = r.period_end_year ?? Number.POSITIVE_INFINITY;
        return period.start <= be && bs <= period.end;
      })() : false;
    const matched: HistoryResult['matched'] = [];
    if (r.entity) matched.push('entity');
    if (overlap) matched.push('period');
    if ((r.fts ?? 0) > 0 || (r.cosine ?? 0) > 0) matched.push('text');
    return {
      row: r, matched,
      score: scoreSection({
        entityHit: Boolean(r.entity), periodOverlap: overlap,
        cosine: r.cosine ?? 0, fts: (r.fts ?? 0) / maxFts,
      }),
    };
  }).sort((a, b) => b.score - a.score).slice(0, 200);

  const toResult = (x: (typeof scored)[number]): HistoryResult => {
    const excerpt = makeExcerpt(x.row.body);
    assertExcerptVerbatim(x.row.body, excerpt); // v1's verifier: a mutated excerpt never renders
    return {
      sectionId: x.row.id, ordinal: x.row.unit_ordinal,
      headingPath: (x.row.heading ?? '').split(' — '),
      period: x.row.period_start_year !== null
        ? [x.row.period_start_year, x.row.period_end_year ?? x.row.period_start_year] : null,
      excerpt, matched: x.matched,
    };
  };

  const groups = new Map<string, { work: WorkRef; sections: (typeof scored)[number][] }>();
  for (const x of scored) {
    const g = groups.get(x.row.slug) ?? {
      work: { slug: x.row.slug, title: x.row.title, author: x.row.author }, sections: [],
    };
    g.sections.push(x);
    groups.set(x.row.slug, g);
  }

  if (!coverageCache || Date.now() - coverageCache.at >= TTL_MS) {
    const cov = (await sql.query(
      `SELECT count(DISTINCT src.id)::int AS works, count(*)::int AS sections
         FROM history_embeddings he
         JOIN sections s ON s.id = he.section_id
         JOIN sources src ON src.id = s.source_id
        WHERE ${SCOPE}`,
    )) as { works: number; sections: number }[];
    coverageCache = { at: Date.now(), works: cov[0]?.works ?? 0, sections: cov[0]?.sections ?? 0 };
  }

  return {
    interpretation: { entities, period },
    closest: scored[0] ? { ...toResult(scored[0]), work: groups.get(scored[0].row.slug)!.work } : null,
    results: [...groups.values()].map((g) => ({
      work: g.work,
      periodSpan: ((): [number, number] | null => {
        const ys = g.sections.flatMap((x) => x.row.period_start_year !== null
          ? [x.row.period_start_year, x.row.period_end_year ?? x.row.period_start_year] : []);
        return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
      })(),
      sections: g.sections.map(toResult),
    })),
    coverage: { works: coverageCache.works, sections: coverageCache.sections },
  };
}
