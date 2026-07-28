#!/usr/bin/env node
// E2 — register-label flat embeddings: set metadata.work from sources.config.json
// backfill.match_author. Idempotent (only rows with NULL work). Dev or cutover target.
//
//   node scripts/register-label-embeddings.mjs           dry-run
//   node scripts/register-label-embeddings.mjs --apply
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');

function urlFromEnv() {
  if (process.env.CUTOVER_DATABASE_URL) return process.env.CUTOVER_DATABASE_URL;
  if (process.env.DATABASE_URL_UNPOOLED) return process.env.DATABASE_URL_UNPOOLED;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const t = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const m = t.match(/^DATABASE_URL_UNPOOLED=(.*)$/m) ?? t.match(/^DATABASE_URL=(.*)$/m);
  return m?.[1]?.trim().replace(/^["']|["']$/g, '');
}

function assertTarget(url) {
  const host = new URL(url).host;
  const cutover = process.env.CUTOVER_ALLOW === '1' || process.env.B2_ALLOW_PROD === '1' || process.env.MIGRATE_ALLOW_PROD === '1';
  if (host.includes('ep-tiny-hat')) return;
  if (cutover && (host.includes('ep-wispy-violet') || host.includes('ep-odd-fog'))) return;
  throw new Error(`STOP: host ${host} is not dev and cutover override not set`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'ingest/sources.config.json'), 'utf8'));
const entries = manifest.filter((e) => e.backfill?.match_author);
if (entries.length === 0) throw new Error('no backfill.match_author entries in sources.config.json');

const url = urlFromEnv();
if (!url) throw new Error('no DATABASE_URL');
assertTarget(url);
console.log(`host: ${new URL(url).host} (credentials redacted)`);
console.log(`entries with match_author: ${entries.length}`);

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

try {
  const before = (await c.query(
    `SELECT count(*) FILTER (WHERE metadata->>'work' IS NULL)::int AS unlabeled,
            count(*)::int AS total FROM embeddings WHERE user_id IS NULL`,
  )).rows[0];
  console.log(`before: ${before.unlabeled}/${before.total} unlabeled`);

  let totalLabeled = 0;
  for (const e of entries) {
    const author = e.backfill.match_author;
    const slug = e.slug ?? e.id;
    if (!apply) {
      const n = (await c.query(
        `SELECT count(*)::int n FROM embeddings WHERE user_id IS NULL AND metadata->>'author' = $1 AND metadata->>'work' IS NULL`,
        [author],
      )).rows[0].n;
      if (n > 0) console.log(`  would label ${n} rows: "${author}" -> ${slug}`);
      totalLabeled += n;
      continue;
    }
    const r = await c.query(
      `UPDATE embeddings SET metadata = metadata || jsonb_build_object('work', $2::text)
       WHERE user_id IS NULL AND metadata->>'author' = $1 AND metadata->>'work' IS NULL`,
      [author, slug],
    );
    if (r.rowCount > 0) console.log(`  labeled ${r.rowCount} rows: "${author}" -> ${slug}`);
    totalLabeled += r.rowCount ?? 0;
  }

  const after = (await c.query(
    `SELECT count(*) FILTER (WHERE metadata->>'work' IS NULL)::int AS unlabeled,
            count(*)::int AS total FROM embeddings WHERE user_id IS NULL`,
  )).rows[0];
  console.log(`after: ${after.unlabeled}/${after.total} unlabeled (${apply ? totalLabeled : totalLabeled} rows ${apply ? 'updated' : 'would update'})`);

  if (!apply) {
    console.log('\nDRY RUN — pass --apply to write');
    process.exit(0);
  }
  console.log('\nOK: register-label complete');
} finally {
  await c.end();
}
