#!/usr/bin/env node
/**
 * HISTORIAN FLAT-EMBEDDINGS BACKFILL — corpus-backlog decision 6 (RULED "build it",
 * 2026-08-13). `josephus-whiston` is published with 4,112 shelf sections but ZERO flat
 * `embeddings` rows, so the historian lane (routing.ts HISTORIAN_CORPUS_FILTER) had
 * nothing to retrieve even once listed. This script writes those flat rows ON DEV by
 * reusing the register path's own machinery: `chunkWhole` (REGISTER_EMBED_MAX=1200) and
 * the exact metadata shape register-writer.ts writes for every other register work —
 * source_type='historian', metadata.register='prose' (the prose-register convention),
 * model BAAI/bge-large-en-v1.5, one row per whole chunk.
 *
 * What it deliberately does NOT do:
 *   - touch `served`. The column defaults false (migration 044) and stays false; the
 *     serve flip is the owner-gated step (scripts/publish-flip.mjs), not this script.
 *     The post-write census asserts served=0 and fails loudly otherwise.
 *   - touch sources/sections/status. The shelf rows already exist (ingest-historian);
 *     this is a retrieval-store backfill, not a re-ingest, so the reingest guard and
 *     the shelf rewrite do not apply.
 *   - run anywhere but dev. Prod is refused outright (ep-odd-fog); the dev endpoint
 *     must be the known ep-tiny-hat branch (the register-writer guard's own idiom).
 *
 * Idempotent/resume-safe: chunks whose source_id already exists for the work are
 * skipped BEFORE embedding (a re-run spends nothing on what already landed), with
 * ON CONFLICT (source_type, source_id, chunk_index) DO NOTHING as the backstop.
 *
 *   npx tsx scripts/embed-historian-flat.mts --env=dev           # dry-run census + cost
 *   npx tsx scripts/embed-historian-flat.mts --env=dev --apply   # embed + write
 */
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { chunkWhole, REGISTER_EMBED_MAX } from '../src/ingest/register-writer.js';

const SLUG = 'josephus-whiston';
const SOURCE_TYPE = 'historian';
const MODEL = 'BAAI/bge-large-en-v1.5'; // register-writer's MODEL — flat rows carry it verbatim
const BATCH = 64;
const MAX_TRIES = 3;

function arg(name: string): string | null {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}
const ENV = arg('env');
const APPLY = process.argv.includes('--apply');
if (ENV !== 'dev') {
  console.error('Usage: npx tsx scripts/embed-historian-flat.mts --env=dev [--apply]  (dev only — prod writes are the owner-gated flip)');
  process.exit(1);
}

