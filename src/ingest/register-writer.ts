// The ONE writer every register adapter uses (seed + Phase 3 adapters).
// Writes a work into: (1) the SERVED flat embeddings store (whole-chunk vectors,
// metadata carries work/register/anchors), (2) the 006 `sources` provenance/
// staging registry, (3) the static reader corpus for verse-ANCHORED entries.
// Auto-publish only via the served lists in routing.ts/legal-corpus.ts — this
// writer marks sources.status per the manifest serve flag + the authorized tier.

import pg from 'pg';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { BOOK_SLUGS } from './source-id.js';
import { isAllowedLicense } from './license-manifest.js';

// Whole-chunk budget. 1200 chars keeps even token-DENSE text (hymns, Greek/
// Hebrew) under bge-large's 512-token ceiling — 1800 overflowed on Watts
// ("513 input tokens"). Sections split at this bound are still WHOLE (no head
// truncation — MAX_EMBED_CHARS never fires); we just make more, smaller chunks,
// which is exactly "chunk under the embed budget" (INGESTION_ADAPTERS.md).
export const REGISTER_EMBED_MAX = 1200;
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

// Shared env/branch guard for the loop + direct callers. Fails closed unless
// NEON_BRANCH (from the same source as DATABASE_URL) is dev/test.
export function assertDevBranch(): { dbUrl: string; key: string } {
  const dbUrl = (localEnv('DATABASE_URL') ?? '').replace(/^"|"$/g, '');
  const key = localEnv('DEEPINFRA_API_KEY');
  if (!dbUrl || !key) throw new Error('DATABASE_URL and DEEPINFRA_API_KEY required');
  const branch = process.env.DATABASE_URL ? process.env.NEON_BRANCH : localEnv('NEON_BRANCH');
  if (branch !== 'dev' && branch !== 'test') throw new Error(`STOP: NEON_BRANCH="${branch ?? '(unset)'}" from the same source as DATABASE_URL must be dev|test`);
  return { dbUrl, key };
}

class EmbedError extends Error { constructor(msg: string, readonly status: number, readonly tokenLimit: boolean) { super(msg); } }
async function embedRaw(texts: string[], key: string): Promise<number[][]> {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, input: texts, encoding_format: 'float' }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const bodyText = await res.text();
    throw new EmbedError(`embed ${res.status}: ${bodyText}`, res.status, /context length|maximum input length|input tokens/i.test(bodyText));
  }
  return ((await res.json()) as { data: { embedding: number[] }[] }).data.map((d) => d.embedding);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Embed one text with correct error handling: a token-length 400 → adaptively
// shorten THIS text (never a corpus-wide truncation); a transient error (429/5xx/
// timeout) → back off and RETRY the same text (do NOT shrink — that was the bug
// that produced empty vectors). If a real vector still can't be obtained, THROW
// (the work quarantines with a clear reason) — never insert a zero-dimension vector.
async function embedOne(text: string, key: string): Promise<number[]> {
  let len = text.length;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const v = (await embedRaw([text.slice(0, len)], key))[0];
      if (v && v.length > 0) return v;
      throw new Error('empty embedding returned');
    } catch (e) {
      if (e instanceof EmbedError && e.tokenLimit) { len = Math.floor(len * 0.8); if (len < 100) break; }
      else await sleep(500 * (attempt + 1)); // transient — back off, same length
    }
  }
  throw new Error(`could not embed a ${text.length}-char section after retries`);
}
// Batch fast-path; on WHOLESALE batch failure, fall back to per-text embedOne.
async function embedWhole(texts: string[], key: string): Promise<number[][]> {
  try {
    const v = await embedRaw(texts, key);
    if (v.length === texts.length && v.every((x) => x.length > 0)) return v;
  } catch { /* fall through to per-text */ }
  const out: number[][] = [];
  for (const t of texts) out.push(await embedOne(t, key));
  return out;
}

