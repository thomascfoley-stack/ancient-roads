#!/usr/bin/env node
// Backfill history_embeddings from section_embeddings for history-lane works (historians +
// genre-history by sources.provenance.genre). NO embedding calls —
// ingest-historian has always written section vectors; this moves them into the history lane's
// own table (HISTORY_RETRIEVAL_DESIGN §2b step 1). Idempotent: ON CONFLICT DO NOTHING.
//
//   DATABASE_URL=<owner url> node scripts/backfill-history-embeddings.mjs [--apply] [--serve]
//
// --apply  write (default is a dry-run census)
// --serve  ALSO set served=true on the backfilled rows. REFUSED on production: prod serving goes
//          through serve-batched.mjs's owner gate, every time. This flag exists for dev bring-up
//          only, and the guard is the endpoint id, not trust.
import pg from 'pg';

const apply = process.argv.includes('--apply');
const serve = process.argv.includes('--serve');
const url = process.env.DATABASE_URL;
if (!url) { console.error('STOP: DATABASE_URL is unset.'); process.exit(2); }
const host = new URL(url.replace(/^postgres(ql)?:/, 'http:')).hostname;
console.log(`backfill-history-embeddings — target ${host.split('.')[0]} ${apply ? '(APPLY)' : '(dry-run)'}${serve ? ' +serve' : ''}`);
if (serve && host.startsWith('ep-odd-fog')) {
  console.error('STOP: --serve is refused on production. Prod serving is serve-batched.mjs, owner gate, every time.');
  process.exit(2);
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  // Scope = the history lane's write-gated membership: historians + genre-history works (the
  // per-work datum sources.provenance.genre — the same predicate history-search-db's SCOPE
  // reads). Widened 2026-08-23 so the genre-history Fathers (npnf201/202/203) backfill too.
  const gap = (await c.query(`
    SELECT count(*)::int n FROM section_embeddings se
      JOIN sections s ON s.id = se.section_id
      JOIN sources src ON src.id = s.source_id
     WHERE (src.source_type = 'historian' OR src.provenance->>'genre' = 'history')
       AND NOT EXISTS (SELECT 1 FROM history_embeddings h WHERE h.section_id = se.section_id)`)).rows[0].n;
  console.log(`  section vectors not yet in history_embeddings: ${gap.toLocaleString()}`);
  if (!apply) { console.log('  dry-run — nothing written. Re-run with --apply.'); process.exit(0); }

  const ins = await c.query(`
    INSERT INTO history_embeddings (section_id, embedding, model_slug, served)
    SELECT se.section_id, se.embedding, se.model_slug, false
      FROM section_embeddings se
      JOIN sections s ON s.id = se.section_id
      JOIN sources src ON src.id = s.source_id
     WHERE (src.source_type = 'historian' OR src.provenance->>'genre' = 'history')
    ON CONFLICT (section_id) DO NOTHING`);
  console.log(`  inserted ${ins.rowCount.toLocaleString()} row(s)`);

  if (serve) {
    const srv = await c.query(`UPDATE history_embeddings SET served = true WHERE served IS NOT TRUE`);
    console.log(`  served ${srv.rowCount.toLocaleString()} row(s)  (dev bring-up)`);
  }
  const v = (await c.query(`SELECT count(*)::int n, count(*) FILTER (WHERE served)::int s FROM history_embeddings`)).rows[0];
  console.log(`  history_embeddings now: ${v.n.toLocaleString()} rows, ${v.s.toLocaleString()} served`);
} finally { await c.end(); }
