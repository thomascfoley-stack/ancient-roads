#!/usr/bin/env node
// A2.1 + A2.4 — production status census and standing-gap re-measurement. READ-ONLY.
//
//   node docs/evidence/a2-prod-readonly-2026-08-01/census.mjs --read-only --target=ep-odd-fog
//
// WHY THIS FILE EXISTS rather than a repo runner (recorded, not glossed):
//   * scripts/publish-flip-census.mts REFUSES production outright (:52-55) and is dev-only
//     by design. Pointing it at ep-odd-fog would mean defeating a guard.
//   * scripts/prod-census.cjs resolves its URL from CUTOVER_DATABASE_URL or .env.prod
//     (:26-30). The A2 order's rail 3 permits exactly one credential source, NEON_API_KEY,
//     and forbids a production connection string on disk.
//   So this script uses the SAME sanctioned path the instrument uses —
//   resolveInstrumentConnection() + assertReadOnlySession() from scripts/lib/neon-connection.mjs
//   — and nothing else. It is scoped to this one run and lives with its evidence, not in
//   scripts/, because it is not a general repo tool and was not ordered as one.
//
// SAFETY, in order of strength:
//   1. BEGIN; SET TRANSACTION READ ONLY — the DATABASE refuses writes, not this script.
//   2. assertReadOnlySession() re-asks the SERVER for transaction_read_only and current_user.
//   3. ROLLBACK in an unconditional finally. Never COMMIT.
//   4. Target asserted by resolveInstrumentConnection() against the declared endpoint id.
//   5. count(*) and catalog reads only. No row bodies, no vector payloads, no credentials
//      printed — the host is echoed as its endpoint id, never as a URL.
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

if (!READ_ONLY || !target) {
  console.error('Usage: node census.mjs --read-only --target=<endpoint-id>');
  process.exit(2);
}

const conn = resolveInstrumentConnection({ target, role: INSTRUMENT_ROLE });
const host = endpointId(new URL(conn.url).host) ?? 'unknown';

console.log(`A2 production census — read-only`);
console.log(`  target declared: ${target}`);
console.log(`  host reached:    ${host} (credentials redacted)`);
console.log(`  connection:      ${conn.source} role=${conn.role} branch=${conn.branch}`);
console.log(`  ts:              ${new Date().toISOString()}`);

