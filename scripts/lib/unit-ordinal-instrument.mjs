// Work Order v2 Stage 2.1 — unit_ordinal instrument (shared core).
// One tool, three surfaces: db-invariants test, cutover gate leg, read-only CLI.
//
// PROPERTY: for every published work — zero NULL unit_ordinal; unit count matches
// recomputed reading units; (unit_ordinal, ordinal) is a strict total order with no
// duplicates within a unit; stored values match the 024 backfill recomputation.
// Digest leg: md5 over (slug, section_id, unit_ordinal, ordinal) per work catches
// permutations that count/uniqueness checks miss (ADR-033 lesson).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const MIGRATION_024 = path.join(ROOT, 'db/migrations/024_sections_unit_ordinal.sql');

/** Extract the committed 024 backfill UPDATE — never re-implement the logic elsewhere. */
export function backfillSqlFromMigration(migrationPath = MIGRATION_024) {
  const parts = readFileSync(migrationPath, 'utf8').split(/^--SPLIT--$/m);
  const hit = parts.find((p) => /UPDATE\s+sections/i.test(p));
  if (!hit) throw new Error('024 migration has no UPDATE sections part — backfill missing?');
  return hit.trim();
}

/** In-memory perturbations for standing regression tests (Stage 2.1 CHECK). */
export function perturbBackfillSql(sql, perturbation) {
  if (perturbation === 'units-merge-islands') {
    const replaced = sql.replace(
      /CASE WHEN grp LIKE 'r\|%' THEN grp \|\| '\|' \|\| island ELSE grp END/g,
      "grp || '|' || island",
    );
    if (replaced === sql) throw new Error('perturbation units-merge-islands: pattern not found in backfill SQL');
    return replaced;
  }
  if (perturbation === 'unit-sort-storage-ordinal') {
    const replaced = sql.replace(
      /min\(CASE WHEN grp LIKE 'c\|%' THEN \(vstart \/ 1000\)::bigint \* 1000000 \+ ordinal\s+ELSE ordinal::bigint END\)/g,
      'min(ordinal::bigint)',
    );
    if (replaced === sql) throw new Error('perturbation unit-sort-storage-ordinal: pattern not found in backfill SQL');
    return replaced;
  }
  throw new Error(`unknown perturbation: ${perturbation}`);
}

/** Turn the backfill UPDATE into a SELECT of computed unit_ordinal per section. */
export function backfillSelectSql(backfillUpdateSql, { scope = 'null-only' } = {}) {
  const needCte =
    scope === 'published'
      ? `need AS (
  SELECT DISTINCT sec.source_id
  FROM sections sec
  JOIN sources src ON src.id = sec.source_id
  WHERE src.status = 'published'
),`
      : null;

  let body = backfillUpdateSql;
  if (needCte) {
    body = body.replace(
      /WITH need AS \(\s*SELECT DISTINCT source_id FROM sections WHERE unit_ordinal IS NULL\s*\),/,
      `WITH ${needCte}`,
    );
  }

  const selectTail = `SELECT u.id AS section_id, u.source_id, n.unit_ordinal AS computed_unit_ordinal
FROM units u
JOIN numbered n ON n.source_id = u.source_id AND n.unit_key = u.unit_key`;

  return body.replace(/UPDATE sections s[\s\S]+$/, selectTail);
}

export const PUBLISHED_NULLS_SQL = `
  SELECT count(*) FILTER (WHERE sec.unit_ordinal IS NULL)::int AS nulls,
         count(*)::int AS total
  FROM sections sec
  JOIN sources src ON src.id = sec.source_id
  WHERE src.status = 'published'`;

export const PUBLISHED_DUP_PAIRS_SQL = `
  SELECT src.slug, sec.unit_ordinal, sec.ordinal, count(*)::int AS n
  FROM sections sec
  JOIN sources src ON src.id = sec.source_id
  WHERE src.status = 'published'
  GROUP BY src.slug, sec.unit_ordinal, sec.ordinal
  HAVING count(*) > 1
  ORDER BY src.slug, sec.unit_ordinal, sec.ordinal
  LIMIT 20`;

export const PUBLISHED_ORDER_BREAKS_SQL = `
  WITH ordered AS (
    SELECT src.slug, sec.unit_ordinal, sec.ordinal,
           lag(sec.unit_ordinal) OVER (PARTITION BY src.slug ORDER BY sec.unit_ordinal, sec.ordinal) AS prev_uo,
           lag(sec.ordinal) OVER (PARTITION BY src.slug ORDER BY sec.unit_ordinal, sec.ordinal) AS prev_ord
    FROM sections sec
    JOIN sources src ON src.id = sec.source_id
    WHERE src.status = 'published'
  )
  SELECT slug, prev_uo, prev_ord, unit_ordinal, ordinal
  FROM ordered
  WHERE prev_uo IS NOT NULL
    AND NOT (unit_ordinal > prev_uo OR (unit_ordinal = prev_uo AND ordinal > prev_ord))
  LIMIT 20`;

export const PUBLISHED_DIGEST_SQL = `
  SELECT src.slug,
         md5(string_agg(
           src.slug || '|' || sec.id::text || '|' || sec.unit_ordinal::text || '|' || sec.ordinal::text,
           E'\\n' ORDER BY sec.unit_ordinal, sec.ordinal, sec.id
         )) AS digest,
         count(*)::int AS sections,
         count(DISTINCT sec.unit_ordinal)::int AS units
  FROM sections sec
  JOIN sources src ON src.id = sec.source_id
  WHERE src.status = 'published'
  GROUP BY src.slug
  ORDER BY src.slug`;

