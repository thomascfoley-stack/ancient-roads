// The ONE writer every register adapter uses (seed + Phase 3 adapters).
// Writes a work into: (1) the SERVED flat embeddings store (whole-chunk vectors,
// metadata carries work/register/anchors), (2) the 006 `sources` provenance/
// staging registry, (3) the static reader corpus for verse-ANCHORED entries.
// Auto-publish only via the served lists in routing.ts/legal-corpus.ts — this
// writer marks sources.status per the manifest serve flag + the authorized tier.

import pg from 'pg';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { BOOK_SLUGS } from './source-id.js';
import { isAllowedLicense } from './license-manifest.js';

export const REGISTER_EMBED_MAX = 1800; // whole-chunk budget; MAX_EMBED_CHARS(1000) never fires here
const MODEL = 'BAAI/bge-large-en-v1.5';

export interface RegisterSection {
  heading?: string;
  body: string;
  anchors?: Array<{ verseIdStart: number; verseIdEnd: number }>;
}
export interface RegisterWork {
  slug: string;
  title: string;
  author: string;
  authorDied?: number;
  year: number;
  sourceType: string; // manifest source_type: sermon|father|theology|confession|lexicon|commentary|hymn|poetry
  register: string;   // 'prose' | 'hymn' | 'poetry' (metadata label)
  tradition: string;
  era: string;
  license: string;
  attribution?: string; // CC-BY carry-through
  paraphrase?: boolean; // metrical psalters / Watts Imitated — never rendered as Scripture
  url: string;
  edition: string;
  publish: boolean; // owner-authorized clean tier → 'published' sources row; else 'staged'
  sections: RegisterSection[];
}

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

async function embedWhole(texts: string[], key: string): Promise<number[][]> {
  for (const t of texts) if (t.length > REGISTER_EMBED_MAX) throw new Error(`chunk ${t.length} > ${REGISTER_EMBED_MAX} — contract breach`);
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, input: texts, encoding_format: 'float' }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { data: { embedding: number[] }[] }).data.map((d) => d.embedding);
}

// Chunk a section body at sentence bounds under the budget (hard split fallback).
export function chunkWhole(body: string, max = REGISTER_EMBED_MAX): string[] {
  if (body.length <= max) return [body];
  const out: string[] = [];
  let buf = '';
  for (const sent of body.split(/(?<=[.!?])\s+|\n\n+/)) {
    if (buf && buf.length + sent.length + 1 > max) { out.push(buf); buf = sent; }
    else buf = buf ? `${buf} ${sent}` : sent;
    while (buf.length > max) { out.push(buf.slice(0, max)); buf = buf.slice(max); }
  }
  if (buf) out.push(buf);
  return out;
}

