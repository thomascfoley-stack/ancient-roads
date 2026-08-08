#!/usr/bin/env node
/**
 * POST-FLIP RECONCILIATION (cutover order P0.5) — the standing instrument
 * AFTER the first intentional serve flip.
 *
 *   DATABASE_URL=<url> node scripts/served-reconcile.mjs
 *
 * Asserts the publish-means-serve contract end to end:
 *   1. every published work with work-keyed rows has ALL rows served
 *   2. every staged/quarantined/ingesting work has ZERO served rows
 *   3. the work-less legacy cohort is reported as its own line, never folded in
 *
 * READ-ONLY. Refuses production without RECONCILE_ALLOW_PROD=1 (bylaw 7:
 * owner's go, per occasion). Exit 0 = agreement; exit 1 = divergence found.
 */
import { Client } from 'pg';
import { reconcile } from './lib/served-reconcile-core.mjs';
import { forbiddenProvenanceDomain } from '../src/ingest/forbidden-provenance.mjs';

const url = process.env.DATABASE_URL;
function die(msg, code = 1) { console.error(`\x1b[31m${msg}\x1b[0m`); process.exit(code); }
if (!url) die('set DATABASE_URL', 2);

// Host off the CONSTRUCTED client (pg's own parse), never a regex — the
// `?host=` override walked a regex guard once before (verify-served-backfill).
const probe = new Client({ connectionString: url });
const host = probe.connectionParameters.host ?? '';
const isProd = !/ep-tiny-hat|ep-tiny-bonus|ep-snowy-bird|localhost|127\.0\.0\.1/.test(host);
if (isProd && process.env.RECONCILE_ALLOW_PROD !== '1') {
  die(`STOP: target host '${host}' is not a known dev/ci endpoint. ` +
      'Re-run with RECONCILE_ALLOW_PROD=1 under the owner\'s go (bylaw 7).', 2);
}

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const works = (await client.query(
    `SELECT metadata->>'work' AS work, count(*)::int AS rows,
            count(*) FILTER (WHERE served)::int AS served
       FROM embeddings
      WHERE user_id IS NULL AND metadata->>'work' IS NOT NULL
      GROUP BY 1`,
  )).rows;
  const sources = (await client.query(`SELECT slug, status FROM sources`)).rows;
  // Provenance split of UNSERVED rows on works that have any — clean-provenance
  // unserved rows on a published work are the violation; forbidden-provenance
  // unserved rows are the E3-deferred cleanup and must STAY unserved.
  const unservedByDomain = (await client.query(
    `SELECT metadata->>'work' AS work, metadata->>'sourceUrl' AS url, count(*)::int AS n
       FROM embeddings
      WHERE user_id IS NULL AND metadata->>'work' IS NOT NULL AND NOT served
      GROUP BY 1, 2`,
  )).rows;
  const splitBy = new Map();
  for (const r of unservedByDomain) {
    const s = splitBy.get(r.work) ?? { clean: 0, forbidden: 0 };
    if (forbiddenProvenanceDomain(r.url)) s.forbidden += r.n; else s.clean += r.n;
    splitBy.set(r.work, s);
  }
  for (const w of works) {
    const s = splitBy.get(w.work);
    if (s) { w.unservedClean = s.clean; w.unservedForbidden = s.forbidden; }
  }
  const workless = (await client.query(
    `SELECT count(*)::int AS rows, count(*) FILTER (WHERE served)::int AS served
       FROM embeddings
      WHERE user_id IS NULL AND metadata->>'work' IS NULL`,
  )).rows[0];

  const { violations, e3Deferred, inertOrphans, ok, publishedWorkless } = reconcile(works, sources);

  console.log(`served-reconcile — target ${host} (read-only)`);
  console.log(`  works with keyed rows: ${works.length}; sources rows: ${sources.length}`);
  console.log(`  published & fully served (of what may legally serve): ${ok.publishedServed}`);
  console.log(`  unpublished & fully unserved:  ${ok.unpublishedUnserved}`);
  console.log(`  published, NO keyed rows (legacy author cohort / sections-model, unreachable by slug): ${publishedWorkless.length}` +
    (publishedWorkless.length ? ` — ${publishedWorkless.join(', ')}` : ''));
  console.log(`  E3-deferred: published works with FORBIDDEN-provenance rows correctly unserved: ${e3Deferred.length}` +
    (e3Deferred.length ? ` — ${e3Deferred.map((d) => `${d.work} (${d.rows})`).join(', ')}` : ''));
  console.log(`  inert orphans (keyed rows, no sources row, 0 served — E3 cleanup inventory): ${inertOrphans.length}` +
    (inertOrphans.length ? ` — ${inertOrphans.map((o) => `${o.work} (${o.rows})`).join(', ')}` : ''));
  console.log(`  work-less legacy rows: ${workless.rows} (${workless.served} served) — reported, not asserted`);

  if (violations.length > 0) {
    console.error(`\n\x1b[31mDIVERGENCE — ${violations.length} violation(s):\x1b[0m`);
    for (const v of violations) console.error(`  ${v.kind}: ${v.work} — ${v.detail}`);
    process.exit(1);
  }
  console.log('\n\x1b[32mOK — every published work serves all of its clean-provenance rows; nothing unpublished serves.\x1b[0m');
} finally {
  await client.end();
}
