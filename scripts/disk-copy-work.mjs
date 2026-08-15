#!/usr/bin/env node
/**
 * DISK-STAGED WORK COPY — dev → local disk → prod. 2026-08-14.
 *
 * WHY: corpus-copy.mjs holds a live dev source transaction open for the whole copy.
 * The dev endpoint (ep-tiny-hat) scale-to-zero suspends mid-read; the client waits on a
 * dead socket forever while the prod dest transaction becomes an idle-in-transaction
 * zombie whose uncommitted unique-key inserts block every retry (measured 3× on
 * 2026-08-13/14). Two phases with local disk between them hold no cross-DB liveness.
 *
 *   node scripts/disk-copy-work.mjs --slug=scofield-crosswire --dump    # dev → /tmp
 *   node scripts/disk-copy-work.mjs --slug=scofield-crosswire --load    # /tmp → prod
 *   node scripts/disk-copy-work.mjs --slug=scofield-crosswire --verify  # census both sides
 *
 * Discipline: prod load refuses if the slug already has a sources row on prod (no
 * half-state: one transaction per work, rollback on any error); role asserted at the
 * server (neondb_owner); endpoints asserted before connecting; generated columns excluded;
 * served=false preserved verbatim (publishing stays publish-flip's job); no secrets printed.
 * Owner override for the prod writes recorded in WORKLOG 2026-08-13/14.
 */
import { readFileSync, writeFileSync, createWriteStream, createReadStream, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createGzip, createGunzip } from 'node:zlib';
import { Client } from 'pg';
import readline from 'node:readline';

const SLUG = process.argv.find((a) => a.startsWith('--slug='))?.slice(7);
const MODE = ['--dump', '--load', '--verify'].find((m) => process.argv.includes(m))?.slice(2);
if (!SLUG || !MODE) { console.error('usage: --slug=X (--dump|--load|--verify)'); process.exit(1); }
const DIR = `/tmp/disk-copy/${SLUG}`;
const TABLES = ['sources', 'sections', 'section_anchors', 'section_embeddings', 'embeddings'];

