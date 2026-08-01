#!/usr/bin/env node
// A2.3 — the serving census. READ-ONLY.
//
//   node docs/evidence/a2-prod-readonly-2026-08-01/serving-census.mjs \
//     --read-only --target=ep-odd-fog --predicates=/tmp/a2/serving-predicates.json
//
// NOTHING IS MIRRORED. LEGAL_CORPUS_FILTER / PROSE_TYPE_SQL / SERVED_PROSE_WORKS /
// SERVED_LANE_WORKS are NOT retyped here. They are extracted from
// web/src/lib/teacher/routing.ts itself by a SEPARATE `npx tsx` process that holds no
// credential, written to JSON, and read back here. That keeps CUTOVER_DESIGN.md:201-213
// ("a gate that re-implements the predicate it is checking is measuring a look-alike" —
// the copy that had drifted 27.8%) while keeping the transpiler off the process that
// opens the production connection (excerpt-sample-policy.mjs:5-11, Tranche 0.1).
//
// Same read-only safety as census.mjs: BEGIN + SET TRANSACTION READ ONLY, the server
// re-asked via assertReadOnlySession(), unconditional ROLLBACK, counts only.
import fs from 'node:fs';
import pg from 'pg';
import { endpointId } from '../../../scripts/lib/target-guard.mjs';
import {
  resolveInstrumentConnection,
  assertReadOnlySession,
  INSTRUMENT_ROLE,
} from '../../../scripts/lib/neon-connection.mjs';

const args = process.argv.slice(2);
const READ_ONLY = args.includes('--read-only');
const target = args.find((a) => a.startsWith('--target='))?.split('=')[1];
const predPath = args.find((a) => a.startsWith('--predicates='))?.split('=')[1];

if (!READ_ONLY || !target || !predPath) {
  console.error('Usage: node serving-census.mjs --read-only --target=<endpoint-id> --predicates=<path.json>');
  process.exit(2);
}

const P = JSON.parse(fs.readFileSync(predPath, 'utf8'));
const SERVED_SLUGS = [...P.SERVED_PROSE_WORKS, ...P.SERVED_LANE_WORKS];

// The numeric-verseId guard is NOT part of the filter. LEGAL_CORPUS_FILTER casts
// (metadata->>'verseId')::int inside an AND whose left side is an author test, and
// Postgres does not guarantee short-circuit evaluation — a non-numeric verseId anywhere
// in the table can raise 22P02 and abort the read. scripts/publish-flip-census.mts:118
// carries the identical guard for the identical reason. Its cost is measured below and
// reported, not hidden.
const NUMERIC_VERSEID = `metadata->>'verseId' ~ '^[0-9]+$'`;

const conn = resolveInstrumentConnection({ target, role: INSTRUMENT_ROLE });
const host = endpointId(new URL(conn.url).host) ?? 'unknown';

console.log(`A2.3 serving census — read-only`);
console.log(`  target declared: ${target}`);
console.log(`  host reached:    ${host} (credentials redacted)`);
console.log(`  connection:      ${conn.source} role=${conn.role} branch=${conn.branch}`);
console.log(`  predicates from: web/src/lib/teacher/routing.ts (extracted, not retyped)`);
console.log(`  ts:              ${new Date().toISOString()}`);

const c = new pg.Client({
  connectionString: conn.url,
  ssl: { rejectUnauthorized: false },
  application_name: 'a2-serving-census',
  statement_timeout: 600_000,
});
await c.connect();

const one = async (sql, params = []) => (await c.query(sql, params)).rows[0];
const many = async (sql, params = []) => (await c.query(sql, params)).rows;

