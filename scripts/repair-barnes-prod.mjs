#!/usr/bin/env node
// Owner ruling 2026-07-30 (ADR-039): quarantine barnes-notes + replace flat pool
// with CrossWire per-verse embeddings, then slice barnes-crosswire-nt.
//
// Prod's 1,300 Barnes rows use collapsed chapter keys (verse=chapter, biblehub).
// CrossWire jsonl is per-verse — delete-and-reinsert, not in-place source_id match.
//
//   node scripts/repair-barnes-prod.mjs --jsonl=data/raw/sword/barnes-nt.jsonl
//   node scripts/repair-barnes-prod.mjs --jsonl=... --apply
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { assertCutoverTarget, endpointId, hostOf } from './lib/target-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');
const jsonlPath = process.argv.find((a) => a.startsWith('--jsonl='))?.slice('--jsonl='.length)
  ?? 'data/raw/sword/barnes-nt.jsonl';
const CROSSWIRE_URL = 'https://crosswire.org/sword/modules/ModInfo.jsp?modName=Barnes';
const PROD_AUTHOR = "Barnes' Notes";
const TARGET_WORK = 'barnes-crosswire-nt';
const MODEL = 'BAAI/bge-large-en-v1.5';
const EMBED_BATCH = 32;
const FORBIDDEN = ['biblehub.com', 'studylight.org', 'historicalchristian.faith'];

const BOOK_SLUGS = {
  1:'gen',2:'exo',3:'lev',4:'num',5:'deu',6:'jos',7:'jdg',8:'rut',9:'1sa',10:'2sa',
  11:'1ki',12:'2ki',13:'1ch',14:'2ch',15:'ezr',16:'neh',17:'est',18:'job',19:'psa',
  20:'pro',21:'ecc',22:'sng',23:'isa',24:'jer',25:'lam',26:'ezk',27:'dan',28:'hos',
  29:'jol',30:'amo',31:'oba',32:'jon',33:'mic',34:'nam',35:'hab',36:'zep',37:'hag',
  38:'zec',39:'mal',40:'mat',41:'mrk',42:'luk',43:'jhn',44:'act',45:'rom',46:'1co',
  47:'2co',48:'gal',49:'eph',50:'php',51:'col',52:'1th',53:'2th',54:'1ti',55:'2ti',
  56:'tit',57:'phm',58:'heb',59:'jas',60:'1pe',61:'2pe',62:'1jn',63:'2jn',64:'3jn',
  65:'jud',66:'rev',
};

