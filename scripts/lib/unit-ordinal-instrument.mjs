// Work Order v2 Stage 2.1 — unit_ordinal instrument (shared core).
// One tool, three surfaces: db-invariants test, cutover gate leg, read-only CLI.
//
// PROPERTY: for every published work — zero NULL unit_ordinal; (unit_ordinal, ordinal)
// is a strict total order with no duplicates within a unit; stored unit_ordinal preserves
// the 024 recomputation's GROUPING (same stored unit iff same computed unit) and READING
// ORDER (ORDER BY stored unit, ordinal vs computed unit, ordinal yields the same section
// sequence). A uniform per-work offset (stored = computed + k for all sections) is
// reported but does NOT fail — consumers group by equality, not dense 1..N (ADR-026,
// work-reader.ts, search-sections.ts DISTINCT ON). Non-uniform offset or a grouping/order
// break fails.
// Digest leg: md5 over (slug, section_id, unit_ordinal, ordinal) per work catches
// permutations that count/uniqueness checks miss (ADR-033 lesson).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const MIGRATION_024 = path.join(ROOT, 'db/migrations/024_sections_unit_ordinal.sql');
export const MIGRATION_023 = path.join(ROOT, 'db/migrations/023_sources_status_ingesting.sql');

/**
 * The status cohorts a source may be in, READ OUT OF the migration that defines the CHECK
 * constraint — never retyped here. Same discipline as backfillSqlFromMigration: if the set
 * of statuses changes, this list changes with it, and a cohort the database would reject is
 * refused by the instrument before it ever reaches the server.
 */
