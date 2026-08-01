// PD sermon ingest — anchor-recall gated (workorder Tier 3; the frozen Slice-0
// bar: stated-text recall ≥ 70% at chapter grain, K=3 uncited candidates).
//
//   DATABASE_URL=<dev owner> DEEPINFRA_API_KEY=<key> npx tsx src/ingest/ingest-sermon.ts \
//     --txt=data/raw/sermons/spurgeon-talks-to-farmers.txt --slug=spurgeon-talks-to-farmers [--measure-only]
//
// Format (Gutenberg Spurgeon collections): each sermon is an ALL-CAPS title
// line, a quoted stated text ending `--BOOK C:V[-V].`, then the body. The
// stated text is ground truth for the recall gate; anchors written to
// section_anchors are (a) the stated text and (b) explicit citations found in
// the body — both verbatim-grounded. The uncited shingle channel is used ONLY
// for the recall measurement, never to write anchors (a shingle hit is
// probabilistic; an anchor row is a fact).
//
// Sermons land in the 006 model: source_type='sermon', status='staged', chunks
// ≤ EMBED_MAX embedded whole. NEVER served here — publish is the owner's gate.

import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseRef, scanReferences } from '../bible/ref-parse.js';
import { shingleHashSetOcr } from './resource-textmatch.js';
import { isExplicitCitation } from './ingest-historian.js';
import { isAllowedLicense } from './license-manifest.js';
import { assertDevOnlyTarget } from './dev-only-target.mjs';

const EMBED_MAX = 1800;
const MODEL_SLUG = 'bge-large-en-v1.5';
const RECALL_BAR = 0.7;
// The frozen Slice-0 channel (scripts/slice0-anchor-recall.mts): a verse counts
// as "quoted" when it has ≥ K distinctive 6-word shingles and ≥1 appears in the
// body — ALL such verses are candidate anchors, not a top-N.
const K_MIN_VERSE_SHINGLES = 3;
const NGRAM = 6; // 6-word shingles — a distinctive verbatim quote (slice0)

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}
const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

interface Sermon { title: string; statedRef: string; statedRanges: Array<{ start: number; end: number }>; body: string }

export function parseSermons(txt: string): Sermon[] {
  // Normalize line endings; work on the body between Gutenberg markers.
  const t = txt.replace(/\r\n/g, '\n');
  const startM = t.match(/\*\*\* START OF [^\n]+\*\*\*/);
  const endM = t.match(/\*\*\* END OF [^\n]+\*\*\*/);
  const body = t.slice(startM ? startM.index! + startM[0].length : 0, endM ? endM.index! : t.length);

  // A sermon starts at an ALL-CAPS title line followed (within ~12 lines) by a
  // quote block whose close is `--BOOK 1:2[-3].`
  const out: Sermon[] = [];
  const lines = body.split('\n');
  const statedRe = /--([1-3]?\s?[A-Z][A-Z .]+?)\s+([0-9]+(?::[0-9]+(?:-[0-9]+)?)?)\.?\s*$/;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!.trim();
    const isTitle = /^[A-Z][A-Z .,'’&-]{6,}$/.test(line) && !/^TABLE OF CONTENTS/.test(line);
    if (!isTitle) { i++; continue; }
    // find the stated-text close within the next 15 lines
    let stated: { ref: string; at: number } | null = null;
    for (let j = i + 1; j < Math.min(i + 16, lines.length); j++) {
      const m = lines[j]!.trim().match(statedRe);
      if (m) { stated = { ref: `${m[1]!.trim()} ${m[2]}`, at: j }; break; }
    }
    if (!stated) { i++; continue; }
    // body runs to the next sermon title that itself has a stated text
    let end = lines.length;
    for (let j = stated.at + 1; j < lines.length; j++) {
      const l = lines[j]!.trim();
      if (/^[A-Z][A-Z .,'’&-]{6,}$/.test(l)) {
        for (let k = j + 1; k < Math.min(j + 16, lines.length); k++) {
          if (statedRe.test(lines[k]!.trim())) { end = j; break; }
        }
        if (end === j) break;
      }
    }
    const outcome = parseRef(stated.ref.replace(/\s+/g, ' ').toLowerCase());
    const ranges = outcome.ok ? outcome.ref.ranges : [];
    out.push({
      title: line.replace(/\.$/, ''),
      statedRef: stated.ref,
      statedRanges: ranges,
      body: lines.slice(stated.at + 1, end).join('\n').replace(/\s+/g, ' ').trim(),
    });
    i = end;
  }
  return out;
}

// ── the Slice-0 uncited channel (measurement only) ──
interface KjvIndex { shingleToVerses: Map<number, number[]>; shinglesPerVerse: Map<number, number> }
function buildKjvIndex(): KjvIndex {
  const dir = 'web/public/bible/kjv';
  const shingleToVerses = new Map<number, number[]>();
  const shinglesPerVerse = new Map<number, number>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as { book: number; chapters: Record<string, { verse: number; text: string }[]> };
    for (const [ch, vs] of Object.entries(j.chapters)) {
      for (const v of vs) {
        const verseId = j.book * 1_000_000 + Number(ch) * 1000 + v.verse;
        const sh = shingleHashSetOcr(v.text, NGRAM);
        shinglesPerVerse.set(verseId, sh.size);
        for (const h of sh) {
          const list = shingleToVerses.get(h) ?? [];
          list.push(verseId);
          shingleToVerses.set(h, list);
        }
      }
    }
  }
  return { shingleToVerses, shinglesPerVerse };
}