const c = new pg.Client({
  connectionString: conn.url,
  ssl: { rejectUnauthorized: false },
  application_name: 'a2-prod-census',
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

  // ── POSITIVE CONTROL. If this is 0 the probe shape is wrong and every 0 below is noise.
  const ctl = await one(
    `SELECT count(*)::int AS n FROM embeddings WHERE user_id IS NULL AND metadata->>'author' = 'John Gill'`,
  );
  console.log(`\n=== POSITIVE CONTROL: John Gill rows = ${ctl.n} ${ctl.n > 0 ? '✓ (probe fires)' : '✗ ABORT'}`);
  if (ctl.n === 0) throw new Error('positive control returned 0 — probe shape is wrong, not a clean result');

  // ══ A2.1 — THE STATUS CENSUS ═════════════════════════════════════════════
  console.log(`\n=== A2.1 SOURCES CENSUS (every row in \`sources\`) ===`);
  const sources = await many(`
    SELECT src.slug,
           coalesce(src.source_type, '(none)') AS source_type,
           src.status,
           (SELECT count(*)::int FROM sections sec WHERE sec.source_id = src.id) AS sections
      FROM sources src
     ORDER BY src.status, src.source_type, src.slug`);
  console.log(`  slug                           source_type       status       sections`);
  for (const r of sources) {
    console.log(
      `  ${r.slug.padEnd(30)} ${r.source_type.padEnd(17)} ${r.status.padEnd(12)} ${String(r.sections).padStart(8)}`,
    );
  }

  const byStatus = await many(
    `SELECT status, count(*)::int AS works FROM sources GROUP BY status ORDER BY status`,
  );
  const totals = await one(`
    SELECT (SELECT count(*)::int FROM sources)  AS sources,
           (SELECT count(*)::int FROM sections) AS sections`);
  console.log(`\n=== A2.1 TOTALS ===`);
  for (const r of byStatus) console.log(`  status ${r.status.padEnd(14)} ${String(r.works).padStart(4)} source(s)`);
  console.log(`  sources total  ${totals.sources}`);
  console.log(`  sections total ${totals.sections}`);
  const sumPerSource = sources.reduce((a, r) => a + r.sections, 0);
  console.log(`  sections summed per-source ${sumPerSource} ${sumPerSource === totals.sections ? '✓ matches' : '✗ MISMATCH — sections exist with no source row'}`);
  console.log(`  (2026-07-30 hand-transcribed reading for comparison: 7 sources / 7 staged / 0 published / 72,863 sections)`);

  // ══ A2.4a — app_runtime grants on embeddings ═════════════════════════════
  console.log(`\n=== A2.4a GRANTS HELD BY ${INSTRUMENT_ROLE} (has_table_privilege, asked of the server) ===`);
  const tables = ['embeddings', 'commentary_entries', 'sources', 'sections'];
  const privs = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  console.log(`  table                 ${privs.map((p) => p.padEnd(7)).join('')}`);
  for (const t of tables) {
    const exists = (await one(`SELECT to_regclass($1) IS NOT NULL AS ok`, [t])).ok;
    if (!exists) { console.log(`  ${t.padEnd(21)} (table absent)`); continue; }
    const row = await one(
      `SELECT ${privs.map((p, i) => `has_table_privilege($1, $${i + 2}) AS p${i}`).join(', ')}`,
      [t, ...privs],
    );
    console.log(`  ${t.padEnd(21)} ${privs.map((_, i) => (row[`p${i}`] ? 'YES' : 'no').padEnd(7)).join('')}`);
  }
  console.log(`  (STATE_OF_TRUTH.md:300-304 records app_runtime still holding INSERT/UPDATE/DELETE on embeddings)`);

  // ══ A2.4b — G1 user-data inventory ═══════════════════════════════════════
  console.log(`\n=== A2.4b G1 USER-DATA INVENTORY (counts only; no row bodies read) ===`);
  const userTables = [
    'waitlist', 'channels',
    'highlights', 'notes', 'chats', 'messages',
    'bookmarks', 'reading_progress', 'user_library', 'library_items',
    'chat_memories', 'reading_history', 'study_guides', 'user_profiles',
    'user_integrations', 'api_rate_limit',
  ];
  for (const t of userTables) {
    const exists = (await one(`SELECT to_regclass($1) IS NOT NULL AS ok`, [t])).ok;
    if (!exists) { console.log(`  ${t.padEnd(20)} (table absent)`); continue; }
    if (!(await one(`SELECT has_table_privilege($1, 'SELECT') AS ok`, [t])).ok) {
      console.log(`  ${t.padEnd(20)} (no SELECT grant for ${INSTRUMENT_ROLE} — NOT MEASURED)`);
      continue;
    }
    const hasUser = (await one(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = $1 AND column_name = 'user_id') AS ok`, [t])).ok;
    const r = await one(
      hasUser
        ? `SELECT count(*)::int AS n, count(DISTINCT user_id)::int AS users FROM ${t}`
        : `SELECT count(*)::int AS n, NULL::int AS users FROM ${t}`,
    );
    console.log(`  ${t.padEnd(20)} rows=${String(r.n).padStart(6)}  distinct_users=${r.users ?? 'n/a (no user_id column)'}`);
  }
  console.log(`  (STATE_OF_TRUTH.md:92-94 marks "prod user data is empty" as owner-ASSERTED, never measured)`);

  // ══ A2.4c — forbidden provenance, against the 71,884 ratchet ═════════════
  console.log(`\n=== A2.4c FORBIDDEN PROVENANCE ===`);
  const forbFlat = await one(`
    SELECT count(*) FILTER (WHERE metadata->>'sourceUrl' ILIKE '%biblehub%')::int             AS biblehub,
           count(*) FILTER (WHERE metadata->>'sourceUrl' ILIKE '%studylight%')::int           AS studylight,
           count(*) FILTER (WHERE metadata->>'sourceUrl' ILIKE '%historicalchristian%')::int  AS hcf
      FROM embeddings WHERE user_id IS NULL`);
  const flatTotal = forbFlat.biblehub + forbFlat.studylight + forbFlat.hcf;
  console.log(`  flat embeddings (metadata->>'sourceUrl'):`);
  console.log(`    biblehub    ${forbFlat.biblehub}`);
  console.log(`    studylight  ${forbFlat.studylight}`);
  console.log(`    hcf         ${forbFlat.hcf}`);
  console.log(`    TOTAL       ${flatTotal}   vs 71,884 ratchet (STATE_OF_TRUTH.md:111) — ${
    flatTotal === 71884 ? '✓ unchanged' : flatTotal < 71884 ? `DECREASED by ${71884 - flatTotal}` : `INCREASED by ${flatTotal - 71884}`}`);

  const forbSec = await many(`
    SELECT src.slug, src.status, count(*)::int AS n
      FROM sections sec JOIN sources src ON src.id = sec.source_id
     WHERE sec.source_url ILIKE '%biblehub.com%'
        OR sec.source_url ILIKE '%studylight.org%'
        OR sec.source_url ILIKE '%historicalchristian.faith%'
     GROUP BY 1, 2 ORDER BY 3 DESC`);
  console.log(`  sections store (sec.source_url): ${forbSec.length} work(s)`);
  for (const r of forbSec) console.log(`    ${r.slug.padEnd(30)} ${r.status.padEnd(12)} ${r.n}`);
  if (forbSec.length === 0) console.log(`    (none)`);

  // ══ context for A2.3 — the flat-pool shape, no serving predicate applied here ══
  console.log(`\n=== CONTEXT (not a verdict) ===`);
  const cov = await one(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE metadata->>'work' IS NULL)::int AS no_work
      FROM embeddings WHERE user_id IS NULL`);
  console.log(`  flat platform embeddings: ${cov.total}   without a work key: ${cov.no_work} (${(cov.no_work / cov.total * 100).toFixed(1)}%)`);
  const secEmb = await one(`SELECT count(*)::int AS n FROM section_embeddings`);
  console.log(`  section_embeddings: ${secEmb.n}`);

  console.log(`\n✓ census complete. ROLLBACK follows; zero writes performed (transaction was READ ONLY throughout).`);
} finally {
  await c.query('ROLLBACK').catch((e) => console.error(`ROLLBACK failed: ${e.message}`));
  await c.end();
}