export function sourceStatusCohorts(migrationPath = MIGRATION_023) {
  const sql = readFileSync(migrationPath, 'utf8');
  const check = sql.match(/CHECK\s*\(\s*status\s*=\s*ANY\s*\(\s*ARRAY\[([^\]]+)\]/i);
  if (!check) throw new Error(`${migrationPath} has no status CHECK constraint — cannot derive the cohort list`);
  const cohorts = [...check[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (cohorts.length === 0) throw new Error(`${migrationPath} status CHECK constraint parsed to zero cohorts`);
  return cohorts;
}

/**
 * A cohort must be NAMED and must be one the schema admits.
 *
 * WHY THIS THROWS rather than returning an empty measurement: `WHERE status = 'publsihed'`
 * is not a query that finds nothing, it is a query that cannot find anything — and the
 * instrument's whole job is to report on a population before it is published. A typo that
 * silently measures zero rows and then reports "0 NULL unit_ordinal, all good" is the
 * unearned green THE_LOOP §6 is about.
 */
export function assertCohort(cohort, migrationPath = MIGRATION_023) {
  const allowed = sourceStatusCohorts(migrationPath);
  if (typeof cohort !== 'string' || cohort.trim() === '') {
    throw new Error(`STOP: no status cohort named. Pass one of: ${allowed.join(', ')}`);
  }
  if (!allowed.includes(cohort)) {
    throw new Error(`STOP: '${cohort}' is not a source status this schema admits. Valid cohorts (from ${path.basename(migrationPath)}): ${allowed.join(', ')}`);
  }
  return cohort;
}

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

const NEED_CTE_NULL_ONLY =
  /WITH need AS \(\s*SELECT DISTINCT source_id FROM sections WHERE unit_ordinal IS NULL\s*\),/;

/**
 * Replace 024's NULL-only `need` CTE. The CTEs below `need` stay byte-identical to the
 * migration — only the selector that feeds them changes (instrument / repair surfaces).
 */
export function replaceNeedCte(backfillUpdateSql, needCteBody) {
  if (!NEED_CTE_NULL_ONLY.test(backfillUpdateSql)) {
    throw new Error('024 backfill SQL: need CTE pattern not found — refusing to invent a selector');
  }
  return backfillUpdateSql.replace(NEED_CTE_NULL_ONLY, `WITH ${needCteBody}`);
}

/** Turn the backfill UPDATE into a SELECT of computed unit_ordinal per section. */
export function backfillSelectSql(backfillUpdateSql, { scope = 'null-only' } = {}) {
  // `scope: 'cohort'` recomputes over whatever status cohort the caller bound to $1 —
  // the cohort is a BOUND PARAMETER, never interpolated, so an unrecognised cohort cannot
  // become SQL and an invalid one is refused by assertCohort before we get here.
  // `scope: 'slugs'` binds $1::text[] of source slugs (repair dry-run / weld detector).
  let body = backfillUpdateSql;
  if (scope === 'cohort') {
    body = replaceNeedCte(
      body,
      `need AS (
  SELECT DISTINCT sec.source_id
  FROM sections sec
  JOIN sources src ON src.id = sec.source_id
  WHERE src.status = $1
),`,
    );
  } else if (scope === 'slugs') {
    body = replaceNeedCte(
      body,
      `need AS (
  SELECT id AS source_id FROM sources WHERE slug = ANY($1::text[])
),`,
    );
  } else if (scope !== 'null-only') {
    throw new Error(`backfillSelectSql: unknown scope '${scope}'`);
  }

  const selectTail = `SELECT u.id AS section_id, u.source_id, n.unit_ordinal AS computed_unit_ordinal
FROM units u
JOIN numbered n ON n.source_id = u.source_id AND n.unit_key = u.unit_key`;

  return body.replace(/UPDATE sections s[\s\S]+$/, selectTail);
}

/**
 * Repair UPDATE: same 024 CTE chain, but `need` is the named slug list ($1::text[]).
 * Does NOT go through NULL — a single set-based UPDATE writes computed unit_ordinal.
 * Re-running migration 024 alone cannot do this: its need selector is idempotent by
 * exclusion (NULL-only), which is exactly why post-delete drift sticks.
 */
export function backfillRepairUpdateSql(backfillUpdateSql) {
  return replaceNeedCte(
    backfillUpdateSql,
    `need AS (
  SELECT id AS source_id FROM sources WHERE slug = ANY($1::text[])
),`,
  );
}

// Every statement below takes the cohort as $1. Nothing here hardcodes 'published' any
// more: the instrument exists to measure the cohort that is ABOUT TO BE published, and a
// probe wired permanently to `status = 'published'` reports on the population that has
// already shipped while the operator believes it is reading the one under review.
export const COHORT_NULLS_SQL = `
  SELECT count(*) FILTER (WHERE sec.unit_ordinal IS NULL)::int AS nulls,
         count(*)::int AS total
  FROM sections sec
  JOIN sources src ON src.id = sec.source_id
  WHERE src.status = $1`;

export const COHORT_DUP_PAIRS_SQL = `
  SELECT src.slug, sec.unit_ordinal, sec.ordinal, count(*)::int AS n
  FROM sections sec
  JOIN sources src ON src.id = sec.source_id
  WHERE src.status = $1
  GROUP BY src.slug, sec.unit_ordinal, sec.ordinal
  HAVING count(*) > 1
  ORDER BY src.slug, sec.unit_ordinal, sec.ordinal
  LIMIT 20`;

export const COHORT_ORDER_BREAKS_SQL = `
  WITH ordered AS (
    SELECT src.slug, sec.unit_ordinal, sec.ordinal,
           lag(sec.unit_ordinal) OVER (PARTITION BY src.slug ORDER BY sec.unit_ordinal, sec.ordinal) AS prev_uo,
           lag(sec.ordinal) OVER (PARTITION BY src.slug ORDER BY sec.unit_ordinal, sec.ordinal) AS prev_ord
    FROM sections sec
    JOIN sources src ON src.id = sec.source_id
    WHERE src.status = $1
  )
  SELECT slug, prev_uo, prev_ord, unit_ordinal, ordinal
  FROM ordered
  WHERE prev_uo IS NOT NULL
    AND NOT (unit_ordinal > prev_uo OR (unit_ordinal = prev_uo AND ordinal > prev_ord))
  LIMIT 20`;

export const COHORT_DIGEST_SQL = `
  SELECT src.slug,
         md5(string_agg(
           src.slug || '|' || sec.id::text || '|' || sec.unit_ordinal::text || '|' || sec.ordinal::text,
           E'\\n' ORDER BY sec.unit_ordinal, sec.ordinal, sec.id
         )) AS digest,
         count(*)::int AS sections,
         count(DISTINCT sec.unit_ordinal)::int AS units
  FROM sections sec
  JOIN sources src ON src.id = sec.source_id
  WHERE src.status = $1
  GROUP BY src.slug
  ORDER BY src.slug`;

export const COHORT_POSITIVE_CONTROL_SQL = `SELECT count(*)::int AS n FROM sources WHERE status = $1`;

/**
 * Pure analysis: does stored unit_ordinal preserve 024 grouping and reading order?
 *
 * @param {Array<{ section_id: string, stored: number|null, computed: number|null, ordinal: number }>} rows
 * @returns {{ ok: boolean, errors: string[], uniformOffset: number|null }}
 */
export function analyzeUnitOrdinalPreservation(rows) {
  const errors = [];
  const populated = rows.filter((r) => r.stored !== null && r.computed !== null);
  if (populated.length === 0) return { ok: true, errors, uniformOffset: null };

  const storedToComputed = new Map();
  for (const r of populated) {
    const prev = storedToComputed.get(r.stored);
    if (prev !== undefined && prev !== r.computed) {
      errors.push(`grouping break: stored unit ${r.stored} maps to computed ${prev} and ${r.computed}`);
    } else {
      storedToComputed.set(r.stored, r.computed);
    }
  }
  const computedToStored = new Map();
  for (const r of populated) {
    const prev = computedToStored.get(r.computed);
    if (prev !== undefined && prev !== r.stored) {
      errors.push(`grouping break: computed unit ${r.computed} maps to stored ${prev} and ${r.stored}`);
    } else {
      computedToStored.set(r.computed, r.stored);
    }
  }

  const byStored = [...populated].sort((a, b) => a.stored - b.stored || a.ordinal - b.ordinal);
  const byComputed = [...populated].sort((a, b) => a.computed - b.computed || a.ordinal - b.ordinal);
  const storedSeq = byStored.map((r) => r.section_id).join('\0');
  const computedSeq = byComputed.map((r) => r.section_id).join('\0');
  if (storedSeq !== computedSeq) {
    errors.push('reading order break: ORDER BY (stored unit, ordinal) vs (computed unit, ordinal) yields different section sequence');
  }

  const offsets = new Set(populated.map((r) => r.stored - r.computed));
  let uniformOffset = null;
  if (offsets.size === 1) {
    uniformOffset = [...offsets][0];
  } else if (offsets.size > 1) {
    errors.push(`non-uniform offset: ${offsets.size} distinct (stored - computed) deltas (${[...offsets].slice(0, 5).join(', ')})`);
  }

  return { ok: errors.length === 0, errors, uniformOffset };
}

/**
 * Run the full instrument against an open pg client, over ONE EXPLICITLY NAMED status cohort.
 *
 * The cohort travels into every error string and into the returned object, because a report
 * that does not say which population it measured is indistinguishable from a report about a
 * different one — and the two runs this instrument matters for (the staged cohort about to be
 * flipped, and the published cohort already serving) are otherwise identical in shape.
 *
 * @returns {{ cohort: string, ok: boolean, errors: string[], nulls: number, cohortWorks: number, digests: object[], mismatches: object[], uniformOffsets: object[] }}
 */
export async function measureUnitOrdinalForCohort(client, { cohort, backfillSql } = {}) {
  assertCohort(cohort);
  const sql = backfillSql ?? backfillSqlFromMigration();
  const errors = [];
  const blank = { cohort, nulls: 0, cohortWorks: 0, digests: [], mismatches: [], uniformOffsets: [] };

  // POSITIVE CONTROL over THIS cohort. Not over 'published': asking "are there published
  // sources?" before measuring the staged ones proves the probe can see a population it is
  // not about to report on, which is no control at all.
  const control = (await client.query(COHORT_POSITIVE_CONTROL_SQL, [cohort])).rows[0];
  if (!control?.n) {
    errors.push(`positive control: zero sources in cohort '${cohort}' — the probe is blind, ABORTING rather than reporting a clean run over nothing`);
    return { ok: false, errors, ...blank };
  }

  const nullRow = (await client.query(COHORT_NULLS_SQL, [cohort])).rows[0];
  const nulls = nullRow?.nulls ?? 0;
  if (nulls > 0) errors.push(`cohort '${cohort}': ${nulls} section(s) have NULL unit_ordinal`);

  const dups = (await client.query(COHORT_DUP_PAIRS_SQL, [cohort])).rows;
  if (dups.length) {
    errors.push(`cohort '${cohort}': duplicate (unit_ordinal, ordinal) within works: ${dups.map((r) => `${r.slug} u${r.unit_ordinal}/o${r.ordinal}×${r.n}`).join(', ')}`);
  }

  const breaks = (await client.query(COHORT_ORDER_BREAKS_SQL, [cohort])).rows;
  if (breaks.length) {
    errors.push(`cohort '${cohort}': (unit_ordinal, ordinal) order breaks in ${breaks[0].slug} and possibly others (${breaks.length} row(s) sampled)`);
  }

  const recompute = backfillSelectSql(sql, { scope: 'cohort' });
  const preservationRows = (await client.query(`
    WITH computed AS (${recompute})
    SELECT src.slug, sec.id AS section_id, sec.unit_ordinal AS stored,
           c.computed_unit_ordinal AS computed, sec.ordinal
    FROM sections sec
    JOIN sources src ON src.id = sec.source_id
    JOIN computed c ON c.section_id = sec.id
    WHERE src.status = $1
    ORDER BY src.slug, sec.unit_ordinal, sec.ordinal
  `, [cohort])).rows;

  const bySlug = new Map();
  for (const row of preservationRows) {
    if (!bySlug.has(row.slug)) bySlug.set(row.slug, []);
    bySlug.get(row.slug).push(row);
  }

  const uniformOffsets = [];
  const mismatches = [];
  for (const [slug, rows] of bySlug) {
    const analysis = analyzeUnitOrdinalPreservation(rows);
    if (!analysis.ok) {
      for (const e of analysis.errors) {
        errors.push(`cohort '${cohort}': ${slug}: ${e}`);
      }
      const sample = rows.find((r) => r.stored !== r.computed);
      if (sample) mismatches.push({ slug, section_id: sample.section_id, stored: sample.stored, expected: sample.computed });
    } else if (analysis.uniformOffset !== null && analysis.uniformOffset !== 0) {
      uniformOffsets.push({ slug, offset: analysis.uniformOffset, sections: rows.length });
    }
  }

  const digests = (await client.query(COHORT_DIGEST_SQL, [cohort])).rows;
  for (const row of digests) {
    if (!row.digest) errors.push(`cohort '${cohort}': ${row.slug}: digest is NULL (no sections?)`);
    if (row.units < 1 && row.sections > 0) errors.push(`cohort '${cohort}': ${row.slug}: ${row.sections} section(s) but zero reading units`);
  }

  return {
    cohort,
    ok: errors.length === 0,
    errors,
    nulls,
    cohortWorks: control.n,
    digests,
    mismatches,
    uniformOffsets,
  };
}

/**
 * Published-cohort surface, kept for the cutover gate's G10 leg and the db-invariants test.
 * It is a NAMED cohort like any other — 'published' has no privileged status in the core.
 */
export async function measurePublishedUnitOrdinal(client, { backfillSql } = {}) {
  const r = await measureUnitOrdinalForCohort(client, { cohort: 'published', backfillSql });
  return { ...r, publishedWorks: r.cohortWorks };
}

/**
 * Render the committed report body. Lives here, not in the CLI, so that "two runs are told
 * apart by CONTENT, not by filename" is a property a test can execute rather than a claim
 * an operator has to verify by opening two files.
 *
 * The cohort is the first fact in the body and is repeated on the works line and on every
 * excerpt heading — an --out path is chosen by a human and proves nothing about what was
 * measured.
 */
export function renderReportText(report, renderExcerptLines) {
  return [
    `# unit_ordinal instrument — cohort '${report.cohort}' — ${report.ts}`,
    `cohort: ${report.cohort}   (sources.status = '${report.cohort}')`,
    `target: ${report.target}`,
    `worksInCohort: ${report.cohortWorks ?? 0}`,
    `ok: ${report.ok}`,
    `rollupDigest: ${report.rollupDigest}`,
    `excerptHeader: ${report.excerptHeader ?? ''}`,
    `sampleSlugs: ${(report.excerptSampleSlugs ?? []).join(', ')}`,
    '',
    ...((report.errors ?? []).map((e) => `ERROR: ${e}`)),
    '',
    ...(report.excerpts ? Object.entries(report.excerpts).flatMap(([slug, rows]) => [
      `## [cohort=${report.cohort}] ${slug}`,
      ...renderExcerptLines(rows),
      '',
    ]) : []),
  ].join('\n');
}

/** Roll-up digest over all published works (stable ordering by slug). */
export function rollupDigest(digestRows) {
  const payload = digestRows
    .map((r) => `${r.slug}\t${r.digest}\t${r.sections}\t${r.units}`)
    .join('\n');
  return createHash('md5').update(payload).digest('hex');
}
