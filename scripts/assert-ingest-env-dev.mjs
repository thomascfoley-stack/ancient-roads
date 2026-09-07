// Gate: refuse audit/ingest unless shell + root ingest env are on the allow-list.
//
// Two independent hazards, one script:
//   1. SHELL — DATABASE_URL (etc.) in the environment overrides web/.env.local and poisons
//      `npm run qa` / vitest. Refuse loudly if any shell DB var is not localhost, a dev
//      endpoint, or an endpoint declared by exact id (AUDIT_ALLOWED_ENDPOINT / SEED_TEST_ENDPOINT).
//   2. FILE — root `.env.local` (the ingest env) must point at an allowed owner with a live
//      control. Skipped visibly when the file is absent (CI has no local ingest env).
//
// Allow-list matches web/test/helpers/env.ts seedOwnerUrl() — never a substring.
// Prints host/role/counts only — never credentials.
import pg from 'pg';
import fs from 'node:fs';
import { endpointId, hostOf, isAuditAllowedHost } from './lib/target-guard.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const ENV_FILE = `${ROOT}/.env.local`;

const SHELL_VARS = ['DATABASE_URL', 'APP_DATABASE_URL', 'DATABASE_URL_UNPOOLED'];

function refuseShell(name, url) {
  const id = endpointId(hostOf(url));
  console.error(
    `FAIL: shell ${name} points at ${id ?? hostOf(url)} — not on the audit allow-list ` +
    '(dev endpoints, localhost, or AUDIT_ALLOWED_ENDPOINT / SEED_TEST_ENDPOINT by exact id). ' +
    'Unset it before npm run audit — qa/vitest inherit shell env.',
  );
  process.exit(1);
}

// ── 1. Shell env: only allow-listed targets ──────────────────────────────────
for (const name of SHELL_VARS) {
  const v = process.env[name];
  if (!v) continue;
  if (!isAuditAllowedHost(v)) refuseShell(name, v);
}
console.log('shell:  DATABASE_URL / APP_DATABASE_URL / DATABASE_URL_UNPOOLED on allow-list (or unset)');

// ── 1b. Shell pairing: DATABASE_URL without APP_DATABASE_URL poisons qa ───────
// web/test/helpers/env.ts promotes web/.env.local's APP_DATABASE_URL into the runtime ONLY
// when BOTH shell vars are unset. DATABASE_URL set alone => every qa runtime connection is
// that role — and if it is the owner (BYPASSRLS) the RLS-tenancy suites fail correctly,
// BY DESIGN (their own red-proof). That red has already been misread as "contention" once
// (deep-audit 2026-09-07, H-6). Refuse here with the remedy, not downstream with a
// misleading signature.
if (process.env.DATABASE_URL && !process.env.APP_DATABASE_URL) {
  console.error(
    'FAIL: DATABASE_URL is set but APP_DATABASE_URL is not. qa/vitest inherit the shell, ' +
    'so the runtime role becomes the DATABASE_URL role (owner = BYPASSRLS) and the ' +
    'RLS-tenancy suites will fail by design. Remedy: also export APP_DATABASE_URL from ' +
    'web/.env.local (export APP_DATABASE_URL="$(grep \'^APP_DATABASE_URL\' web/.env.local | ' +
    'cut -d= -f2-)"), or unset DATABASE_URL before npm run audit.',
  );
  process.exit(1);
}

// ── 2. Root ingest env file (local only) ─────────────────────────────────────
if (!fs.existsSync(ENV_FILE)) {
  console.log('⚠ SKIPPED (visibly): no root .env.local — ingest-env probe not run (expected in CI).');
  console.log('OK: shell on allow-list; ingest file absent.');
  process.exit(0);
}

const envText = fs.readFileSync(ENV_FILE, 'utf8');
const val = (k) => envText.match(new RegExp(`^${k}="?([^"\n]*)"?$`, 'm'))?.[1];

const url = val('DATABASE_URL_UNPOOLED') ?? val('DATABASE_URL');
if (!url) { console.error('FAIL: no DATABASE_URL in root .env.local'); process.exit(1); }
if (!isAuditAllowedHost(url)) {
  console.error(
    `FAIL: root .env.local points at ${endpointId(hostOf(url)) ?? hostOf(url)} — not on the audit allow-list.`,
  );
  process.exit(1);
}
const host = hostOf(url);
console.log(`host:   ${host}`);
console.log(`branch: ${val('NEON_BRANCH')}`);

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
  console.log('OK: root .env.local -> allowed owner, probe fires. Safe for population.');
} finally { await c.end(); }
