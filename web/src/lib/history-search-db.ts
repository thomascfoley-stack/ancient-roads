// History-lane retrieval — the DB half. HISTORY_RETRIEVAL_DESIGN §3-§4. Server-only.
// Deterministic pipeline, no LLM: the only model call is embedding the query (bge-large via the
// SAME embedQuery the ask path uses — never a second embedder).
import { getDb } from './db';
import { embedQuery } from './teacher/deepinfra';
import {
  type Period, assertExcerptVerbatim, makeExcerpt, matchEntities, parsePeriod, periodsOverlap, scoreSection, HISTORY_TEXT_COSINE_FLOOR,
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
interface WorkRef { slug: string; title: string; author: string; edition: string | null }

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
  // `ordinal` is `sections.ordinal`, NOT `unit_ordinal`. The deep link this row becomes is
  // `/work/{slug}#s{ordinal}`, and the reader resolves that hash by keyset over
  // UNIQUE(source_id, ordinal) — the raw section number — exactly as catalog-search.tsx does for
  // the identical URL. Carrying `unit_ordinal` here (the 024 collapsed-unit numbering) sent every
  // "Open in book" to the wrong passage, or — since 11 of the 28 served history works have
  // unit_ordinal NULL in every row — to `#snull`, which the reader's `^#s(\d+)$` cannot match, so
  // it silently opened the work at the top. Confirmed against the dev corpus 2026-08-21. This is
  // the concordance's one job: open the book THERE.
  id: number; source_id: number; ordinal: number; heading: string; body: string;
  period_start_year: number | null; period_end_year: number | null;
  slug: string; title: string; author: string; edition: string | null;
  cosine?: number; fts?: number; entity?: boolean;
}
// Exported so the SQL half of the deep-link contract is testable without a DB. The CRITICAL
// (domain finding 1) lived in TWO places — this SELECT list AND the mapper — and a mapper-only
// test can't fail for a regression here: if this reverts to `s.unit_ordinal`, `row.ordinal` is
// undefined at runtime and a mapper unit test that builds the row by hand never sees it. The
// invariant test asserts this string selects `s.ordinal` and not `s.unit_ordinal`.
// `edition` is the source record's own provenance (`sources.provenance->>'edition'`, the
// ADR-008/010 registry) — carried so a copied citation names THIS work's edition instead of a
// hardcoded provenance literal (W-SEC-CCEL). Same two-place rule: asserted from this string.
export const ROW_COLS = `s.id, s.source_id, s.ordinal, s.heading, s.body,
  s.period_start_year, s.period_end_year, src.slug, src.title, src.author,
  src.provenance ->> 'edition' AS edition`;

/** Row → result mapper, exported so the ordinal contract (the deep link the reader can resolve)
 *  is unit-testable without a DB — see history-row-to-result.test.ts. `needle` windows the
 *  excerpt around the matched entity; it is still a pure index slice, so the verbatim gate holds. */
export function rowToResult(
  row: Row, matched: HistoryResult['matched'], needle: string | undefined,
): HistoryResult {
  const excerpt = makeExcerpt(row.body, 420, matched.includes('entity') ? needle : undefined);
  assertExcerptVerbatim(row.body, excerpt); // v1's verifier: a mutated excerpt never renders
  return {
    sectionId: row.id, ordinal: row.ordinal,
    // Strip the ingest chunk marker (` (2/3)`, ingest-historian.ts) so it never reaches the
    // reader's breadcrumb or a copied citation as "Chapter 4 (2/3)" — a retrieval artifact, not
    // part of the source's own heading (deep-audit domain finding 6).
    headingPath: (row.heading ?? '').replace(/\s*\(\d+\/\d+\)\s*$/, '').split(' — '),
    period: row.period_start_year !== null
      ? [row.period_start_year, row.period_end_year ?? row.period_start_year] : null,
    excerpt, matched,
  };
}

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
  // ef_search rides the SAME transaction as the KNN — on the stateless HTTP driver a set_config
  // in its own call binds nothing (routing.ts:311-315). At the default 40 this lane STARVED
  // through the partial index (measured 2026-08-21: three of four real probes returned empty
  // top-3), which is what left FTS-found rows with no cosine for the floor below.
  const [, vecRows] = await sql.transaction([
    sql`SELECT set_config('hnsw.ef_search', '120', true)`,
    sql.query(
      `SELECT ${ROW_COLS}, 1 - (he.embedding <=> $1::vector) AS cosine
         FROM history_embeddings he
         JOIN sections s ON s.id = he.section_id
         JOIN sources src ON src.id = s.source_id
        WHERE ${SCOPE} ORDER BY he.embedding <=> $1::vector LIMIT 50`,
      [JSON.stringify(vec)],
    ),
  ]);
  fold(vecRows as Row[], () => { /* cosine carried on the row */ });
  fold((await sql.query(
    `SELECT ${ROW_COLS}, ts_rank(s.tsv, plainto_tsquery('english', $1)) AS fts
       FROM sections s
       JOIN history_embeddings he ON he.section_id = s.id
       JOIN sources src ON src.id = s.source_id
      WHERE s.tsv @@ plainto_tsquery('english', $1) AND ${SCOPE}
      ORDER BY fts DESC LIMIT 50`,
    [query],
  )) as Row[], () => { /* fts carried on the row */ });

  // The floor must judge EVERY text candidate on semantics, including FTS-found rows outside
  // the KNN top-50 — "the church at Ephesus" earns its hero on cosine even when 'Ephesus' is
  // outside the entity vocabulary, while "kitchen tap" word-hits die. One batch lookup.
  const unscored = [...byId.values()].filter((r) => r.cosine == null).map((r) => r.id);
  if (unscored.length > 0) {
    const cosRows = (await sql.query(
      `SELECT he.section_id, 1 - (he.embedding <=> $1::vector) AS cosine
         FROM history_embeddings he WHERE he.section_id = ANY($2::bigint[])`,
      [JSON.stringify(vec), unscored],
    )) as { section_id: string; cosine: number }[];
    for (const c of cosRows) {
      const row = byId.get(Number(c.section_id));
      if (row) row.cosine = Number(c.cosine);
    }
  }

  const maxFts = Math.max(...[...byId.values()].map((r) => r.fts ?? 0), 0) || 1;
  const scored = [...byId.values()].map((r) => {
    const overlap = period
      ? periodsOverlap(period, { start: r.period_start_year, end: r.period_end_year })
      : false;
    const matched: HistoryResult['matched'] = [];
    if (r.entity) matched.push('entity');
    if (overlap) matched.push('period');
    // The floor: text-only evidence needs a real semantic match, never bare word-hits
    // (HISTORY_TEXT_COSINE_FLOOR — calibrated, see history-search.ts).
    if ((r.cosine ?? 0) >= HISTORY_TEXT_COSINE_FLOOR) matched.push('text');
    return {
      row: r, matched,
      score: scoreSection({
        entityHit: Boolean(r.entity), periodOverlap: overlap,
        cosine: r.cosine ?? 0, fts: (r.fts ?? 0) / maxFts,
      }),
    };
  }).filter((x) => x.matched.length > 0).sort((a, b) => b.score - a.score).slice(0, 200);

  const needle = entities[0]?.label;
  const toResult = (x: (typeof scored)[number]): HistoryResult => rowToResult(x.row, x.matched, needle);

  const groups = new Map<string, { work: WorkRef; sections: (typeof scored)[number][] }>();
  for (const x of scored) {
    const g = groups.get(x.row.slug) ?? {
      work: { slug: x.row.slug, title: x.row.title, author: x.row.author, edition: x.row.edition }, sections: [],
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