function loadEnv(name: string, paths: string[]): string {
  for (const p of paths) {
    try {
      const m = readFileSync(p, 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'));
      if (m) return m[1]!.trim().replace(/^["']|["']$/g, '');
    } catch { /* try next */ }
  }
  console.error(`No ${name} found in ${paths.join(', ')}.`);
  process.exit(1);
}
const url = loadEnv('DATABASE_URL_UNPOOLED', ['.env.local', 'web/.env.local'])
  ?? loadEnv('DATABASE_URL', ['.env.local', 'web/.env.local']);
const host = new URL(url).host;
if (host.includes('ep-odd-fog')) { console.error('ABORT: host is production (ep-odd-fog). This script is dev-only.'); process.exit(1); }
if (!host.includes('ep-tiny-hat')) { console.error(`ABORT: dev endpoint is not the known dev branch (expected ep-tiny-hat, got ${host})`); process.exit(1); }

console.log(`target: dev (${host}) · mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} · model: ${MODEL} · chunk budget: ${REGISTER_EMBED_MAX} chars`);

const client = new Client({ connectionString: url });
await client.connect();

const src = (await client.query(
  `SELECT id, slug, title, author, author_died, year_written, tradition, license, provenance
     FROM sources WHERE slug = $1`, [SLUG])).rows[0];
if (!src) { console.error(`ABORT: no sources row for ${SLUG}`); process.exit(1); }

// One flat row per chunk; the chunk's anchor is the section's FIRST anchor (the
// register-writer takes anchors[0] the same way) so laneOnRangeSql can answer
// "a historian passage ON this text" for the 439 anchored sections. Unanchored
// sections carry verseId/verseEnd 0 — semantic-fill only, exactly like the
// unanchored sermon chunks.
const sections = (await client.query(
  `SELECT s.ordinal, s.heading, s.body,
          (SELECT sa.verse_id_start FROM section_anchors sa
            WHERE sa.section_id = s.id ORDER BY sa.verse_id_start LIMIT 1) AS vstart,
          (SELECT sa.verse_id_end FROM section_anchors sa
            WHERE sa.section_id = s.id ORDER BY sa.verse_id_start LIMIT 1) AS vend
     FROM sections s WHERE s.source_id = $1 ORDER BY s.ordinal`, [src.id])).rows;

interface Row { sourceId: string; content: string; meta: Record<string, unknown> }
const rows: Row[] = [];
let junkFragments = 0;
for (const s of sections) {
  const chunks = chunkWhole(s.heading ? `${s.heading}\n${s.body}` : s.body);
  chunks.forEach((content, ci) => {
    if (content.trim().length < 20) { junkFragments++; return; } // register-writer's junk-fragment floor
    rows.push({
      sourceId: `${SOURCE_TYPE}:${SLUG}:${s.ordinal}${chunks.length > 1 ? `.${ci + 1}` : ''}`,
      content,
      meta: {
        author: src.author, year: src.year_written, tradition: src.tradition,
        sourceTitle: src.title, sourceUrl: src.provenance?.url, work: SLUG,
        register: 'prose', // the prose-register convention: everything but hymn/poetry
        heading: s.heading, verseId: s.vstart ?? 0, verseEnd: s.vend ?? 0,
        model: MODEL, license: src.license,
      },
    });
  });
}

const existing = new Set(
  (await client.query(`SELECT source_id FROM embeddings WHERE user_id IS NULL AND source_type = $1 AND metadata->>'work' = $2`,
    [SOURCE_TYPE, SLUG])).rows.map((r) => r.source_id as string),
);
const todo = rows.filter((r) => !existing.has(r.sourceId));
const estTokens = Math.round(todo.reduce((n, r) => n + r.content.length, 0) / 4);
console.log(`sections: ${sections.length} · chunks: ${rows.length} (junk fragments dropped: ${junkFragments})`);
console.log(`already present: ${existing.size} · to embed: ${todo.length} · est ${estTokens.toLocaleString('en-US')} tokens (~$${(estTokens / 1e6 * 0.01).toFixed(4)})`);

if (!APPLY) {
  console.log('DRY-RUN — re-run with --apply to embed + write.');
  await client.end();
  process.exit(0);
}
if (todo.length === 0) {
  console.log('Nothing to embed — every chunk already has a flat row.');
  await client.end();
  process.exit(0);
}

const key = loadEnv('DEEPINFRA_API_KEY', ['web/.env.local']);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function embedBatch(texts: string[]): Promise<number[][]> {
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: MODEL, input: texts, encoding_format: 'float' }),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.ok) {
        const data = ((await res.json()) as { data: { embedding: number[] }[] }).data.map((d) => d.embedding);
        if (data.length === texts.length && data.every((v) => v.length > 0)) return data;
        throw Object.assign(new Error(`embed count/content mismatch`), { retryable: true });
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === MAX_TRIES) {
        const body = (await res.text().catch(() => '')).slice(0, 200);
        throw Object.assign(new Error(`embed ${res.status} ${body}`), { retryable });
      }
      const wait = attempt * 5000;
      console.log(`  429/5xx (${res.status}) — retry ${attempt}/${MAX_TRIES} after ${wait}ms`);
      await sleep(wait);
    } catch (e) {
      const err = e as Error & { retryable?: boolean };
      if (err.retryable === false || attempt === MAX_TRIES) throw err;
      const wait = attempt * 5000;
      console.log(`  request error (${err.message}) — retry ${attempt}/${MAX_TRIES} after ${wait}ms`);
      await sleep(wait);
    }
  }
  throw new Error('unreachable');
}

let embedded = 0;
const t0 = Date.now();
for (let i = 0; i < todo.length; i += BATCH) {
  const b = todo.slice(i, i + BATCH);
  const vecs = await embedBatch(b.map((r) => r.content));
  const params: unknown[] = [];
  const tuples = b.map((r, j) => {
    const p = j * 5;
    params.push(SOURCE_TYPE, r.sourceId, r.content, JSON.stringify(vecs[j]), JSON.stringify(r.meta));
    return `(NULL, $${p + 1}, $${p + 2}, 0, $${p + 3}, $${p + 4}::vector, $${p + 5}::jsonb)`;
  });
  await client.query(
    `INSERT INTO embeddings (user_id, source_type, source_id, chunk_index, content, embedding, metadata)
     VALUES ${tuples.join(',')} ON CONFLICT (source_type, source_id, chunk_index) DO NOTHING`, params);
  embedded += b.length;
  if (embedded % (BATCH * 10) < b.length) {
    console.log(`  progress: ${embedded}/${todo.length} elapsed=${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}

// Post-write census. `served` must be ALL FALSE — the flip is not this script's to make;
// a single served row here means the default changed under us and the run must be loud.
const census = (await client.query(
  `SELECT count(*)::int n, count(*) FILTER (WHERE served)::int served_n,
          count(*) FILTER (WHERE metadata->>'verseId' <> '0')::int anchored
     FROM embeddings WHERE user_id IS NULL AND source_type = $1 AND metadata->>'work' = $2`,
  [SOURCE_TYPE, SLUG])).rows[0];
console.log(`DONE in ${((Date.now() - t0) / 1000).toFixed(0)}s · flat rows for ${SLUG}: ${census.n} (anchored: ${census.anchored}) · served=true: ${census.served_n}`);
if (census.served_n !== 0) {
  console.error('STOP: served=true rows exist after a backfill that never sets served — the column default changed. Investigate before any flip.');
  process.exit(2);
}
await client.end();
