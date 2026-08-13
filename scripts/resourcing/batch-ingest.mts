// Phase 3 BATCH ingest — corpus-backlog decision #5 (RULED 2026-08-13: "re-ingest
// all four from their named editions"). Fresh re-ingest to DEV, STAGED, from a
// decoded per-verse JSONL produced by the named edition's fetcher/decoder
// (fetch-crosswire.mts → sword-zverse for the CrossWire modules; poole-tcp.ts
// for the TCP transcription). NEVER publishes: publish=false is hard-wired here
// — the publish flip is a later owner-gated step, and none of the four slugs is
// in a SERVED_*_WORKS list yet (publishing today would be the A3
// publish-but-not-serve STOP).
//
//   npx tsx scripts/resourcing/batch-ingest.mts --env=dev --slug=barnes-crosswire-nt --jsonl=data/raw/sword/barnes.jsonl
//
// Goes through register-writer.writeRegisterWork — the ONE writer (sources row
// stamped 'staged', sections + section_anchors shelf, flat embeddings, static
// reader corpus) — then adds the per-section vector pass (D1(b): ONE vector per
// section, body embedded WHOLE, model_slug 'bge-large-en-v1.5') that the writer
// deliberately leaves to a separate step, so the post-ingest census can assert
// section_embeddings == sections. Endpoint asserted dev BEFORE any connect;
// credentials come from the env files and are never printed.

import { readFileSync } from 'node:fs';
import pg from 'pg';
import { hostOf, isDevHost, isProdHost } from '../lib/target-guard.mjs';
import { BOOKS } from '../../src/bible/books.js';
import { writeRegisterWork, type RegisterSection, type RegisterWork } from '../../src/ingest/register-writer.js';

const arg = (f: string) => process.argv.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1);

const MODEL_SLUG = 'bge-large-en-v1.5';
const MODEL_API_ID = 'BAAI/bge-large-en-v1.5';
const EMBED_BATCH = 64;

function envFrom(file: string, key: string): string | undefined {
  try {
    return readFileSync(file, 'utf8').match(new RegExp(`^${key}="?([^"\n]*)"?$`, 'm'))?.[1];
  } catch { return undefined; }
}

// ── DeepInfra, same discipline as register-writer: batch fast-path; per-text
// adaptive shorten on a token-limit 400; back off and retry 429/5xx; throw
// rather than ever write a missing/zero vector. ──
function makeEmbedder(key: string) {
  async function embedRaw(texts: string[], attempt = 0): Promise<number[][]> {
    const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL_API_ID, input: texts, encoding_format: 'float' }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const body = await res.text();
      const tokenLimit = /context length|maximum input length|input tokens/i.test(body);
      if (!tokenLimit && (res.status === 429 || res.status >= 500) && attempt < 5) {
        await new Promise((r) => setTimeout(r, 1_000 * 2 ** attempt));
        return embedRaw(texts, attempt + 1);
      }
      const err = new Error(`embed ${res.status}: ${body.slice(0, 160)}`) as Error & { tokenLimit?: boolean };
      err.tokenLimit = tokenLimit;
      throw err;
    }
    return ((await res.json()) as { data: { embedding: number[] }[] }).data.map((d) => d.embedding);
  }
  async function embedOne(text: string): Promise<number[]> {
    let len = text.length;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const v = (await embedRaw([text.slice(0, len)]))[0];
        if (v && v.length === 1024) return v;
        throw new Error('empty/wrong-dim embedding returned');
      } catch (e) {
        if ((e as { tokenLimit?: boolean }).tokenLimit) { len = Math.floor(len * 0.8); if (len < 100) break; }
        else await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    throw new Error(`could not embed a ${text.length}-char section after retries`);
  }
  return async function embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const v = await embedRaw(texts);
      if (v.length === texts.length && v.every((x) => x.length === 1024)) return v;
    } catch { /* fall through to per-text */ }
    const out: number[][] = [];
    for (const t of texts) out.push(await embedOne(t));
    return out;
  };
}

