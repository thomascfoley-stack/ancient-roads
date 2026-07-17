// Historian ingest — the FIRST content born in the 006 sources/sections model
// (HISTORY_RETRIEVAL_DESIGN §9 write-contract; migration 016 applied on dev).
//
//   DATABASE_URL=<dev owner> DEEPINFRA_API_KEY=<key> npx tsx src/ingest/ingest-historian.ts \
//     --jsonl=data/raw/historians/josephus.jsonl --slug=josephus-whiston [--limit-nodes=N]
//
// Contract, item by item:
//  1. targets sources/sections, source_type='historian' — never the flat embeddings table
//  2. migration 016 assumed applied (period_*, section_history_anchors, tsv heading fix)
//  3. chunks on the source's OWN tree headings (GenBook path), never blind windows
//  4. sections.heading = the tree path ("The War of the Jews — Book 6 — Chapter 4")
//  5. period_* normalized ONLY from verbatim "A.D. 325" / "325 B.C." forms — never inferred
//  6. every chunk embedded WHOLE: chunker caps at EMBED_MAX chars, asserted before the call
//  7. entity anchors: hand-seeded gazetteer × verbatim-presence check (history-gazetteer)
//  8. status='staged' (NEVER served — no history read path exists); verse anchors written
//     ONLY where scanReferences finds an explicit citation in the text (zero fabricated)
//
// Idempotent/resume-safe: re-running a slug deletes and re-inserts that source's rows.

import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { scanReferences } from '../bible/ref-parse.js';
import { verbatimAnchors } from './history-gazetteer.js';
import { isAllowedLicense } from './license-manifest.js';

const EMBED_MAX = 1800; // chars; ~450 tokens — bge-large's 512-token budget never truncates
const MODEL_SLUG = 'bge-large-en-v1.5';
const EMBED_BATCH = 64, CONCURRENCY = 6;

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}
const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

