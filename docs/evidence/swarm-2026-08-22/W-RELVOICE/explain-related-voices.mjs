/**
 * W-RELVOICE instrument: EXPLAIN (FORMAT JSON) the related-voices sweep query shape
 * against DEV ONLY, before (RED) and after (GREEN) the source_type conjunct fix.
 *
 * Guard rails: reads web/.env.local, asserts the dev endpoint (ep-tiny-hat), refuses
 * anything prod. Prints no secrets. Read-only: EXPLAIN never executes the query.
 *
 *   node docs/evidence/swarm-2026-08-22/W-RELVOICE/explain-related-voices.mjs <out-prefix>
 *
 * Writes <out-prefix>-{general,hymn,poetry}.json beside this script.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Client } from 'pg';

// The dev DATABASE_URL lives in the ROOT .env.local; web/.env.local carries APP_DATABASE_URL.
// Read both, prefer the owner's unpooled URL, never print a value.
const readEnv = (rel) => Object.fromEntries(
  readFileSync(new URL(rel, import.meta.url), 'utf8')
    .split('\n').filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const rootEnv = readEnv('../../../../.env.local');
const webEnv = readEnv('../../../../web/.env.local');
const URL_ = rootEnv.DATABASE_URL_UNPOOLED || rootEnv.DATABASE_URL || webEnv.APP_DATABASE_URL;
if (!URL_) { console.error('no dev DATABASE_URL found in .env.local / web/.env.local'); process.exit(1); }
const HOST = URL_.match(/@([^/:?]+)/)?.[1] ?? '';
if (HOST.includes('odd-fog') || !HOST.includes('ep-tiny-hat')) {
  console.error(`ABORT: host is not the dev endpoint (got ${HOST.split('.')[0]}…, redacted)`);
  process.exit(1);
}
console.log(`host: ${HOST.split('.')[0]}… (dev, credentials redacted)`);

const prefix = process.argv[2];
if (!prefix) { console.error('usage: explain-related-voices.mjs <out-prefix>'); process.exit(1); }

// ── The query shape, copied from web/src/lib/user-corpus/related-voices.ts `sweep()`. ──
// When the module changes, change this to match — the instrument measures the SHIPPED shape.
// predicate = LEGAL_CORPUS_FILTER = '(served)' (web/src/lib/teacher/routing.ts). The conjuncts
// below ARE the routing.ts constants the module imports (EXEGETICAL/SERMON/THEOLOGY/HISTORIAN/
// SONG_VERSE_TYPE_SQL), inlined here because this instrument runs under plain node.
const SWEEP = 300;
const CONJUNCTS = {
  exegetical: `AND source_type IN ('commentary','father')`,
  sermon: `AND source_type = 'sermon'`,
  theology: `AND source_type IN ('theology','confession')`,
  historian: `AND source_type = 'historian'`,
  hymn: `AND e.metadata->>'register' = 'hymn' AND source_type IN ('hymn','poetry')`,
  poetry: `AND e.metadata->>'register' = 'poetry' AND source_type IN ('hymn','poetry')`,
};
const sweep = (extra) => `
  WITH near AS (
    SELECT e.metadata->>'author'    AS author,
           e.metadata->>'work'      AS work,
           e.metadata->>'register'  AS register,
           e.metadata->>'tradition' AS tradition,
           1 - (e.embedding <=> $1::vector) AS sim
      FROM embeddings e
     WHERE e.user_id IS NULL
       AND e.metadata->>'author' IS NOT NULL
       AND (e.metadata->>'sourceUrl' IS NULL OR NOT EXISTS (
              SELECT 1 FROM unnest($2::text[]) d
              WHERE lower(e.metadata->>'sourceUrl') LIKE '%' || d || '%'))
       AND (served)
       ${extra}
     ORDER BY e.embedding <=> $1::vector
     LIMIT ${SWEEP}
  )
  SELECT DISTINCT ON (author, work) author, work, register, tradition, sim
    FROM near ORDER BY author, work, sim DESC`;

const DOMAINS = ['biblehub.com', 'studylight.org', 'historicalchristian.faith'];

const client = new Client({ connectionString: URL_ });
await client.connect();
await client.query(`SELECT set_config('hnsw.ef_search', '400', false)`);
const { rows: [v] } = await client.query(
  `SELECT embedding::text AS v FROM embeddings WHERE user_id IS NULL AND served LIMIT 1`);
if (!v) { console.error('no served vector on dev to EXPLAIN against'); process.exit(1); }

for (const [name, extra] of Object.entries(CONJUNCTS)) {
  const { rows } = await client.query(`EXPLAIN (FORMAT JSON) ${sweep(extra)}`, [v.v, DOMAINS]);
  const plan = rows[0]['QUERY PLAN'];
  const out = new URL(`${prefix}-${name}.json`, import.meta.url);
  writeFileSync(out, JSON.stringify(plan, null, 2) + '\n');
  const idx = JSON.stringify(plan).match(/idx_[a-z_]+/g) ?? [];
  console.log(`${name}: indexes referenced: ${[...new Set(idx)].join(', ') || '(none — seq scan)'}`);
}
await client.end();
