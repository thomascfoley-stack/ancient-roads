// Publish already-sliced STAGED works to 'published' on DEV, through an INLINE
// fail-closed license+provenance gate in the same transaction: if flipping these
// rows would leave ANY published source with a disallowed license or a forbidden
// provenance domain, it ROLLS BACK. Idempotent (only flips status='staged').
// Reversible (flip back to staged). DEV-ONLY (refuses any non-dev host).
//
//   node scripts/publish-works.mjs <slug> [<slug> ...]
import pg from 'pg';
import fs from 'node:fs';

const ALLOWED = ['Public Domain', 'CC BY', 'CC BY-SA'];
const FORBIDDEN = ['biblehub.com', 'studylight.org', 'historicalchristian.faith'];

const envText = fs.readFileSync(process.env.HOME + '/theology-study-app/.env.local', 'utf8');
const val = (k) => envText.match(new RegExp('^' + k + '="?([^"\\n]*)"?$', 'm'))?.[1];
const url = val('DATABASE_URL_UNPOOLED') ?? val('DATABASE_URL');
if (!new URL(url).host.includes('ep-tiny-hat')) { console.error('NOT DEV — refusing to publish'); process.exit(1); }

const slugs = process.argv.slice(2);
if (slugs.length === 0) { console.error('usage: publish-works.mjs <slug> ...'); process.exit(1); }

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query('BEGIN');
  const before = (await c.query(`SELECT slug, status, license FROM sources WHERE slug = ANY($1) ORDER BY slug`, [slugs])).rows;
  console.log('BEFORE:'); before.forEach((r) => console.log(`  ${r.slug.padEnd(12)} ${r.status}  (${r.license})`));

  const upd = await c.query(`UPDATE sources SET status='published' WHERE slug = ANY($1) AND status='staged' RETURNING slug`, [slugs]);
  console.log(`\nflipped staged->published: ${upd.rowCount} row(s) — ${upd.rows.map((r) => r.slug).join(', ')}`);

  // INLINE GATE B (fail-closed): no published source may have a bad license...
  const badLic = (await c.query(
    `SELECT id::text, slug, license FROM sources WHERE status='published' AND (license IS NULL OR NOT (license = ANY($1)))`, [ALLOWED])).rows;
  // ...nor a forbidden provenance domain.
  const badProv = (await c.query(
    `SELECT id::text, slug, provenance->>'url' url FROM sources WHERE status='published' AND provenance->>'url' IS NOT NULL`)).rows
    .filter((r) => FORBIDDEN.some((d) => { try { const h = new URL(r.url).hostname; return h === d || h.endsWith('.' + d); } catch { return false; } }));

  if (badLic.length || badProv.length) {
    console.error('\nGATE FAILED — rolling back:');
    badLic.forEach((r) => console.error(`  bad license: ${r.slug} "${r.license}"`));
    badProv.forEach((r) => console.error(`  forbidden provenance: ${r.slug} ${r.url}`));
    await c.query('ROLLBACK');
    process.exit(1);
  }

  await c.query('COMMIT');
  const after = (await c.query(`SELECT slug, status FROM sources WHERE slug = ANY($1) ORDER BY slug`, [slugs])).rows;
  console.log('\nAFTER (committed):'); after.forEach((r) => console.log(`  ${r.slug.padEnd(12)} ${r.status}`));
  console.log('\nOK: gate held, published.');
} catch (e) {
  await c.query('ROLLBACK').catch(() => {});
  throw e;
} finally { await c.end(); }