// A scanned reference counts as an EXPLICIT citation only if the book is named
// in the text next to a digit ("Isa. 53:7", "1 Samuel 12"). scanReferences over
// free prose false-positives on bare aliases — the deep-audit found "which is
// 3,000,000" parsed as Isaiah 3 via the `is` alias. Conservative: a genuine
// citation always names its book; anything else is dropped, never anchored.
export function isExplicitCitation(display: string, body: string): boolean {
  const bookPart = display.replace(/[\s ]+[0-9].*$/, ''); // "1 Samuel 12:1–5" → "1 Samuel"
  const lastWord = bookPart.split(/\s+/).pop() ?? bookPart;
  const stem = lastWord.slice(0, Math.min(3, lastWord.length));
  if (!stem) return false;
  const re = new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z]*\\.?\\s+[0-9ivxlc]`, 'i');
  return re.test(body);
}

// period_* from VERBATIM date expressions only (§5 of the contract).
export function verbatimPeriod(text: string): { start: number; end: number } | null {
  const years: number[] = [];
  for (const m of text.matchAll(/\bA\.?\s?D\.?\s+(\d{1,4})\b/gi)) years.push(Number(m[1]));
  for (const m of text.matchAll(/\b(\d{1,4})\s+B\.?\s?C\.?\b/gi)) years.push(-Number(m[1]));
  if (years.length === 0) return null;
  return { start: Math.min(...years), end: Math.max(...years) };
}

// sentence-boundary chunking under the embed budget; heading is NOT part of the
// body (it rides in sections.heading and the fixed tsv covers both).
export function chunkBody(text: string, max = EMBED_MAX): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let buf = '';
  for (const sent of text.split(/(?<=[.!?])\s+/)) {
    if (buf && buf.length + sent.length + 1 > max) { out.push(buf); buf = sent; }
    else buf = buf ? `${buf} ${sent}` : sent;
    while (buf.length > max) { out.push(buf.slice(0, max)); buf = buf.slice(max); } // pathological unbroken run
  }
  if (buf) out.push(buf);
  return out;
}

interface Node { path: string[]; content: string }

async function embedBatchWhole(texts: string[], key: string): Promise<number[][]> {
  for (const t of texts) {
    if (t.length > EMBED_MAX) throw new Error(`contract breach: chunk ${t.length} chars > ${EMBED_MAX} — truncation would fire`);
  }
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'BAAI/bge-large-en-v1.5', input: texts, encoding_format: 'float' }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { data: { embedding: number[] }[] }).data.map((d) => d.embedding);
}

async function main() {
  const jsonlPath = arg('--jsonl');
  const slug = arg('--slug');
  const limitNodes = Number(arg('--limit-nodes') ?? 0);
  if (!jsonlPath || !slug) throw new Error('usage: ingest-historian.ts --jsonl=<f> --slug=<source-slug> [--limit-nodes=N]');

  const manifest = JSON.parse(readFileSync('ingest/sources.config.json', 'utf8')) as Array<Record<string, unknown>>;
  const entry = manifest.find((e) => e.slug === slug);
  if (!entry) throw new Error(`FAIL CLOSED: slug "${slug}" has no manifest entry (license record required before ingest)`);
  if (entry.source_type !== 'historian') throw new Error(`manifest entry ${slug} is not source_type=historian`);
  // Existence is not validity (deep-audit H3): the license must be in the allowed
  // set, and a quarantined manifest entry never ingests, whatever its license says.
  if (!isAllowedLicense(entry.license)) throw new Error(`FAIL CLOSED: ${slug} license "${String(entry.license)}" not in the allowed set`);
  if (typeof entry.quarantine === 'string' && entry.quarantine.trim()) throw new Error(`FAIL CLOSED: ${slug} is quarantined in the manifest: ${entry.quarantine}`);

  const dbUrl = (localEnv('DATABASE_URL') ?? '').replace(/^"|"$/g, '');
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const key = localEnv('DEEPINFRA_API_KEY');
  if (!key) throw new Error('DEEPINFRA_API_KEY required');
  // Branch guard, allow-list + paired-source (deep-audit M1): NEON_BRANCH must
  // come from the SAME source as DATABASE_URL, and must be dev/test explicitly.
  const branch = process.env.DATABASE_URL ? process.env.NEON_BRANCH : localEnv('NEON_BRANCH');
  if (branch !== 'dev' && branch !== 'test') {
    throw new Error(`STOP: NEON_BRANCH="${branch ?? '(unset)'}" from the same env source as DATABASE_URL must be dev or test — historians land on dev only`);
  }

  let nodes: Node[] = readFileSync(jsonlPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Node)
    .filter((n) => n.content.length > 0);
  if (limitNodes > 0) nodes = nodes.slice(0, limitNodes);

  // Build section rows: chunk on tree structure, heading = path.
  interface Row { ordinal: number; heading: string; body: string; period: { start: number; end: number } | null }
  const rows: Row[] = [];
  for (const n of nodes) {
    const heading = n.path.join(' — ');
    const chunks = chunkBody(n.content);
    chunks.forEach((body, i) => {
      const h = chunks.length > 1 ? `${heading} (${i + 1}/${chunks.length})` : heading;
      // period from the HEADING ONLY (§9 item 5). Scanning the body too tagged a
      // Herod-era section 1666 off a footnote's "fire of London, A.D. 1666"
      // (deep-audit 2026-07-16) — mechanically verbatim, semantically wrong.
      rows.push({ ordinal: rows.length + 1, heading: h, body, period: verbatimPeriod(heading) });
    });
  }

  const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    // A published work's content is owner-approved; re-ingesting under the flag
    // would swap it silently (deep-audit M4). Refuse.
    const prior = await db.query<{ status: string }>(`SELECT status FROM sources WHERE slug=$1`, [slug]);
    if (prior.rows[0]?.status === 'published') {
      throw new Error(`STOP: ${slug} is PUBLISHED — re-ingest would replace owner-approved content; unpublish first`);
    }
    await db.query('BEGIN');
    const src = await db.query<{ id: string }>(
      `INSERT INTO sources (slug, title, author, author_died, year_written, source_type, tradition, era, license, provenance, status)
       VALUES ($1,$2,$3,$4,$5,'historian',$6,$7,$8,$9,'staged')
       ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, provenance=EXCLUDED.provenance
       RETURNING id`,
      [slug, entry.title, entry.author, entry.author_died ?? null, entry.year_written ?? null,
        entry.tradition, entry.era, entry.license, JSON.stringify(entry.provenance)],
    );
    const sourceId = src.rows[0]!.id;
    // idempotent re-run: clear this source's prior rows
    await db.query(`DELETE FROM section_embeddings WHERE section_id IN (SELECT id FROM sections WHERE source_id=$1)`, [sourceId]);
    await db.query(`DELETE FROM section_history_anchors WHERE section_id IN (SELECT id FROM sections WHERE source_id=$1)`, [sourceId]);
    await db.query(`DELETE FROM section_anchors WHERE section_id IN (SELECT id FROM sections WHERE source_id=$1)`, [sourceId]);
    await db.query(`DELETE FROM sections WHERE source_id=$1`, [sourceId]);

    // insert sections; map ids BY ORDINAL, never by RETURNING row order (deep-audit L1)
    const idByOrdinal = new Map<number, string>();
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200);
      const params: unknown[] = [];
      const tuples = batch.map((r, j) => {
        const p = j * 5;
        params.push(sourceId, r.ordinal, r.heading, r.body, r.period?.start ?? null);
        return `($${p + 1},$${p + 2},$${p + 3},$${p + 4},$${p + 5},${r.period ? `$${p + 5}::smallint` : 'NULL'})`;
      });
      // period_end uses same param when a single year; ranges recomputed below
      const res = await db.query<{ id: string; ordinal: number }>(
        `INSERT INTO sections (source_id, ordinal, heading, body, period_start_year, period_end_year)
         VALUES ${tuples.join(',')} RETURNING id, ordinal`, params,
      );
      for (const r of res.rows) idByOrdinal.set(r.ordinal, r.id);
    }
    const ids: string[] = rows.map((r) => {
      const id = idByOrdinal.get(r.ordinal);
      if (!id) throw new Error(`insert lost ordinal ${r.ordinal}`);
      return id;
    });
    // fix period_end for real ranges
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      if (r.period && r.period.end !== r.period.start) {
        await db.query(`UPDATE sections SET period_end_year=$1 WHERE id=$2`, [r.period.end, ids[i]]);
      }
    }

    // anchors: gazetteer (verbatim-checked) + explicit scripture citations only
    let entityAnchors = 0, verseAnchors = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      for (const g of verbatimAnchors(r.heading, r.body)) {
        await db.query(
          `INSERT INTO section_history_anchors (section_id, kind, entity_slug, entity_label)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [ids[i], g.kind, g.slug, g.label],
        );
        entityAnchors++;
      }
      for (const ref of scanReferences(r.body)) {
        if (!isExplicitCitation(ref.display, r.body)) continue;
        for (const range of ref.ranges) {
          await db.query(
            `INSERT INTO section_anchors (section_id, verse_id_start, verse_id_end)
             VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [ids[i], range.start, range.end],
          );
          verseAnchors++;
        }
      }
    }

    await db.query('COMMIT');
    console.log(`${slug}: ${rows.length} sections staged (source ${sourceId}) · ${entityAnchors} entity anchors · ${verseAnchors} explicit verse anchors`);

    // embed WHOLE chunks (outside the tx; resumable — missing embeddings re-run)
    const batches: Array<{ id: string; body: string }[]> = [];
    const pending = ids.map((id, i) => ({ id, body: rows[i]!.body }));
    for (let i = 0; i < pending.length; i += EMBED_BATCH) batches.push(pending.slice(i, i + EMBED_BATCH));
    let done = 0, next = 0;
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (next < batches.length) {
        const b = batches[next++]!;
        const vecs = await embedBatchWhole(b.map((x) => x.body), key);
        const params: unknown[] = [];
        const tuples = b.map((x, j) => {
          params.push(x.id, MODEL_SLUG, JSON.stringify(vecs[j]!));
          return `($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3}::vector)`;
        });
        await db.query(
          `INSERT INTO section_embeddings (section_id, model_slug, embedding) VALUES ${tuples.join(',')}
           ON CONFLICT (section_id, model_slug) DO NOTHING`, params,
        );
        done += b.length;
        if (done % 640 === 0) console.log(`  embedded ${done}/${pending.length}`);
      }
    }));
    console.log(`embedded ${done}/${pending.length} sections whole (max ${EMBED_MAX} chars, truncation never fired)`);
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}

// CLI-only: importing this module for verbatimPeriod must not run the ingest
// (historian-contract-backfill imports it — A6 2026-07-17)
if (process.argv[1] && /ingest-historian/.test(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
