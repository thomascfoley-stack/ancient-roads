import fs from 'node:fs'; import pg from 'pg';
// FIXED: the previous watcher reported "cancelled" on (UPDATE not active AND nothing published),
// which is exactly true during the COMMIT window — so it called father a failure at the moment it
// succeeded. There is now ONE exit condition: the committed state is visible. Absence of evidence
// is not evidence of absence.
const list = JSON.parse(fs.readFileSync('docs/evidence/p4n-flip-2026-08-19/flip-commentary.json','utf8')).slugs;
const url = fs.readFileSync(process.env.HOME+'/.neon_prod_url','utf8').trim();
const t0 = Date.now();
for (let i = 0; i < 140; i++) {
  const c = new pg.Client({connectionString: url, ssl:{rejectUnauthorized:false}});
  try {
    await c.connect(); await c.query('BEGIN TRANSACTION READ ONLY');
    const r = await c.query(`SELECT
      (SELECT count(*)::int FROM sources WHERE slug=ANY($1) AND status='published') pub,
      (SELECT count(*) FILTER (WHERE served)::int FROM embeddings WHERE user_id IS NULL AND metadata->>'work'=ANY($1)) srv,
      (SELECT count(*) FILTER (WHERE served)::int FROM embeddings WHERE user_id IS NULL) tot`, [list]);
    const { pub, srv, tot } = r.rows[0];
    await c.query('ROLLBACK'); await c.end();
    if (pub === list.length && srv > 0) {
      console.log(`COMMITTED after ~${((Date.now()-t0)/60000).toFixed(0)} min of watching`);
      console.log(`  published    : ${pub}/${list.length}`);
      console.log(`  served rows  : ${srv.toLocaleString()} of 101,662`);
      console.log(`  corpus served: ${tot.toLocaleString()}  (was 506,934; delta +${(tot-506934).toLocaleString()})`);
      process.exit(0);
    }
  } catch { try { await c.end(); } catch {} }
  await new Promise(r => setTimeout(r, 120000));
}
console.log('still not committed after ~4.6 hours of watching — check pg_stat_activity');