function urlFromEnv() {
  const u = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? process.env.CUTOVER_DATABASE_URL;
  if (!u) throw new Error('DATABASE_URL (unpooled owner) required');
  return u.replace(/^["']|["']$/g, '');
}

function decodeVerseId(v) {
  return { book: Math.floor(v / 1e6), chapter: Math.floor((v % 1e6) / 1000), verse: v % 1000 };
}

function synthesizeSourceId({ book, chapter, verse_start, verse_end, author }) {
  const slug = BOOK_SLUGS[book];
  if (!slug) return null;
  return `commentary:${slug}:${chapter}:${verse_start}-${verse_end}:${author}`;
}

function forbiddenUrl(url) {
  const u = String(url ?? '').toLowerCase();
  return FORBIDDEN.find((d) => u.includes(d)) ?? null;
}

function loadRows() {
  if (!fs.existsSync(jsonlPath)) throw new Error(`missing jsonl: ${jsonlPath}`);
  const rows = [];
  for (const line of fs.readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean)) {
    const e = JSON.parse(line);
    const { book, chapter, verse } = decodeVerseId(e.verseId);
    const end = e.verseEnd ?? e.verseId;
    const endVerse = end % 1000;
    const sourceId = synthesizeSourceId({ book, chapter, verse_start: verse, verse_end: endVerse, author: PROD_AUTHOR });
    if (!sourceId || !e.content?.trim()) continue;
    rows.push({
      sourceId,
      content: e.content,
      metadata: {
        author: PROD_AUTHOR,
        year: 1834,
        tradition: 'Presbyterian',
        sourceTitle: "Barnes' New Testament Notes",
        sourceUrl: CROSSWIRE_URL,
        verseId: e.verseId,
        verseEnd: end,
        model: MODEL,
        work: TARGET_WORK,
      },
    });
  }
  return rows;
}

async function embedBatch(texts, key) {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, input: texts.map((t) => t.slice(0, 1200)), encoding_format: 'float' }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`);
  return ((await res.json()).data).map((d) => d.embedding);
}

async function main() {
  const url = urlFromEnv();
  const host = hostOf(url);
  const isProd = endpointId(host)?.startsWith('ep-odd-fog');
  if (isProd && apply) {
    assertCutoverTarget(url, {
      allow: process.env.REPAIR_BARNES_ALLOW_PROD === '1',
      declared: process.env.CUTOVER_EXPECT_HOST,
      what: 'barnes repair target',
    });
    const quote = process.env.CUTOVER_OWNER_GO_QUOTE?.trim();
    if (!quote) throw new Error('CUTOVER_OWNER_GO_QUOTE required for prod writes');
    console.log(`OWNER GO QUOTE: ${quote}`);
  }
  const key = process.env.DEEPINFRA_API_KEY;
  if (apply && !key) throw new Error('DEEPINFRA_API_KEY required for re-embed');

  const incoming = loadRows();
  console.log(`host: ${host} (credentials redacted)  mode: ${apply ? 'APPLY' : 'dry-run'}`);
  console.log(`crosswire rows to insert: ${incoming.length}`);

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: 'repair-barnes-prod' });
  await client.connect();

  try {
    const flatBefore = (await client.query(
      `SELECT count(*)::int n FROM embeddings WHERE user_id IS NULL AND metadata->>'author' = $1`, [PROD_AUTHOR],
    )).rows[0].n;
    const secBefore = (await client.query(
      `SELECT count(*)::int n FROM sections s JOIN sources src ON src.id = s.source_id WHERE src.slug = 'barnes-notes'`,
    )).rows[0].n;
    console.log(`prod flat (Barnes' Notes) before: ${flatBefore}; barnes-notes sections: ${secBefore}`);

    if (!apply) {
      console.log('[dry-run] would: quarantine barnes-notes; delete its sections; DELETE old flat rows; INSERT crosswire rows; slice barnes-crosswire-nt');
      return;
    }

    await client.query('BEGIN');

    await client.query(`UPDATE sources SET status = 'quarantined' WHERE slug = 'barnes-notes'`);
    const barnesSrc = (await client.query(`SELECT id FROM sources WHERE slug = 'barnes-notes'`)).rows[0]?.id;
    if (barnesSrc) {
      await client.query(`DELETE FROM section_embeddings WHERE section_id IN (SELECT id FROM sections WHERE source_id = $1)`, [barnesSrc]);
      await client.query(`DELETE FROM section_anchors WHERE section_id IN (SELECT id FROM sections WHERE source_id = $1)`, [barnesSrc]);
      const delSec = await client.query(`DELETE FROM sections WHERE source_id = $1`, [barnesSrc]);
      console.log(`deleted barnes-notes sections: ${delSec.rowCount}`);
    }

    const delFlat = await client.query(
      `DELETE FROM embeddings WHERE user_id IS NULL AND metadata->>'author' = $1 RETURNING id`, [PROD_AUTHOR],
    );
    console.log(`deleted old flat rows: ${delFlat.rowCount}`);

    let inserted = 0;
    for (let i = 0; i < incoming.length; i += EMBED_BATCH) {
      const batch = incoming.slice(i, i + EMBED_BATCH);
      const vecs = await embedBatch(batch.map((r) => r.content), key);
      const params = [];
      const tuples = batch.map((r, j) => {
        if (forbiddenUrl(r.metadata.sourceUrl)) throw new Error(`forbidden url on ${r.sourceId}`);
        const vec = vecs[j];
        if (!vec || vec.length !== 1024) throw new Error(`bad embedding for ${r.sourceId}`);
        const p = j * 5;
        params.push(r.sourceId, r.content, JSON.stringify(vec), JSON.stringify(r.metadata), 0);
        return `(NULL, 'commentary', $${p + 1}, $${p + 5}, $${p + 2}, $${p + 3}::vector, $${p + 4}::jsonb)`;
      });
      const res = await client.query(
        `INSERT INTO embeddings (user_id, source_type, source_id, chunk_index, content, embedding, metadata)
         VALUES ${tuples.join(', ')} ON CONFLICT (source_type, source_id, chunk_index) DO NOTHING RETURNING id`,
        params,
      );
      inserted += res.rowCount ?? 0;
      if ((i + batch.length) % 256 === 0 || i + batch.length >= incoming.length) {
        console.log(`  embedded ${Math.min(i + batch.length, incoming.length)}/${incoming.length}, inserted ${inserted}`);
      }
    }

    const flatAfter = (await client.query(
      `SELECT count(*)::int n FROM embeddings WHERE user_id IS NULL AND metadata->>'author' = $1`, [PROD_AUTHOR],
    )).rows[0].n;
    const forbiddenAfter = (await client.query(
      `SELECT count(*)::int n FROM embeddings WHERE user_id IS NULL AND metadata->>'author' = $1
       AND metadata->>'sourceUrl' ILIKE ANY($2::text[])`, [PROD_AUTHOR, FORBIDDEN.map((d) => `%${d}%`)],
    )).rows[0].n;
    if (forbiddenAfter > 0) throw new Error(`${forbiddenAfter} Barnes rows still forbidden`);
    console.log(`flat pool after insert: ${flatAfter} (inserted ${inserted})`);

    await client.query('COMMIT');

    execFileSync('npx', ['tsx', 'src/ingest/migrate-sections-slice.ts', `--source=${TARGET_WORK}`], {
      cwd: ROOT, stdio: 'inherit', env: { ...process.env, DATABASE_URL: url },
    });

    const secAfter = (await client.query(
      `SELECT count(*)::int n FROM sections s JOIN sources src ON src.id = s.source_id WHERE src.slug = $1`, [TARGET_WORK],
    )).rows[0].n;
    const secOld = (await client.query(
      `SELECT count(*)::int n FROM sections s JOIN sources src ON src.id = s.source_id WHERE src.slug = 'barnes-notes'`,
    )).rows[0].n;
    console.log(`post-slice: barnes-crosswire-nt sections=${secAfter}; barnes-notes sections=${secOld}`);
    if (secOld !== 0) throw new Error(`barnes-notes sections remain: ${secOld}`);
    if (secAfter === 0) throw new Error('barnes-crosswire-nt has zero sections after slice');
    console.log('REPAIR COMPLETE');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