async function main() {
  if (arg('--env') !== 'dev') throw new Error('usage: batch-ingest.mts --env=dev --slug=<manifest slug> [--jsonl=<per-verse.jsonl> | --vectors-only]  (dev only; there is no prod path here)');
  const slug = arg('--slug');
  const jsonl = arg('--jsonl');
  const VECTORS_ONLY = process.argv.includes('--vectors-only');
  if (!slug || (!VECTORS_ONLY && !jsonl)) throw new Error('--slug and --jsonl are required (or --vectors-only to run just the section-vector pass + census)');

  const dbUrl = envFrom('.env.local', 'DATABASE_URL_UNPOOLED') ?? envFrom('.env.local', 'DATABASE_URL');
  const branch = envFrom('.env.local', 'NEON_BRANCH');
  const key = envFrom('web/.env.local', 'DEEPINFRA_API_KEY');
  if (!dbUrl || !key) throw new Error('DATABASE_URL (root .env.local) and DEEPINFRA_API_KEY (web/.env.local) required');
  const host = hostOf(dbUrl);
  if (host.includes('ep-odd-fog') || isProdHost(dbUrl)) throw new Error(`REFUSING: target is production (${host.split('.')[0]}…)`);
  if (!isDevHost(dbUrl)) throw new Error(`REFUSING: ${host.split('.')[0]}… is not on the dev allow-list`);
  if (branch !== 'dev') throw new Error(`STOP: NEON_BRANCH="${branch ?? '(unset)'}" in root .env.local must be dev`);
  // Hand the env to register-writer's localEnv (process.env wins there).
  process.env.DATABASE_URL = dbUrl;
  process.env.NEON_BRANCH = branch;
  process.env.DEEPINFRA_API_KEY = key;

  const manifest = JSON.parse(readFileSync('ingest/sources.config.json', 'utf8')) as Array<Record<string, unknown>>;
  const entry = manifest.find((e) => e.slug === slug);
  if (!entry) throw new Error(`FAIL CLOSED: no manifest entry ${slug}`);
  const prov = entry.provenance as Record<string, unknown>;
  console.log(`manifest: ${slug} — "${entry.title}" (${entry.author}, ${entry.year_written}) license=${entry.license}`);
  console.log(`named edition: ${prov.edition}`);

  const sections: RegisterSection[] = [];
  if (!VECTORS_ONLY) {
    for (const line of readFileSync(jsonl!, 'utf8').trim().split('\n')) {
      if (!line.trim()) continue;
      const e = JSON.parse(line) as { verseId: number; verseEnd?: number; content: string };
      const book = Math.floor(e.verseId / 1e6), ch = Math.floor((e.verseId % 1e6) / 1000), vs = e.verseId % 1000;
      const bookName = BOOKS[book - 1]?.name ?? `book${book}`;
      sections.push({
        heading: `${bookName} ${ch}:${vs}`,
        body: e.content,
        anchors: [{ verseIdStart: e.verseId, verseIdEnd: e.verseEnd ?? e.verseId }],
      });
    }
    if (sections.length < 10) throw new Error(`FAIL CLOSED: only ${sections.length} entries in ${jsonl}`);
    console.log(`decoded entries: ${sections.length}`);
  }

  const work: RegisterWork = {
    slug, title: entry.title as string, author: entry.author as string,
    authorDied: entry.author_died as number | undefined, year: entry.year_written as number,
    sourceType: entry.source_type as string, register: 'prose', tradition: entry.tradition as string,
    era: entry.era as string, license: entry.license as string, url: prov.url as string,
    edition: (prov.edition as string) ?? '',
    publish: false, // HARD-WIRED: decision #5 lands these STAGED; the flip is owner-gated.
    sections,
  };
  if (!VECTORS_ONLY) {
    const w = await writeRegisterWork(work);
    console.log(`writeRegisterWork: ${w.embedded} flat embeddings, ${w.staticEntries} static reader entries`);
  } else {
    console.log('--vectors-only: skipping writeRegisterWork (flat store + shelf already written); running the section-vector pass + census');
  }

  // ── per-section vectors (D1(b)) — the writer leaves this to a separate step.
  // Convention (migrate-sections-slice.ts: "section_embeddings reuses
  // embeddings.embedding verbatim, so no re-embedding"): a section's vector IS
  // its flat chunk-0 vector. DeepInfra 400s over 512 tokens — it does NOT
  // truncate (measured 2026-08-13: "maximum input length of 512 tokens") — so
  // whole-body embedding is impossible anyway; the chunk-0 copy is both the
  // corpus convention and $0. The API embedder below is the fallback for a
  // section with no flat counterpart (should not happen). ──
  const db = new pg.Client({ connectionString: dbUrl });
  await db.connect();
  try {
    const srcId = (await db.query(`SELECT id FROM sources WHERE slug = $1`, [slug])).rows[0]?.id;
    if (!srcId) throw new Error(`no sources row for ${slug} after write`);
    const copied = await db.query(
      `INSERT INTO section_embeddings (section_id, model_slug, embedding)
       SELECT s.id, $2, e.embedding
       FROM sections s
       JOIN embeddings e ON e.user_id IS NULL AND e.source_type = $3 AND e.chunk_index = 0
         AND (e.source_id = $3 || ':' || $4 || ':' || s.ordinal
              OR e.source_id = $3 || ':' || $4 || ':' || s.ordinal || '.1')
       WHERE s.source_id = $1
         AND NOT EXISTS (SELECT 1 FROM section_embeddings se WHERE se.section_id = s.id AND se.model_slug = $2)
       ON CONFLICT (section_id, model_slug) DO NOTHING`,
      [srcId, MODEL_SLUG, work.sourceType, slug]);
    console.log(`section_embeddings copied from flat chunk-0 vectors ($0, corpus convention): ${copied.rowCount}`);

    const secs = (await db.query(
      `SELECT s.id, s.body FROM sections s WHERE s.source_id = $1
       AND NOT EXISTS (SELECT 1 FROM section_embeddings se WHERE se.section_id = s.id AND se.model_slug = $2)
       ORDER BY s.ordinal`, [srcId, MODEL_SLUG])).rows as Array<{ id: string; body: string }>;
    if (secs.length > 0) {
      console.log(`sections with no flat counterpart — embedding via API (first ≤1200 chars, the flat-store convention): ${secs.length}`);
      const embedBatch = makeEmbedder(key);
      let written = 0;
      for (let i = 0; i < secs.length; i += EMBED_BATCH) {
        const b = secs.slice(i, i + EMBED_BATCH);
        const vecs = await embedBatch(b.map((s) => s.body.slice(0, 1200)));
        const params: unknown[] = [];
        const tuples = b.map((s, j) => {
          const p = j * 3;
          params.push(s.id, MODEL_SLUG, JSON.stringify(vecs[j]!));
          return `($${p + 1}::bigint, $${p + 2}::text, $${p + 3}::vector)`;
        });
        const r = await db.query(
          `INSERT INTO section_embeddings (section_id, model_slug, embedding) VALUES ${tuples.join(',')}
           ON CONFLICT (section_id, model_slug) DO NOTHING`, params);
        written += r.rowCount ?? 0;
      }
      console.log(`section_embeddings written via API fallback: ${written}`);
    }

    // ── post-ingest census ──
    const census = async (q: string, p: unknown[]) => (await db.query(q, p)).rows[0];
    console.log('── census ──');
    console.log(await census(`SELECT slug, status, license FROM sources WHERE slug = $1`, [slug]));
    console.log(await census(
      `SELECT (SELECT count(*)::int FROM sections WHERE source_id = $1) AS sections,
              (SELECT count(*)::int FROM section_embeddings se JOIN sections s ON s.id = se.section_id WHERE s.source_id = $1) AS section_embeddings,
              (SELECT count(*)::int FROM section_anchors sa JOIN sections s ON s.id = sa.section_id WHERE s.source_id = $1) AS anchors`,
      [srcId]));
    console.log(await census(
      `SELECT count(*)::int AS flat_embeddings FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = $1`, [slug]));
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
