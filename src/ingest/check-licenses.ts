// Gate B — License (legal). FAIL CLOSED. The runnable gate.
//
//   npx tsx src/ingest/check-licenses.ts               (or: pnpm check:licenses)
//
// Validates the license manifest (`ingest/sources.config.json`) — the reviewed
// per-work license map — asserting every source is Public Domain / CC BY /
// CC BY-SA with recorded provenance. Any violation exits non-zero.
//
// CI-safe: needs no database. When a `sources` table exists AND DATABASE_URL is
// set, it additionally asserts zero `published` rows with a disallowed/null
// license (defence in depth); otherwise it validates the manifest only. When no
// manifest exists yet, nothing has been published, so it passes vacuously.

import { readFileSync, existsSync } from 'fs';
import { ALLOWED_LICENSES, validateManifest, type LicenseViolation } from './license-manifest.js';

const MANIFEST_PATH = 'ingest/sources.config.json';

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

// Defence-in-depth DB check. Only runs when DATABASE_URL is set AND a `sources`
// table exists — so it is inert until the sources/sections model lands. `pg` is
// imported lazily so this stays CI-safe (no DB import when there's no DB).
async function checkPublishedSources(dbUrl: string): Promise<LicenseViolation[]> {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: dbUrl.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows: exists } = await client.query<{ ok: boolean }>(
      `SELECT to_regclass('public.sources') IS NOT NULL AS ok`,
    );
    if (!exists[0]?.ok) return [];

    const allowed = ALLOWED_LICENSES as readonly string[];
    const { rows } = await client.query<{ id: string; license: string | null }>(
      `SELECT id::text AS id, license FROM sources WHERE status = 'published'`,
    );
    const out: LicenseViolation[] = [];
    for (const r of rows) {
      if (r.license === null || r.license === '') {
        out.push({ id: r.id, reason: 'published source has null/empty license' });
      } else if (!allowed.includes(r.license)) {
        out.push({ id: r.id, reason: `published source license "${r.license}" not in allowed set` });
      }
    }
    return out;
  } finally {
    await client.end();
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('GATE B — LICENSE (fail closed)');
  console.log('='.repeat(70));

  const violations: LicenseViolation[] = [];

  if (existsSync(MANIFEST_PATH)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    } catch (e) {
      console.error(`\u2717 GATE B FAILED: ${MANIFEST_PATH} is not valid JSON: ${(e as Error).message}`);
      process.exitCode = 1;
      return;
    }
    const manifestViolations = validateManifest(parsed);
    const count = Array.isArray(parsed) ? parsed.length : 0;
    console.log(`Manifest: ${MANIFEST_PATH} (${count} source entries)`);
    violations.push(...manifestViolations);
  } else {
    console.log(`Manifest: ${MANIFEST_PATH} not present yet — no sources declared to gate.`);
  }

  const dbUrl = localEnv('DATABASE_URL') ?? localEnv('DATABASE_URL_UNPOOLED');
  if (dbUrl) {
    try {
      const dbViolations = await checkPublishedSources(dbUrl);
      console.log(`Published sources (DB): checked (${dbViolations.length} violation(s)).`);
      violations.push(...dbViolations);
    } catch (e) {
      console.error(`\u2717 GATE B FAILED: could not verify published sources: ${(e as Error).message}`);
      process.exitCode = 1;
      return;
    }
  } else {
    console.log('Published sources (DB): skipped (no DATABASE_URL).');
  }

  if (violations.length > 0) {
    console.log('');
    console.error(`\u2717 GATE B FAILED: ${violations.length} license/provenance violation(s):`);
    for (const v of violations) console.error(`  - ${v.id}: ${v.reason}`);
    console.error('  Fail closed: any source without a confirmed allowed license must be quarantined, never published.');
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('\u2713 GATE B PASSED: no license/provenance violations.');
}

main().catch((e) => { console.error(e); process.exit(1); });