export async function writeRegisterWork(work: RegisterWork): Promise<{ embedded: number; staticEntries: number }> {
  if (!isAllowedLicense(work.license)) throw new Error(`FAIL CLOSED: ${work.slug} license "${work.license}"`);
  const dbUrl = (localEnv('DATABASE_URL') ?? '').replace(/^"|"$/g, '');
  const key = localEnv('DEEPINFRA_API_KEY');
  if (!dbUrl || !key) throw new Error('DATABASE_URL and DEEPINFRA_API_KEY required');
  const branch = process.env.DATABASE_URL ? process.env.NEON_BRANCH : localEnv('NEON_BRANCH');
  if (branch !== 'dev' && branch !== 'test') throw new Error(`STOP: NEON_BRANCH="${branch ?? '(unset)'}" must be dev|test`);

  const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const prior = await db.query<{ status: string }>(`SELECT status FROM sources WHERE slug=$1`, [work.slug]);
    if (prior.rows[0]?.status === 'published' && !work.publish) {
      throw new Error(`STOP: ${work.slug} already published; refusing staged re-ingest`);
    }
    // (2) provenance/staging registry
    await db.query(
      `INSERT INTO sources (slug, title, author, author_died, year_written, source_type, tradition, era, license, provenance, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (slug) DO UPDATE SET provenance=EXCLUDED.provenance, status=EXCLUDED.status`,
      [work.slug, work.title, work.author, work.authorDied ?? null, work.year, work.sourceType,
        work.tradition, work.era, work.license,
        JSON.stringify({ url: work.url, edition: work.edition, year: work.year, retrieved_at: new Date().toISOString().slice(0, 10), attribution: work.attribution, register: work.register }),
        work.publish ? 'published' : 'staged'],
    );

    // (1) served flat store — whole-chunk vectors, idempotent by source_id
    interface Row { sourceId: string; content: string; meta: Record<string, unknown> }
    const rows: Row[] = [];
    work.sections.forEach((s, si) => {
      const chunks = chunkWhole(s.heading ? `${s.heading}\n${s.body}` : s.body);
      chunks.forEach((content, ci) => {
        const a = s.anchors?.[0];
        rows.push({
          sourceId: `${work.sourceType}:${work.slug}:${si + 1}${chunks.length > 1 ? `.${ci + 1}` : ''}`,
          content,
          meta: {
            author: work.author, year: work.year, tradition: work.tradition,
            sourceTitle: work.title, sourceUrl: work.url, work: work.slug,
            register: work.sourceType === 'hymn' ? 'hymn' : work.sourceType === 'poetry' ? 'poetry' : 'prose',
            heading: s.heading, verseId: a?.verseIdStart ?? 0, verseEnd: a?.verseIdEnd ?? 0,
            paraphrase: work.paraphrase || undefined, attribution: work.attribution, model: MODEL,
          },
        });
      });
    });
    let embedded = 0;
    for (let i = 0; i < rows.length; i += 64) {
      const b = rows.slice(i, i + 64);
      const vecs = await embedWhole(b.map((r) => r.content), key);
      const params: unknown[] = [];
      const tuples = b.map((r, j) => {
        const p = j * 5;
        params.push(work.sourceType, r.sourceId, r.content, JSON.stringify(vecs[j]!), JSON.stringify(r.meta));
        return `(NULL, $${p + 1}, $${p + 2}, 0, $${p + 3}, $${p + 4}::vector, $${p + 5}::jsonb)`;
      });
      const res = await db.query(
        `INSERT INTO embeddings (user_id, source_type, source_id, chunk_index, content, embedding, metadata)
         VALUES ${tuples.join(',')} ON CONFLICT (source_type, source_id, chunk_index) DO NOTHING`, params,
      );
      embedded += res.rowCount ?? 0;
    }

    // (3) static reader corpus — verse-anchored sections only (the reader is verse-keyed)
    let staticEntries = 0;
    const byChapter = new Map<string, Array<Record<string, unknown>>>();
    for (const s of work.sections) {
      const a = s.anchors?.[0];
      if (!a) continue;
      const book = Math.floor(a.verseIdStart / 1e6), chapter = Math.floor((a.verseIdStart % 1e6) / 1000);
      if (!BOOK_SLUGS[book]) continue;
      const k = `${BOOK_SLUGS[book]}/${chapter}`;
      const list = byChapter.get(k) ?? [];
      list.push({
        verseStart: a.verseIdStart % 1000, verseEnd: a.verseIdEnd % 1000,
        author: work.author, year: work.year, tradition: work.tradition,
        sourceTitle: work.title, sourceUrl: work.url, text: s.heading ? `${s.heading}\n\n${s.body}` : s.body,
        work: work.slug, register: work.sourceType, paraphrase: work.paraphrase || undefined,
      });
      byChapter.set(k, list);
    }
    for (const [k, entries] of byChapter) {
      const p = path.join('web/public/commentaries', `${k}.json`);
      if (!existsSync(p)) continue;
      const j = JSON.parse(readFileSync(p, 'utf8')) as { book: number; chapter: number; entries: Array<Record<string, unknown>> };
      const kept = j.entries.filter((e) => e.work !== work.slug);
      kept.push(...entries);
      writeFileSync(p, JSON.stringify({ book: j.book, chapter: j.chapter, entries: kept }));
      staticEntries += entries.length;
    }
    return { embedded, staticEntries };
  } finally {
    await db.end();
  }
}