export const POSITIVE_CONTROL_SQL = `SELECT count(*)::int AS n FROM sources WHERE status = 'published'`;

// Mirrors src/ingest/license-manifest.ts FORBIDDEN_PROVENANCE_DOMAINS — one predicate, not a file list.
export const FORBIDDEN_PROVENANCE_DOMAINS = ['biblehub.com', 'studylight.org', 'historicalchristian.faith'];

const forbiddenLike = (col) =>
  FORBIDDEN_PROVENANCE_DOMAINS.map((d) => `coalesce(${col}, '') ILIKE '%${d}%'`).join(' OR ');

/** True when a source's declared provenance URL is a forbidden aggregator domain. */
export const SOURCE_FORBIDDEN_PROVENANCE_SQL = `(${forbiddenLike("src.provenance->>'url'")})`;

/** True when a section's row-level content provenance is forbidden (031 source_url). */
export const SECTION_FORBIDDEN_PROVENANCE_SQL = `(${forbiddenLike('sec.source_url')})`;

/** Published works safe to sample for ordering excerpts — no forbidden provenance at source or section level. */
export const CLEAN_EXCERPT_WORKS_SQL = `
  SELECT src.slug, src.source_type
  FROM sources src
  WHERE src.status = 'published'
    AND NOT (${SOURCE_FORBIDDEN_PROVENANCE_SQL})
    AND NOT EXISTS (
      SELECT 1 FROM sections sec
      WHERE sec.source_id = src.id AND (${SECTION_FORBIDDEN_PROVENANCE_SQL})
    )
  ORDER BY src.source_type, src.slug`;

export const EXCERPT_SECTIONS_SQL = `
  SELECT sec.unit_ordinal, sec.ordinal, left(coalesce(sec.heading, ''), 80) AS heading
  FROM sections sec
  JOIN sources src ON src.id = sec.source_id
  WHERE src.slug = $1
  ORDER BY sec.unit_ordinal, sec.ordinal
  LIMIT 20`;

/** Pick up to three clean-provenance works (one per register when available). */
export function pickExcerptSlugs(rows, limit = 3) {
  const byRegister = new Map();
  for (const p of rows) {
    if (!byRegister.has(p.source_type)) byRegister.set(p.source_type, p.slug);
  }
  return [...byRegister.values()].slice(0, limit);
}

/**
 * Run the full published-work instrument against an open pg client.
 * @returns {{ ok: boolean, errors: string[], nulls: number, publishedWorks: number, digests: object[], mismatches: object[] }}
 */
export async function measurePublishedUnitOrdinal(client, { backfillSql } = {}) {
  const sql = backfillSql ?? backfillSqlFromMigration();
  const errors = [];

  const control = (await client.query(POSITIVE_CONTROL_SQL)).rows[0];
  if (!control?.n) {
    errors.push('positive control: zero published sources — probe is blind');
    return { ok: false, errors, nulls: 0, publishedWorks: 0, digests: [], mismatches: [] };
  }

  const nullRow = (await client.query(PUBLISHED_NULLS_SQL)).rows[0];
  const nulls = nullRow?.nulls ?? 0;
  if (nulls > 0) errors.push(`${nulls} published section(s) have NULL unit_ordinal`);

  const dups = (await client.query(PUBLISHED_DUP_PAIRS_SQL)).rows;
  if (dups.length) {
    errors.push(`duplicate (unit_ordinal, ordinal) within published works: ${dups.map((r) => `${r.slug} u${r.unit_ordinal}/o${r.ordinal}×${r.n}`).join(', ')}`);
  }

  const breaks = (await client.query(PUBLISHED_ORDER_BREAKS_SQL)).rows;
  if (breaks.length) {
    errors.push(`(unit_ordinal, ordinal) order breaks in ${breaks[0].slug} and possibly others (${breaks.length} row(s) sampled)`);
  }

  const recompute = backfillSelectSql(sql, { scope: 'published' });
  const mismatches = (await client.query(`
    WITH computed AS (${recompute})
    SELECT src.slug, sec.id AS section_id, sec.unit_ordinal AS stored, c.computed_unit_ordinal AS expected
    FROM sections sec
    JOIN sources src ON src.id = sec.source_id
    JOIN computed c ON c.section_id = sec.id
    WHERE src.status = 'published'
      AND sec.unit_ordinal IS DISTINCT FROM c.computed_unit_ordinal
    ORDER BY src.slug, sec.unit_ordinal, sec.ordinal
    LIMIT 20
  `)).rows;
  if (mismatches.length) {
    errors.push(`stored unit_ordinal differs from 024 recomputation for ${mismatches.length}+ section(s); first: ${mismatches[0].slug}#${mismatches[0].section_id} stored=${mismatches[0].stored} expected=${mismatches[0].expected}`);
  }

  const digests = (await client.query(PUBLISHED_DIGEST_SQL)).rows;
  for (const row of digests) {
    if (!row.digest) errors.push(`${row.slug}: digest is NULL (no sections?)`);
    if (row.units < 1 && row.sections > 0) errors.push(`${row.slug}: ${row.sections} section(s) but zero reading units`);
  }

  return {
    ok: errors.length === 0,
    errors,
    nulls,
    publishedWorks: control.n,
    digests,
    mismatches,
  };
}

/** Roll-up digest over all published works (stable ordering by slug). */
export function rollupDigest(digestRows) {
  const payload = digestRows
    .map((r) => `${r.slug}\t${r.digest}\t${r.sections}\t${r.units}`)
    .join('\n');
  return createHash('md5').update(payload).digest('hex');
}
