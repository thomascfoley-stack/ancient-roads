// §4 — THE BEFORE/AFTER VERIFIER for the publish flip. Prod-capable, read-only, plain node.
//
//   NEON_API_KEY=<key> node scripts/publish-flip-verify.mjs --target=ep-odd-fog \
//     --out=docs/evidence/work-order-v2-stage2/flip-before.log
//   ...flip...
//   NEON_API_KEY=<key> node scripts/publish-flip-verify.mjs --target=ep-odd-fog \
//     --out=docs/evidence/work-order-v2-stage2/flip-after.log
//   diff flip-before.log flip-after.log
//
// WHY publish-flip-census.mts CANNOT SERVE HERE, and this exists instead:
//   1. It refuses production outright (`:52-55`), deliberately, and that refusal should stay.
//   2. Its queries are cohort-parameterised (`WHERE status IN ($1,'published')`), so a
//      before-run and an after-run with different cohorts measure DIFFERENT populations and
//      their diff shows the parameterisation, not the flip.
//
// THE POPULATION HERE IS FIXED — every row of `sources`, every register count, always. So
// `diff before after` means exactly the flip and nothing else. That property is the whole
// design: the go/no-go after A4 is "the diff shows the adjudicated slugs moving
// staged->published and NOTHING else moving".
//
// Credential discipline: resolveInstrumentConnection — app_runtime only, NEON_API_KEY only,
// no DATABASE_URL fallback. app_runtime keeps SELECT (010/021 revoke DML only), which is all
// this needs. Read-only is asserted AT THE SERVER, and the transaction always rolls back.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import {
  assertReadOnlySession,
  resolveInstrumentConnection,
  scrubCredentialText,
  INSTRUMENT_ROLE,
} from './lib/neon-connection.mjs';

const args = process.argv.slice(2);
const val = (f) => args.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1);
const target = val('--target');
const outPath = val('--out');
const localUrl = process.env.FLIP_VERIFY_LOCAL_URL; // red-proof only: a localhost owner URL

function die(msg, code = 2) {
  console.error(scrubCredentialText(String(msg)));
  process.exit(code);
}

if (!outPath) die('usage: publish-flip-verify.mjs --target=<endpoint-id> --out=<log path>');
if (!target && !localUrl) die('--target=<endpoint-id> is required (or FLIP_VERIFY_LOCAL_URL for red-proof).');

let conn;
if (localUrl) {
  // The red-proof path. Refuses anything that is not local, so this env var cannot become a
  // side door to a real endpoint: the guard is the same one the desk of production tools uses.
  // Wrapped, and anchored. Unwrapped, a malformed value made Node print the whole connection
  // string — password included — in its uncaught-exception report (2026-08-02 audit). And the
  // prefix test was unanchored, so `localhost.attacker.example` passed.
  let host;
  try {
    host = new URL(localUrl).host.toLowerCase();
  } catch {
    die('STOP: FLIP_VERIFY_LOCAL_URL is not a parseable URL.');
  }
  const bare = host.split(':')[0];
  if (bare !== 'localhost' && bare !== '127.0.0.1' && bare !== '[::1]' && bare !== '::1') {
    die(`STOP: FLIP_VERIFY_LOCAL_URL host ${host} is not local. The env override is red-proof only.`);
  }
  conn = { url: localUrl, host, ssl: false, expectRole: null };
} else {
  const r = resolveInstrumentConnection({ target, role: INSTRUMENT_ROLE });
  conn = { url: r.url, host: r.host, ssl: { rejectUnauthorized: true }, expectRole: INSTRUMENT_ROLE };
}

const client = new pg.Client({ connectionString: conn.url, ssl: conn.ssl });
try {
  await client.connect();
} catch (e) {
  die(`STOP: could not connect to ${conn.host}: ${e.message}`);
}

const lines = [];
const say = (s) => lines.push(s);

try {
  await client.query('BEGIN');
  await client.query('SET TRANSACTION READ ONLY');
  if (conn.expectRole) await assertReadOnlySession(client, { role: conn.expectRole });

  say(`publish-flip verify — ${conn.host} (credentials redacted)`);
  // NOTE deliberately NO timestamp in the body: the before/after diff must show data changes
  // only. The filesystem carries the when.

  // §1 every source, fixed order, fixed columns.
  const sources = (
    await client.query(
      `SELECT s.slug, s.status, s.source_type,
              COALESCE(s.license,'(none)') AS license,
              (SELECT count(*)::int FROM sections sec WHERE sec.source_id = s.id) AS sections
         FROM sources s ORDER BY s.slug`,
    )
  ).rows;
  say('');
  say('sources (slug status type license sections):');
  for (const r of sources) say(`  ${r.slug} ${r.status} ${r.source_type} ${r.license} ${r.sections}`);

  // §2 published works per register — the number the catalogs render from.
  const perRegister = (
    await client.query(
      `SELECT source_type, count(*)::int AS works FROM sources
        WHERE status='published' GROUP BY 1 ORDER BY 1`,
    )
  ).rows;
  say('');
  say('published works per register:');
  if (perRegister.length === 0) say('  (none published)');
  for (const r of perRegister) say(`  ${r.source_type}: ${r.works}`);

  // §3 totals.
  const totals = (
    await client.query(
      `SELECT (SELECT count(*)::int FROM sources)                       AS sources,
              (SELECT count(*)::int FROM sources WHERE status='staged')    AS staged,
              (SELECT count(*)::int FROM sources WHERE status='published') AS published,
              (SELECT count(*)::int FROM sections)                      AS sections`,
    )
  ).rows[0];
  say('');
  say(`totals: sources=${totals.sources} staged=${totals.staged} published=${totals.published} sections=${totals.sections}`);
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  die(`FAILED read-only census on ${conn.host}: ${e.message}`, 1);
} finally {
  // Always. This session must leave no trace even though it never wrote.
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
console.log(`\nwrote ${outPath}`);