function uncitedMatches(body: string, idx: KjvIndex): number[] {
  const hits = new Map<number, number>();
  for (const h of shingleHashSetOcr(body, NGRAM)) {
    const ids = idx.shingleToVerses.get(h);
    if (!ids) continue;
    for (const id of ids) hits.set(id, (hits.get(id) ?? 0) + 1);
  }
  return [...hits.entries()]
    .filter(([id, n]) => (idx.shinglesPerVerse.get(id) ?? 0) >= K_MIN_VERSE_SHINGLES && n >= 1)
    .map(([id]) => id);
}

const chapterOf = (verseId: number) => Math.floor(verseId / 1000);

// slice0's roman-chapter normalization: 19th-c. sermons cite "Psalm civ. 14" —
// convert to "Psalm 104:14" so scanReferences can parse (scripts/slice0-anchor-recall.mts).
const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
function romanToInt(s: string): number | null {
  let n = 0;
  const t = s.toLowerCase();
  for (let i = 0; i < t.length; i++) {
    const c = ROMAN[t[i]!];
    if (!c) return null;
    const nx = ROMAN[t[i + 1]!] ?? 0;
    n += c < nx ? -c : c;
  }
  return n || null;
}
function romaniseRefs(text: string): string {
  return text.replace(/\b([1-3]?\s?[A-Za-z]{3,})\s+([ivxlc]{1,6})\.\s*(\d{1,3})/g, (m, book, rom, verse) => {
    const c = romanToInt(rom as string);
    return c ? `${book} ${c}:${verse}` : (m as string);
  });
}

