// Asserts the ROOT .env.local (the ingest env) points at the DEV branch with an
// owner role, via a read-only probe with a positive control. Prints host/role/counts
// only — never credentials. Exit 0 = safe to run population against this env.
import pg from 'pg';
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const envText = fs.readFileSync(`${ROOT}/.env.local`, 'utf8');
const val = (k) => envText.match(new RegExp(`^${k}="?([^"\n]*)"?$`, 'm'))?.[1];

const url = val('DATABASE_URL_UNPOOLED') ?? val('DATABASE_URL');
if (!url) { console.error('FAIL: no DATABASE_URL in root .env.local'); process.exit(1); }
const host = new URL(url).host;
console.log(`host:   ${host}`);
console.log(`branch: ${val('NEON_BRANCH')}`);

if (!host.includes('ep-tiny-hat')) {
  console.error(`FAIL: ingest env points at ${host} — NOT the dev branch. Refusing.`);
  process.exit(1);
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query('BEGIN; SET TRANSACTION READ ONLY');
  const role = (await c.query('SELECT current_user u')).rows[0].u;
  console.log(`role:   ${role}`);
  if (role !== 'neondb_owner') { console.error(`FAIL: role ${role} != neondb_owner (ingest needs owner)`); process.exit(1); }
  // Positive control: dev must hold Gill rows; 0 => the probe shape is wrong, not "clean".
  const gill = (await c.query(`SELECT count(*)::int n FROM embeddings WHERE user_id IS NULL AND metadata->>'author' = 'John Gill'`)).rows[0].n;
  console.log(`positive control (Gill on dev): ${gill}`);
  if (gill === 0) { console.error('FAIL: positive control returned 0'); process.exit(1); }
  await c.query('ROLLBACK');
  console.log('OK: root .env.local -> dev owner, probe fires. Safe for population.');
} finally { await c.end(); }