function devUrl() {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const m = raw.match(/^DATABASE_URL_UNPOOLED=(.+)$/m) || raw.match(/^DATABASE_URL=(.+)$/m);
  return m[1].trim().replace(/^["']|["']$/g, '');
}
const prodUrl = () => readFileSync(join(homedir(), '.neon_prod_url'), 'utf8').trim();
const assertHost = (url, want, label) => {
  const h = new URL(url).host;
  if (want === 'prod' && !h.includes('ep-odd-fog')) { console.error(`ABORT: ${label} not prod (${h})`); process.exit(1); }
  if (want === 'dev' && h.includes('ep-odd-fog')) { console.error(`ABORT: ${label} is prod`); process.exit(1); }
  return h;
};

async function generatedCols(client, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND is_generated='ALWAYS'`, [table]);
  return new Set(rows.map((r) => r.column_name));
}

async function dump() {
  const c = new Client({ connectionString: devUrl() });
  await c.connect();
  assertHost(devUrl(), 'dev', 'source');
  mkdirSync(DIR, { recursive: true });
  const src = await c.query('SELECT * FROM sources WHERE slug=$1', [SLUG]);
  if (!src.rows.length) { console.error(`no ${SLUG} on dev`); process.exit(1); }
  const sourceId = src.rows[0].id;
  writeFileSync(`${DIR}/sources.json`, JSON.stringify(src.rows));
  console.log(`source id=${sourceId} status=${src.rows[0].status}`);
  const gen = { sections: await generatedCols(c, 'sections'), embeddings: await generatedCols(c, 'embeddings') };
  const queries = {
    sections: [`SELECT * FROM sections WHERE source_id=$1 ORDER BY ordinal`, [sourceId], gen.sections],
    section_anchors: [`SELECT sa.* FROM section_anchors sa JOIN sections s ON s.id=sa.section_id WHERE s.source_id=$1 ORDER BY sa.section_id`, [sourceId], new Set()],
    section_embeddings: [`SELECT se.* FROM section_embeddings se JOIN sections s ON s.id=se.section_id WHERE s.source_id=$1 ORDER BY se.section_id`, [sourceId], new Set()],
    embeddings: [`SELECT * FROM embeddings WHERE user_id IS NULL AND metadata->>'work'=$1`, [SLUG], gen.embeddings],
  };
  for (const [table, [sql, params, genCols]] of Object.entries(queries)) {
    const { rows } = await c.query(sql, params);
    const out = createWriteStream(`${DIR}/${table}.jsonl.gz`);
    const gz = createGzip(); gz.pipe(out);
    const cols = rows.length ? Object.keys(rows[0]).filter((cn) => !genCols.has(cn)) : [];
    for (const r of rows) gz.write(JSON.stringify({ cols, r }) + '\n');
    gz.end(); await new Promise((res) => out.on('finish', res));
    console.log(`  ${table}: ${rows.length} rows dumped${genCols.size ? ` (excluded generated: ${[...genCols].join(',')})` : ''}`);
  }
  console.log(`dump complete → ${DIR}`);
  await c.end();
}

async function* readJsonl(file) {
  const rl = readline.createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) yield JSON.parse(line);
}

async function load() {
  const srcRows = JSON.parse(readFileSync(`${DIR}/sources.json`, 'utf8'));
  const dest = new Client({ connectionString: prodUrl() });
  await dest.connect();
  assertHost(prodUrl(), 'prod', 'dest');
  const who = (await dest.query('SELECT current_user AS u')).rows[0].u;
  if (who !== 'neondb_owner') { console.error(`ABORT: dest role ${who}`); process.exit(1); }
  const exists = await dest.query('SELECT id FROM sources WHERE slug=$1', [SLUG]);
  if (exists.rows.length) { console.error(`ABORT: ${SLUG} already has a sources row on prod (id=${exists.rows[0].id}) — refusing half-state`); process.exit(1); }

  const t0 = Date.now();
  await dest.query('BEGIN');
  try {
    const s = srcRows[0];
    delete s.id;
    const sCols = Object.keys(s);
    const newSrc = await dest.query(
      `INSERT INTO sources (${sCols.join(',')}) VALUES (${sCols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
      sCols.map((cn) => s[cn]));
    const destSourceId = newSrc.rows[0].id;
    console.log(`sources row inserted (id=${destSourceId}, status=${s.status} — staged verbatim)`);

    // sections: batched 200-row inserts (per-row round trips measured ~2.5 rows/s — that rate
    // makes poole a 5-hour load; batching is the difference). id map built afterwards via the
    // per-work-unique ordinal (the repoint tool's join key convention).
    const idMap = new Map(); // dev section id -> prod section id
    {
      const devOrd = new Map(); // dev section id -> ordinal
      const rows = [];
      for await (const { cols, r } of readJsonl(`${DIR}/sections.jsonl.gz`)) { devOrd.set(r.id, r.ordinal); rows.push({ cols, r }); }
      const vals0 = rows[0]?.cols.filter((cn) => cn !== 'id') ?? [];
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const params = [];
        const tuples = chunk.map(({ r }) => {
          const base = params.length;
          params.push(...vals0.map((cn) => (cn === 'source_id' ? destSourceId : r[cn])));
          return `(${vals0.map((_, j) => `$${base + j + 1}`).join(',')})`;
        });
        await dest.query(`INSERT INTO sections (${vals0.join(',')}) VALUES ${tuples.join(',')}`, params);
      }
      const { rows: prodSecs } = await dest.query('SELECT id, ordinal FROM sections WHERE source_id=$1', [destSourceId]);
      const ordToProd = new Map(prodSecs.map((x) => [x.ordinal, x.id]));
      for (const [devId, ord] of devOrd) {
        const pid = ordToProd.get(ord);
        if (pid === undefined) throw new Error(`no prod section for ordinal ${ord}`);
        idMap.set(devId, pid);
      }
      console.log(`sections: ${idMap.size} inserted (batched)`);
    }

    for (const table of ['section_anchors', 'section_embeddings']) {
      let n = 0;
      const file = `${DIR}/${table}.jsonl.gz`;
      if (!existsSync(file)) continue;
      let batch = []; let colsRef = null;
      const flush = async () => {
        if (!batch.length) return;
        const params = [];
        const tuples = batch.map((r) => {
          const base = params.length;
          params.push(...colsRef.map((cn) => r[cn]));
          return `(${colsRef.map((_, i) => `$${base + i + 1}`).join(',')})`;
        });
        await dest.query(`INSERT INTO ${table} (${colsRef.join(',')}) VALUES ${tuples.join(',')}`, params);
        n += batch.length; batch = [];
      };
      for await (const { cols, r } of readJsonl(file)) {
        const vals = cols.filter((cn) => cn !== 'id');
        const mapped = { ...r };
        if (vals.includes('section_id')) {
          mapped.section_id = idMap.get(r.section_id);
          if (mapped.section_id === undefined) throw new Error(`${table}: unmapped section_id ${r.section_id}`);
        }
        colsRef = vals;
        batch.push(vals.map((cn) => mapped[cn]).reduce((o, v, i) => ({ ...o, [vals[i]]: v }), {}));
        if (batch.length >= 200) { await flush(); if (n % 5000 < 200) console.log(`  ${table}: ${n}…`); }
      }
      await flush();
      console.log(`${table}: ${n} inserted`);
    }

    {
      let n = 0;
      const file = `${DIR}/embeddings.jsonl.gz`;
      if (existsSync(file)) {
        // batched via unnest for speed
        let batch = [];
        let colsRef = null;
        const flush = async () => {
          if (!batch.length) return;
          const params = [];
          const tuples = batch.map((r) => {
            const base = params.length;
            params.push(...colsRef.map((cn) => r[cn]));
            return `(${colsRef.map((_, i) => `$${base + i + 1}`).join(',')})`;
          });
          await dest.query(`INSERT INTO embeddings (${colsRef.join(',')}) VALUES ${tuples.join(',')}`, params);
          n += batch.length; batch = [];
        };
        for await (const { cols, r } of readJsonl(file)) {
          colsRef = cols;
          batch.push(r);
          if (batch.length >= 100) { await flush(); if (n % 5000 < 100) console.log(`  embeddings: ${n}…`); }
        }
        await flush();
      }
      console.log(`embeddings (flat): ${n} inserted`);
    }

    const chk = await dest.query(
      `SELECT (SELECT count(*)::int FROM sections WHERE source_id=$1) sec,
              (SELECT count(*)::int FROM section_embeddings se JOIN sections s ON s.id=se.section_id WHERE s.source_id=$1) svecs,
              (SELECT count(*)::int FROM embeddings WHERE user_id IS NULL AND metadata->>'work'=$2) flat`,
      [destSourceId, SLUG]);
    console.log(`post-insert census: ${JSON.stringify(chk.rows[0])}`);
    await dest.query('COMMIT');
    console.log(`LOADED ${SLUG} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  } catch (e) {
    await dest.query('ROLLBACK');
    console.error(`LOAD FAILED, rolled back (no half-state): ${e.message}`);
    process.exit(1);
  }
  await dest.end();
}

async function verify() {
  for (const [label, url] of [['dev', devUrl()], ['prod', prodUrl()]]) {
    const c = new Client({ connectionString: url });
    await c.connect();
    const r = await c.query(
      `SELECT src.status, count(DISTINCT s.id)::int sec, count(DISTINCT se.section_id)::int svecs,
        (SELECT count(*)::int FROM embeddings e WHERE e.user_id IS NULL AND e.metadata->>'work'=$1) flat,
        (SELECT count(*)::int FROM embeddings e WHERE e.user_id IS NULL AND e.metadata->>'work'=$1 AND e.served) served
       FROM sources src LEFT JOIN sections s ON s.source_id=src.id LEFT JOIN section_embeddings se ON se.section_id=s.id
       WHERE src.slug=$1 GROUP BY src.status`, [SLUG]);
    console.log(`${label}: ${JSON.stringify(r.rows[0] ?? 'ABSENT')}`);
    await c.end();
  }
}

await ({ dump, load, verify })[MODE]();