async function main() {
  const txtPath = arg('--txt');
  const slug = arg('--slug');
  const measureOnly = process.argv.includes('--measure-only');
  if (!txtPath || !slug) throw new Error('usage: ingest-sermon.ts --txt=<f> --slug=<source-slug> [--measure-only]');

  const sermons = parseSermons(readFileSync(txtPath, 'utf8'));
  const withStated = sermons.filter((s) => s.statedRanges.length > 0);
  console.log(`${sermons.length} sermons parsed, ${withStated.length} with a parseable stated text`);

  // ── the recall gate (frozen Slice-0 bar) ──
  const idx = buildKjvIndex();
  let hit = 0;
  for (const s of withStated) {
    const statedChapters = new Set(s.statedRanges.map((r) => chapterOf(r.start)));
    const anchors = new Set<number>();
    for (const ref of scanReferences(romaniseRefs(s.body))) for (const r of ref.ranges) anchors.add(chapterOf(r.start));
    for (const id of uncitedMatches(s.body, idx)) anchors.add(chapterOf(id));
    if ([...statedChapters].some((c) => anchors.has(c))) hit++;
    else console.log(`  MISS: "${s.title}" stated ${s.statedRef}`);
  }
  const recall = withStated.length ? hit / withStated.length : 0;
  console.log(`anchor recall (chapter grain, slice0 channel): ${hit}/${withStated.length} = ${(100 * recall).toFixed(1)}% (bar ${100 * RECALL_BAR}%)`);
  if (recall < RECALL_BAR) {
    throw new Error(`FAIL CLOSED: anchor recall ${(100 * recall).toFixed(1)}% < ${100 * RECALL_BAR}% — quarantine, do not stage as searchable`);
  }
  if (measureOnly) return;

  const manifest = JSON.parse(readFileSync('ingest/sources.config.json', 'utf8')) as Array<Record<string, unknown>>;
  const entry = manifest.find((e) => e.slug === slug);
  if (!entry) throw new Error(`FAIL CLOSED: slug "${slug}" has no manifest entry`);
  if (entry.source_type !== 'sermon') throw new Error(`manifest entry ${slug} is not source_type=sermon`);
  if (!isAllowedLicense(entry.license)) throw new Error(`FAIL CLOSED: ${slug} license "${String(entry.license)}" not in the allowed set`);
  if (typeof entry.quarantine === 'string' && entry.quarantine.trim()) throw new Error(`FAIL CLOSED: ${slug} is quarantined in the manifest: ${entry.quarantine}`);

  const dbUrl = (localEnv('DATABASE_URL') ?? '').replace(/^"|"$/g, '');
  const key = localEnv('DEEPINFRA_API_KEY');
  if (!dbUrl || !key) throw new Error('DATABASE_URL and DEEPINFRA_API_KEY required');
  const branch = process.env.DATABASE_URL ? process.env.NEON_BRANCH : localEnv('NEON_BRANCH');
  // Label AND endpoint, not the label alone — a prod URL with a stale NEON_BRANCH=dev used to
  // pass straight through to a DELETE (2026-08-02 deep audit, C5).
  assertDevOnlyTarget(localEnv('DATABASE_URL')?.replace(/^"|"$/g, ''), branch, 'the sermon re-ingest (it DELETEs the work sections)');

  const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const prior = await db.query<{ status: string }>(`SELECT status FROM sources WHERE slug=$1`, [slug]);
    if (prior.rows[0]?.status === 'published') {
      throw new Error(`STOP: ${slug} is PUBLISHED — re-ingest would replace owner-approved content; unpublish first`);
    }
    await db.query('BEGIN');
    const src = await db.query<{ id: string }>(
      `INSERT INTO sources (slug, title, author, author_died, year_written, source_type, tradition, era, license, provenance, status)
       VALUES ($1,$2,$3,$4,$5,'sermon',$6,$7,$8,$9,'staged')
       ON CONFLICT (slug) DO UPDATE SET provenance=EXCLUDED.provenance RETURNING id`,
      [slug, entry.title, entry.author, entry.author_died ?? null, entry.year_written ?? null,
        entry.tradition, entry.era, entry.license,
        JSON.stringify({ ...(entry.provenance as object), anchor_recall: { hit, of: withStated.length, pct: Math.round(1000 * recall) / 10, method: `explicit + uncited 6-gram (K=${K_MIN_VERSE_SHINGLES} min shingles) vs KJV, chapter grain — the frozen slice0 channel`, measured: new Date().toISOString().slice(0, 10) } })],
    );
    const sourceId = src.rows[0]!.id;
    await db.query(`DELETE FROM section_embeddings WHERE section_id IN (SELECT id FROM sections WHERE source_id=$1)`, [sourceId]);
    await db.query(`DELETE FROM section_history_anchors WHERE section_id IN (SELECT id FROM sections WHERE source_id=$1)`, [sourceId]);
    await db.query(`DELETE FROM section_anchors WHERE section_id IN (SELECT id FROM sections WHERE source_id=$1)`, [sourceId]);
    await db.query(`DELETE FROM sections WHERE source_id=$1`, [sourceId]);

    const chunkRows: Array<{ id?: string; heading: string; body: string; anchors: Array<{ start: number; end: number }> }> = [];
    for (const s of sermons) {
      // explicit body citations only, book-name-filtered like the historian path
      const explicit = scanReferences(romaniseRefs(s.body))
        .filter((ref) => isExplicitCitation(ref.display, romaniseRefs(s.body)))
        .flatMap((r) => r.ranges);
      // chunk ≤ EMBED_MAX at sentence boundaries, with a hard split for
      // pathological unbroken runs (deep-audit M2 — no silent oversize chunks)
      const chunks: string[] = [];
      let buf = '';
      for (const sent of s.body.split(/(?<=[.!?])\s+/)) {
        if (buf && buf.length + sent.length + 1 > EMBED_MAX) { chunks.push(buf); buf = sent; }
        else buf = buf ? `${buf} ${sent}` : sent;
        while (buf.length > EMBED_MAX) { chunks.push(buf.slice(0, EMBED_MAX)); buf = buf.slice(EMBED_MAX); }
      }
      if (buf) chunks.push(buf);
      for (const c of chunks) {
        if (c.length > EMBED_MAX) throw new Error(`contract breach: sermon chunk ${c.length} > ${EMBED_MAX}`);
      }
      chunks.forEach((body, ci) => {
        chunkRows.push({
          heading: `${s.title} — ${s.statedRef}${chunks.length > 1 ? ` (${ci + 1}/${chunks.length})` : ''}`,
          body,
          anchors: ci === 0 ? [...s.statedRanges, ...explicit] : [],
        });
      });
    }
    for (const r of chunkRows) {
      const res = await db.query<{ id: string }>(
        `INSERT INTO sections (source_id, ordinal, heading, body) VALUES ($1,$2,$3,$4) RETURNING id`,
        [sourceId, chunkRows.indexOf(r) + 1, r.heading, r.body],
      );
      r.id = res.rows[0]!.id;
      for (const a of r.anchors) {
        await db.query(`INSERT INTO section_anchors (section_id, verse_id_start, verse_id_end) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [r.id, a.start, a.end]);
      }
    }
    await db.query('COMMIT');
    console.log(`${slug}: ${chunkRows.length} sections staged (source ${sourceId})`);

    // embed whole
    const batches: typeof chunkRows[] = [];
    for (let i = 0; i < chunkRows.length; i += 64) batches.push(chunkRows.slice(i, i + 64));
    let done = 0;
    for (const b of batches) {
      const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: 'BAAI/bge-large-en-v1.5', input: b.map((x) => x.body), encoding_format: 'float' }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) throw new Error(`embed ${res.status}`);
      const vecs = ((await res.json()) as { data: { embedding: number[] }[] }).data;
      const params: unknown[] = [];
      const tuples = b.map((x, j) => { params.push(x.id, MODEL_SLUG, JSON.stringify(vecs[j]!.embedding)); return `($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3}::vector)`; });
      await db.query(`INSERT INTO section_embeddings (section_id, model_slug, embedding) VALUES ${tuples.join(',')} ON CONFLICT DO NOTHING`, params);
      done += b.length;
    }
    console.log(`embedded ${done}/${chunkRows.length} sermon chunks whole`);
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
