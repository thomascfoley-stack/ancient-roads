#!/usr/bin/env node
// E4 redproof: seed one biblehub row into a clean john-gill pool → slice REFUSES → revert → green.
// Requires CUTOVER_DATABASE_URL + CUTOVER_EXPECT_HOST (throwaway fork only).
import pg from 'pg';
import { execFileSync } from 'node:child_process';
import { assertCutoverTarget } from './lib/target-guard.mjs';

const url = process.env.CUTOVER_DATABASE_URL;
if (!url) throw new Error('CUTOVER_DATABASE_URL is unset');
const declared = process.env.CUTOVER_EXPECT_HOST;
if (!declared) throw new Error('CUTOVER_EXPECT_HOST is unset');
const host = assertCutoverTarget(url, {
  declared,
  what: 'E4 redproof target',
  allow: process.env.CUTOVER_ALLOW === '1',
});
console.log(`E4 redproof target: ${host} (credentials redacted)\n`);

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows } = await c.query(`
  SELECT id, metadata->>'sourceUrl' AS url FROM embeddings
  WHERE user_id IS NULL AND metadata->>'author' = 'John Gill'
    AND (metadata->>'sourceUrl' IS NULL OR metadata->>'sourceUrl' NOT ILIKE '%biblehub%')
  LIMIT 1`);
if (!rows[0]) throw new Error('no clean Gill row found');
const { id, url: origUrl } = rows[0];
console.log(`donor id=${id} original sourceUrl=${origUrl ?? 'NULL'}`);

console.log('\n--- SEED biblehub sourceUrl on one Gill row ---');
await c.query(
  `UPDATE embeddings SET metadata = jsonb_set(metadata, '{sourceUrl}', '"https://biblehub.com/commentaries/gill/redproof"') WHERE id = $1`,
  [id],
);
console.log('seed: ok');

const env = {
  ...process.env,
  DATABASE_URL: url,
  DATABASE_URL_UNPOOLED: url,
  MIGRATE_ALLOW_PROD: '1',
  CUTOVER_ALLOW: '1',
};

function runSlice(label) {
  console.log(`\n--- ${label} ---`);
  try {
    execFileSync('npx', ['tsx', 'src/ingest/migrate-sections-slice.ts', '--source=john-gill'], {
      stdio: 'inherit',
      env,
    });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}

const redRc = runSlice('RUN john-gill slice (expect REFUSE)');
console.log(`[slice exit code: ${redRc}]`);
if (redRc === 0) {
  console.error('✗ FAILED: slice stayed GREEN on seeded biblehub row');
  process.exit(1);
}
console.log(`✓ slice REFUSED as expected (exit ${redRc})`);

console.log('\n--- REVERT seed ---');
if (origUrl == null) {
  await c.query(`UPDATE embeddings SET metadata = metadata - 'sourceUrl' WHERE id = $1`, [id]);
} else {
  await c.query(
    `UPDATE embeddings SET metadata = jsonb_set(metadata, '{sourceUrl}', to_jsonb($2::text)) WHERE id = $1`,
    [id, origUrl],
  );
}
console.log('revert: ok');
await c.end();

const greenRc = runSlice('RE-RUN john-gill slice (expect GREEN)');
if (greenRc !== 0) {
  console.error(`✗ FAILED: slice did not recover after revert (exit ${greenRc})`);
  process.exit(1);
}
console.log('\nE4 RED-PROOF PASSED');
