// Quarantine hort-james1909 — unserve 344 embedding rows and stage the source.
//
// WHY THIS WORK AND NOT ANOTHER: `source_type: "poetry"` in the manifest put a Greek critical
// commentary on James inside the /ask hymns-and-sacred-poetry lane, served. Re-registry as
// commentary was REJECTED on measurement, not taste: 1 of 344 rows carries a verseId decoding to
// a real book and NONE are anchored in James, so it would land unanchored in the exegetical lane
// and fall through to the same unconstrained global top-3 — the defect relocated into the core
// pane. Owner-ruled quarantine 2026-08-19.
//
// SHAPE, deliberately the same as the publish flips: snapshot BEFORE the write, inside the same
// transaction; print the exact inverse; refuse anything that is not the declared endpoint; and
// REFUSE TO RUN AT ALL while another writer is on `embeddings`, because the night this was written
// a second agent was mid publish-flip against production and two writers on that table is how the
// livelock in the 08-18 CI diagnosis happened.
import { readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { isAuditAllowedHost } from './lib/target-guard.mjs';

const SLUG = 'hort-james1909';
const APPLY = process.argv.includes('--execute');
const url = (process.env.DATABASE_URL ?? '').replace(/^"|"$/g, '');
if (!url) { console.error('DATABASE_URL is required'); process.exit(1); }

// Production is the TARGET here, so the guard is inverted from the usual one: this refuses
// anything that is NOT the declared prod endpoint, rather than refusing prod.
const endpoint = process.env.QUARANTINE_TARGET_ENDPOINT;
if (!endpoint) { console.error('STOP: declare QUARANTINE_TARGET_ENDPOINT=<exact endpoint id>'); process.exit(2); }
if (!new URL(url).hostname.split('.')[0].includes(endpoint)) {
  console.error(`STOP: connection does not resolve to the declared endpoint ${endpoint}.`);
  process.exit(2);
}
void isAuditAllowedHost; // imported to keep the one guard module the single home for host rules

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows: busy } = await client.query(
    `SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()
        AND state = 'active' AND query ILIKE '%UPDATE embeddings%'`,
  );
  if (busy[0].n > 0) {
    console.error(`STOP: ${busy[0].n} other session(s) are writing to embeddings right now.`);
    console.error('Two writers on this table is the livelock documented on 2026-08-18. Wait, then re-run.');
    process.exit(3);
  }

  await client.query('BEGIN');
  const { rows: before } = await client.query(
    `SELECT id, served FROM embeddings WHERE metadata->>'work' = $1 ORDER BY id`, [SLUG],
  );
  const { rows: src } = await client.query(
    `SELECT id, slug, status, source_type FROM sources WHERE slug = $1`, [SLUG],
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snap = `docs/evidence/content-quarantine/hort-james1909-pre-${stamp}.json`;
  writeFileSync(snap, JSON.stringify({ slug: SLUG, sources: src, embeddings: before }, null, 2));
  console.log(`  snapshot written BEFORE any write: ${snap} (${before.length} embedding rows, ${src.length} source row)`);
  console.log(`  currently served: ${before.filter((r) => r.served).length}`);

  const { rowCount: unserved } = await client.query(
    `UPDATE embeddings SET served = false WHERE metadata->>'work' = $1 AND served`, [SLUG],
  );
  const { rowCount: staged } = await client.query(
    `UPDATE sources SET status = 'staged' WHERE slug = $1 AND status = 'published'`, [SLUG],
  );
  const { rows: after } = await client.query(
    `SELECT count(*) FILTER (WHERE served)::int AS served FROM embeddings WHERE metadata->>'work' = $1`, [SLUG],
  );
  if (after[0].served !== 0) throw new Error(`REFUSING TO COMMIT: ${after[0].served} rows still served`);

  console.log(`  unserved ${unserved} embedding row(s); moved ${staged} source row published -> staged`);
  console.log('  EXACT INVERSE (from the snapshot above):');
  console.log(`    UPDATE embeddings SET served = true WHERE id = ANY(<ids where served was true>);`);
  console.log(`    UPDATE sources SET status = 'published' WHERE slug = '${SLUG}';`);

  if (!APPLY) { await client.query('ROLLBACK'); console.log('\n  DRY RUN — rolled back. Re-run with --execute to commit.'); }
  else { await client.query('COMMIT'); console.log('\n  COMMITTED.'); }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`  ✗ ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