try {
  await c.query('BEGIN');
  await c.query('SET TRANSACTION READ ONLY');
  const asserted = await assertReadOnlySession(c, { role: INSTRUMENT_ROLE });
  console.log(`  server says:     transaction_read_only=on, current_user=${asserted.role} ✓`);

  // ── POSITIVE CONTROL: the filter itself must admit something, or every "not admitted"
  //    below is the predicate failing to fire rather than a fact about the corpus.
  const admittedTotal = (await one(`
    SELECT count(*)::int AS n FROM embeddings
     WHERE user_id IS NULL AND ${NUMERIC_VERSEID}
       AND ${P.PROSE_TYPE_SQL} AND ${P.LEGAL_CORPUS_FILTER}`)).n;
  console.log(`\n=== POSITIVE CONTROL: rows admitted by LEGAL_CORPUS_FILTER = ${admittedTotal} ${admittedTotal > 0 ? '✓ (filter fires)' : '✗ ABORT'}`);
  if (admittedTotal === 0) throw new Error('LEGAL_CORPUS_FILTER admitted 0 rows — the predicate is not firing; every "NOT-ADMITTED" would be meaningless');

  // What the numeric-verseId guard costs.
  const guard = await one(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE NOT (${NUMERIC_VERSEID}) OR metadata->>'verseId' IS NULL)::int AS non_numeric
      FROM embeddings WHERE user_id IS NULL`);
  console.log(`  guard cost: ${guard.non_numeric} of ${guard.total} platform rows have a non-numeric/absent verseId and are excluded from the counts below`);

  // ── per-source admission ─────────────────────────────────────────────────
  const sources = await many(`
    SELECT src.slug,
           coalesce(src.source_type, '(none)') AS source_type,
           src.status,
           (SELECT count(*)::int FROM sections sec WHERE sec.source_id = src.id) AS sections
      FROM sources src ORDER BY src.status, src.slug`);

  const rows = [];
  for (const s of sources) {
    // Rows in the flat store that claim this work.
    const work = await one(
      `SELECT count(*)::int AS n FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = $1`, [s.slug]);
    const admitted = await one(`
      SELECT count(*)::int AS n FROM embeddings
       WHERE user_id IS NULL AND metadata->>'work' = $1 AND ${NUMERIC_VERSEID}
         AND ${P.PROSE_TYPE_SQL} AND ${P.LEGAL_CORPUS_FILTER}`, [s.slug]);
    const authors = await many(
      `SELECT metadata->>'author' AS author, count(*)::int AS n
         FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = $1
        GROUP BY 1 ORDER BY 2 DESC LIMIT 5`, [s.slug]);
    rows.push({
      ...s,
      slugLegAdmits: SERVED_SLUGS.includes(s.slug),
      workRows: work.n,
      admittedRows: admitted.n,
      authors: authors.map((a) => `${a.author ?? '(null)'}=${a.n}`).join(', ') || '(no rows carry this work key)',
    });
  }

  console.log(`\n=== A2.3 SERVING CENSUS — per source ===`);
  console.log(`  slug                           status      sections  publishd  slug-leg  flat rows  ADMITTED`);
  for (const r of rows) {
    console.log(
      `  ${r.slug.padEnd(30)} ${r.status.padEnd(11)} ${String(r.sections).padStart(8)}  ${
        (r.status === 'published' ? 'YES' : 'no').padEnd(8)}  ${
        (r.slugLegAdmits ? 'YES' : 'no').padEnd(8)}  ${String(r.workRows).padStart(9)}  ${String(r.admittedRows).padStart(8)}`,
    );
  }
  console.log(`\n  authors carried, per work key:`);
  for (const r of rows) console.log(`    ${r.slug.padEnd(30)} ${r.authors}`);

  // ── the serving pool as a whole, by author ───────────────────────────────
  console.log(`\n=== WHAT THE FILTER ADMITS, BY AUTHOR (whole flat store, work key or not) ===`);
  const byAuthor = await many(`
    SELECT coalesce(metadata->>'author', '(null)') AS author,
           count(*)::int AS n,
           count(*) FILTER (WHERE metadata->>'work' IS NULL)::int AS no_work_key
      FROM embeddings
     WHERE user_id IS NULL AND ${NUMERIC_VERSEID}
       AND ${P.PROSE_TYPE_SQL} AND ${P.LEGAL_CORPUS_FILTER}
     GROUP BY 1 ORDER BY 2 DESC`);
  let admittedSum = 0;
  for (const a of byAuthor) {
    admittedSum += a.n;
    console.log(`  ${a.author.padEnd(34)} ${String(a.n).padStart(7)}   of which no work key: ${a.no_work_key}`);
  }
  console.log(`  TOTAL admitted ${admittedSum}`);
  console.log(`  distinct authors admitted: ${byAuthor.length}`);

  console.log(`\n✓ serving census complete. ROLLBACK follows; zero writes performed.`);
} finally {
  await c.query('ROLLBACK').catch((e) => console.error(`ROLLBACK failed: ${e.message}`));
  await c.end();
}
