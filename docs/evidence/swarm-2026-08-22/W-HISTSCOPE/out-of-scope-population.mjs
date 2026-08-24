/**
 * W-HISTSCOPE — enumerate the OUT-OF-SCOPE served anchored-entity population on dev.
 *
 * READ ONLY. The MASTER.md Lane F4 row opened this signal: dev carries served anchored
 * entities outside the shipped vocab() scope (served AND status='published' AND
 * source_type='historian'). The history-scope-db test fix (4baefe5) must not bury it —
 * this census is the finding for the historians lane.
 *
 * Target guard: dev only (ep-tiny-hat). Refuses anything else. Prints no secrets.
 *
 *   node docs/evidence/swarm-2026-08-22/W-HISTSCOPE/out-of-scope-population.mjs
 */
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

// web/.env.local carries APP_DATABASE_URL; the owner DATABASE_URL lives in the ROOT .env.local.
const loadEnv = (rel) => Object.fromEntries(
  readFileSync(new URL(rel, import.meta.url), 'utf8')
    .split('\n').filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const env = { ...loadEnv('../../../../.env.local'), ...loadEnv('../../../../web/.env.local') };
const URL_ = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
if (!URL_) { console.error('No DATABASE_URL in web/.env.local'); process.exit(1); }
const host = new URL(URL_.replace(/^postgres(ql)?:\/\//, 'https://')).host;
if (!host.includes('ep-tiny-hat') || host.includes('odd-fog')) {
  console.error('Refusing: target host is not dev (ep-tiny-hat).');
  process.exit(1);
}
console.log(`target host: ${host} (dev, ep-tiny-hat)`);

// The shipped scope, restated from history-search-db.ts SCOPE (the F4 row's own terms).
const IN_SCOPE = `
  SELECT DISTINCT a.entity_label
    FROM section_history_anchors a
    JOIN history_embeddings he ON he.section_id = a.section_id
    JOIN sections s ON s.id = a.section_id
    JOIN sources src ON src.id = s.source_id
   WHERE he.served AND src.status = 'published' AND src.source_type = 'historian'`;

const client = new Client({ connectionString: URL_ });
await client.connect();
try {
  const served = await client.query(
    `SELECT COUNT(DISTINCT a.entity_label) AS n
       FROM section_history_anchors a
       JOIN history_embeddings he ON he.section_id = a.section_id
      WHERE he.served`);
  const scoped = await client.query(`SELECT COUNT(*) AS n FROM (${IN_SCOPE}) t`);
  console.log(`served anchored distinct labels: ${served.rows[0].n}`);
  console.log(`in-scope (served + published + historian): ${scoped.rows[0].n}`);

  const out = await client.query(
    `SELECT a.entity_label AS label,
            array_agg(DISTINCT src.slug || ' [' || src.source_type || '/' || src.status || ']'
                      ORDER BY src.slug || ' [' || src.source_type || '/' || src.status || ']') AS served_anchors_in
       FROM section_history_anchors a
       JOIN history_embeddings he ON he.section_id = a.section_id
       JOIN sections s ON s.id = a.section_id
       JOIN sources src ON src.id = s.source_id
      WHERE he.served
        AND a.entity_label NOT IN (${IN_SCOPE})
      GROUP BY a.entity_label
      ORDER BY a.entity_label`);
  console.log(`out-of-scope served labels: ${out.rows.length}`);
  for (const r of out.rows) {
    console.log(`- ${r.label} :: ${r.served_anchors_in.join(', ')}`);
  }
} finally {
  await client.end();
}