// Chunk a section body at sentence bounds under the budget (hard split fallback).
export function chunkWhole(body: string, max = REGISTER_EMBED_MAX): string[] {
  if (body.length <= max) return [body];
  const out: string[] = [];
  let buf = '';
  for (const sent of body.split(/(?<=[.!?])\s+|\n\n+/)) {
    if (buf && buf.length + sent.length + 1 > max) { out.push(buf); buf = sent; }
    else buf = buf ? `${buf} ${sent}` : sent;
    // over-budget single block: split at the LAST whitespace before max, never
    // mid-word (hymn stanzas have no sentence punctuation and used to hard-slice)
    while (buf.length > max) {
      const cut = buf.lastIndexOf(' ', max) > max * 0.5 ? buf.lastIndexOf(' ', max)
        : buf.lastIndexOf('\n', max) > max * 0.5 ? buf.lastIndexOf('\n', max) : max;
      out.push(buf.slice(0, cut).trimEnd());
      buf = buf.slice(cut).trimStart();
    }
  }
  if (buf) out.push(buf);
  return out;
}

// Remove every trace of a work from the served embeddings AND the static reader
// corpus. Makes re-ingest replacement-idempotent (ON CONFLICT DO NOTHING alone
// keeps stale rows when a work's parse changes — A6 audit) and is the unserve
// path for quarantined works. DB rows are recoverable by re-running the adapter.
export async function deleteWork(db: pg.Client, slug: string): Promise<{ dbRows: number; staticRemoved: number }> {
  const del = await db.query(`DELETE FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = $1`, [slug]);
  // SECTIONS TOO, and in foreign-key order. This function is the replacement-idempotency
  // guarantee ("a changed parse fully replaces, never interleaves with, the old ingest") and it
  // did not cover the shelf store, because nothing on this path wrote the shelf store. Now that
  // writeRegisterWork does, omitting the delete would make every re-ingest duplicate the work's
  // entire table of contents.
  await db.query(
    `DELETE FROM section_anchors WHERE section_id IN
       (SELECT s.id FROM sections s JOIN sources src ON src.id = s.source_id WHERE src.slug = $1)`, [slug]);
  await db.query(
    `DELETE FROM section_embeddings WHERE section_id IN
       (SELECT s.id FROM sections s JOIN sources src ON src.id = s.source_id WHERE src.slug = $1)`, [slug]);
  await db.query(
    `DELETE FROM sections WHERE source_id IN (SELECT id FROM sources WHERE slug = $1)`, [slug]);
  let staticRemoved = 0;
  const root = 'web/public/commentaries';
  if (existsSync(root)) {
    for (const book of readdirSync(root)) {
      const dir = path.join(root, book);
      let files: string[] = [];
      try { files = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { continue; }
      for (const f of files) {
        const p = path.join(dir, f);
        const j = JSON.parse(readFileSync(p, 'utf8')) as { book: number; chapter: number; entries: Array<Record<string, unknown>> };
        if (!j.entries?.some((e) => e.work === slug)) continue;
        const kept = j.entries.filter((e) => e.work !== slug);
        staticRemoved += j.entries.length - kept.length;
        writeFileSync(p, JSON.stringify({ ...j, entries: kept }));
      }
    }
  }
  return { dbRows: del.rowCount ?? 0, staticRemoved };
}

export async function writeRegisterWork(work: RegisterWork): Promise<{ embedded: number; staticEntries: number }> {
  if (!isAllowedLicense(work.license)) throw new Error(`FAIL CLOSED: ${work.slug} license "${work.license}"`);
  const dbUrl = (localEnv('DATABASE_URL') ?? '').replace(/^"|"$/g, '');
  const key = localEnv('DEEPINFRA_API_KEY');
  if (!dbUrl || !key) throw new Error('DATABASE_URL and DEEPINFRA_API_KEY required');
  const branch = process.env.DATABASE_URL ? process.env.NEON_BRANCH : localEnv('NEON_BRANCH');
  if (branch !== 'dev' && branch !== 'test') throw new Error(`STOP: NEON_BRANCH="${branch ?? '(unset)'}" must be dev|test`);
  // The label alone is self-attested — also require the URL to point at a
  // known non-prod endpoint (dev=ep-tiny-hat / test), so a prod DATABASE_URL
  // with a stale NEON_BRANCH=dev cannot pass (A6 audit).
  if (!/ep-tiny-hat|localhost|127\.0\.0\.1/.test(dbUrl)) throw new Error(`STOP: DATABASE_URL endpoint is not the dev branch (expected ep-tiny-hat)`);

  const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const prior = await db.query<{ status: string }>(`SELECT status FROM sources WHERE slug=$1`, [work.slug]);
    if (prior.rows[0]?.status === 'published' && !work.publish) {
      throw new Error(`STOP: ${work.slug} already published; refusing staged re-ingest`);
    }
    // (0) replacement-idempotency: remove the work's previous rows/entries so a
    // changed parse fully replaces (never interleaves with) the old ingest
    const wiped = await deleteWork(db, work.slug);
    if (wiped.dbRows || wiped.staticRemoved) console.log(`  ↻ ${work.slug}: replaced prior ingest (${wiped.dbRows} rows, ${wiped.staticRemoved} static entries)`);
    // (2) provenance/staging registry — status='ingesting' until the write
    // SUCCEEDS; publish/staged is stamped at the end (a crash mid-write must
    // never leave a published shell — the K&D 3-row lesson, A6 audit)
    await db.query(
      `INSERT INTO sources (slug, title, author, author_died, year_written, source_type, tradition, era, license, provenance, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (slug) DO UPDATE SET provenance=EXCLUDED.provenance, status=EXCLUDED.status`,
      [work.slug, work.title, work.author, work.authorDied ?? null, work.year, work.sourceType,
        work.tradition, work.era, work.license,
        JSON.stringify({ url: work.url, edition: work.edition, year: work.year, retrieved_at: new Date().toISOString().slice(0, 10), attribution: work.attribution, register: work.register }),
        'ingesting'],
    );

    // (1) served flat store — whole-chunk vectors, idempotent by source_id
    interface Row { sourceId: string; content: string; meta: Record<string, unknown> }
    const rows: Row[] = [];
    work.sections.forEach((s, si) => {
      const chunks = chunkWhole(s.heading ? `${s.heading}\n${s.body}` : s.body);
      chunks.forEach((content, ci) => {
        if (content.trim().length < 20) return; // junk-fragment floor (A6: ~1,300 sub-20-char rows)
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
            license: work.license,
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

    // (2b) THE SHELF STORE — `sections`, which is what the Book Reader and the catalog read.
    //
    // THIS WAS MISSING, AND ITS ABSENCE WAS THE DEFECT, not a bug in any one run. This function
    // wrote three stores — the `sources` row, the flat retrieval `embeddings`, and the static
    // per-chapter JSON — and never the one the shelf is built on. `sections` was only ever
    // written by four bespoke scripts (migrate-sections-slice, ingest-sermon, ingest-historian,
    // repoint-sections-work), none of them on the adapter path. So EVERY work ingested through
    // the adapter loop got a `sources` row stamped 'staged' and was permanently invisible: no
    // table of contents, nothing to open, and nothing for corpus-copy.mjs to move to production,
    // because that reads by slug from `sections`. Measured on ryle-expository 2026-08-02: 2,040
    // flat rows, 1 sources row marked staged, 0 sections.
    //
    // ONE RegisterSection = ONE section = ONE unit. The adapter has already decided what a unit
    // of this work is (a sermon, a dictionary entry, a passage of commentary); the chunking above
    // is a retrieval concern and belongs only to the flat store. So `unit_ordinal` equals
    // `ordinal` here, which is the honest statement that this ingest did not split units — unlike
    // the older section writers, whose 33-chunks-per-sermon shape is why unit_ordinal exists.
    //
    // `source_url` is deliberately NOT written: it is migration 031 and exists on production but
    // not on dev, so naming it here would make this function fail on the only branch it is
    // allowed to run against.
    const srcId = (await db.query<{ id: string }>(`SELECT id FROM sources WHERE slug = $1`, [work.slug])).rows[0]!.id;
    let sectionsWritten = 0;
    for (let i = 0; i < work.sections.length; i += 500) {
      const batch = work.sections.slice(i, i + 500);
      const params: unknown[] = [];
      const tuples = batch.map((s, j) => {
        const ord = i + j + 1;
        const p = j * 4;
        params.push(srcId, ord, s.heading ?? null, s.body);
        return `($${p + 1}::bigint, $${p + 2}::int, $${p + 3}::text, $${p + 4}::text, $${p + 2}::int)`;
      });
      const r = await db.query(
        `INSERT INTO sections (source_id, ordinal, heading, body, unit_ordinal)
         VALUES ${tuples.join(',')} ON CONFLICT (source_id, ordinal) DO NOTHING`, params);
      sectionsWritten += r.rowCount ?? 0;
    }
    // the verse join, from the same anchors the flat store and the static entries use
    let anchorsWritten = 0;
    for (let i = 0; i < work.sections.length; i += 500) {
      const batch = work.sections.slice(i, i + 500);
      const params: unknown[] = [];
      const tuples: string[] = [];
      batch.forEach((s, j) => {
        const a = s.anchors?.[0];
        if (!a) return;
        const p = params.length;
        params.push(srcId, i + j + 1, a.verseIdStart, a.verseIdEnd);
        tuples.push(`((SELECT id FROM sections WHERE source_id = $${p + 1}::bigint AND ordinal = $${p + 2}::int), $${p + 3}::int, $${p + 4}::int)`);
      });
      if (tuples.length === 0) continue;
      const r = await db.query(
        `INSERT INTO section_anchors (section_id, verse_id_start, verse_id_end)
         VALUES ${tuples.join(',')} ON CONFLICT DO NOTHING`, params);
      anchorsWritten += r.rowCount ?? 0;
    }
    console.log(`  → ${work.slug}: ${sectionsWritten} section(s), ${anchorsWritten} anchor(s) on the shelf`);

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
      // The reader entry is filed under the START chapter. `verseEnd % 1000` on a
      // cross-chapter anchor (start Gen 3:20, end Gen 4:2) yielded verseEnd=2 < 20
      // — a broken range in the wrong chapter (A6 line-by-line 2026-07-17). Cap a
      // cross-chapter/-book range at the rest of the start chapter (999).
      const sameChapter = Math.floor(a.verseIdStart / 1000) === Math.floor(a.verseIdEnd / 1000);
      list.push({
        verseStart: a.verseIdStart % 1000, verseEnd: sameChapter ? a.verseIdEnd % 1000 : 999,
        author: work.author, year: work.year, tradition: work.tradition,
        sourceTitle: work.title, sourceUrl: work.url, text: s.heading ? `${s.heading}\n\n${s.body}` : s.body,
        work: work.slug, register: work.sourceType, paraphrase: work.paraphrase || undefined,
        license: work.license, // CC BY(-SA) works must carry attribution to the UI
      });
      byChapter.set(k, list);
    }
    for (const [k, entries] of byChapter) {
      const p = path.join('web/public/commentaries', `${k}.json`);
      const [bookSlug, chStr] = k.split('/');
      // create missing chapter files instead of silently dropping the entries
      const j = existsSync(p)
        ? (JSON.parse(readFileSync(p, 'utf8')) as { book: number; chapter: number; entries: Array<Record<string, unknown>> })
        : { book: Object.entries(BOOK_SLUGS).find(([, s]) => s === bookSlug) ? Number(Object.entries(BOOK_SLUGS).find(([, s]) => s === bookSlug)![0]) : 0, chapter: Number(chStr), entries: [] as Array<Record<string, unknown>> };
      mkdirSync(path.dirname(p), { recursive: true });
      const kept = j.entries.filter((e) => e.work !== work.slug);
      kept.push(...entries);
      writeFileSync(p, JSON.stringify({ book: j.book, chapter: j.chapter, entries: kept }));
      staticEntries += entries.length;
    }
    // (4) FAIL CLOSED ON AN UNREADABLE WORK, then stamp the real status.
    //
    // This is the guard whose absence made the missing shelf-write silent for as long as it
    // existed. `status` is the app's word for "this work is real": 'staged' means complete and
    // awaiting a publish decision, and the publish flip will happily promote it. A row that says
    // 'staged' with zero sections is a work the catalog lists, the reader cannot open, and the
    // copier cannot move — and nothing anywhere said so. It reported success.
    //
    // Checked by RE-READING the database rather than trusting `sectionsWritten`, because the
    // number that matters is what is actually there: an ON CONFLICT DO NOTHING that skipped every
    // row would leave the counter looking plausible while the table stayed empty.
    const { rows: [shelf] } = await db.query<{ n: string }>(
      `SELECT count(*)::text n FROM sections WHERE source_id = $1`, [srcId]);
    if (Number(shelf!.n) === 0) {
      throw new Error(
        `STOP: ${work.slug} has 0 sections after ingest — it would be listed and unopenable. ` +
        `Left as status='ingesting' rather than stamped '${work.publish ? 'published' : 'staged'}'.`,
      );
    }
    await db.query(`UPDATE sources SET status=$2 WHERE slug=$1`, [work.slug, work.publish ? 'published' : 'staged']);
    return { embedded, staticEntries };
  } finally {
    await db.end();
  }
}
