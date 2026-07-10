// Ingest CrossWire SWORD PD commentaries (Barnes/Wesley/Calvin, NT) into the
// publishable commentary corpus — the author-diversity slice (WORKLOG 2026-07-10).
// Source: CrossWire rawzip SWORD modules (DistributionLicense=Public Domain,
// verified in each .conf), decoded via the zVerse reader (scratchpad/sword). Clean
// provenance by construction (CrossWire is an ADR-008 primary source, not an
// aggregator). Idempotent: pre-skips existing source_ids + ON CONFLICT DO NOTHING.
//   DATABASE_URL=<owner> DEEPINFRA_API_KEY=<key> npx tsx src/ingest/ingest-sword-commentaries.mts <jsonl>

import pg from 'pg';
import { readFileSync } from 'node:fs';
import { BOOK_SLUGS } from './source-id.js';

const jsonlPath = process.argv[2];
if (!jsonlPath) throw new Error('usage: ingest-sword-commentaries.mts <jsonl>');
const DB = (process.env.DATABASE_URL ?? '').replace(/^"|"$/g, '');
const KEY = process.env.DEEPINFRA_API_KEY!;
const MODEL = 'BAAI/bge-large-en-v1.5';
const EMBED_BATCH = 64, CONCURRENCY = 6;

const META: Record<string, { year: number; tradition: string; sourceTitle: string; sourceUrl: string }> = {
  'Albert Barnes': { year: 1834, tradition: 'Presbyterian', sourceTitle: "Barnes' Notes on the New Testament", sourceUrl: 'https://crosswire.org/sword/modules/ModInfo.jsp?modName=Barnes' },
  'John Wesley': { year: 1765, tradition: 'Methodist', sourceTitle: "Wesley's Explanatory Notes on the New Testament", sourceUrl: 'https://crosswire.org/sword/modules/ModInfo.jsp?modName=Wesley' },
  'John Calvin': { year: 1555, tradition: 'Reformed', sourceTitle: "Calvin's Commentaries", sourceUrl: 'https://crosswire.org/sword/modules/ModInfo.jsp?modName=CalvinCommentaries' },
};

interface Entry { author: string; verseId: number; content: string }
const decode = (v: number) => ({ book: Math.floor(v / 1e6), ch: Math.floor((v % 1e6) / 1000), vs: v % 1000 });

async function embedRaw(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, input: texts, encoding_format: 'float' }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { data: { embedding: number[] }[] }).data.map((d) => d.embedding);
}
// bge-large caps at 512 tokens; the batch API fails WHOLESALE if ANY text exceeds.
// Base slice ~1200 chars is safely under for nearly all; on batch failure, re-embed
// each text alone, adaptively shortening the rare dense outlier until it fits.
async function embedBatch(texts: string[]): Promise<number[][]> {
  try {
    return await embedRaw(texts.map((t) => t.slice(0, 1200)));
  } catch {
    const out: number[][] = [];
    for (const t of texts) {
      let len = 1200, vec: number[] | null = null;
      while (len >= 200) {
        try { vec = (await embedRaw([t.slice(0, len)]))[0]!; break; } catch { len = Math.floor(len * 0.7); }
      }
      out.push(vec ?? []);
    }
    return out;
  }
}

async function main() {
  const entries: Entry[] = readFileSync(jsonlPath, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
  const client = new pg.Pool({ connectionString: DB, max: CONCURRENCY + 2 });

  // Skip only rows already ingested from CrossWire (idempotent re-run). A colliding
  // biblehub-provenance row is NOT skipped — it gets repaired to CrossWire below.
  const existing = new Set(
    (await client.query(
      `SELECT source_id FROM embeddings WHERE user_id IS NULL AND source_type='commentary'
       AND metadata->>'author' IN ('Albert Barnes','John Wesley','John Calvin') AND metadata->>'sourceUrl' ILIKE '%crosswire%'`,
    )).rows.map((r) => r.source_id),
  );
  // Build rows (skip already-present source_ids)
  const rows = entries.flatMap((e) => {
    const { book, ch, vs } = decode(e.verseId);
    const slug = BOOK_SLUGS[book];
    if (!slug) return [];
    const sourceId = `commentary:${slug}:${ch}:${vs}-${vs}:${e.author}`;
    if (existing.has(sourceId)) return [];
    const m = META[e.author]!;
    return [{
      sourceId, content: e.content,
      metadata: { author: e.author, year: m.year, tradition: m.tradition, sourceTitle: m.sourceTitle, sourceUrl: m.sourceUrl, verseId: e.verseId, verseEnd: e.verseId, model: MODEL },
    }];
  });
  console.log(`${entries.length} extracted · ${rows.length} new to ingest · ${entries.length - rows.length} already present`);
  if (rows.length === 0) { await client.end(); return; }

  // Embed+insert PER BATCH (resumable via the crosswire pre-skip; progress persists).
  const batches: typeof rows[] = [];
  for (let i = 0; i < rows.length; i += EMBED_BATCH) batches.push(rows.slice(i, i + EMBED_BATCH));
  let inserted = 0, done = 0, next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < batches.length) {
      const b = batches[next++]!;
      const vecs = await embedBatch(b.map((r) => r.content));
      const good = b.map((r, i) => ({ ...r, embedding: vecs[i]! })).filter((r) => r.embedding.length === 1024);
      if (good.length) {
        const params: unknown[] = [];
        const tuples = good.map((r, j) => {
          const p = j * 5;
          params.push(r.sourceId, r.content, JSON.stringify(r.embedding), JSON.stringify(r.metadata), 0);
          return `(NULL, 'commentary', $${p + 1}, $${p + 5}, $${p + 2}, $${p + 3}::vector, $${p + 4}::jsonb)`;
        });
        const res = await client.query(
          `INSERT INTO embeddings (user_id, source_type, source_id, chunk_index, content, embedding, metadata)
           VALUES ${tuples.join(', ')}
           ON CONFLICT (source_type, source_id, chunk_index)
           DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata
           RETURNING id`, params,
        );
        inserted += res.rowCount ?? 0;
      }
      done += b.length; if (done % 640 === 0) process.stdout.write(`  ${done}/${rows.length} embedded, ${inserted} written\n`);
    }
  }));
  const byAuthor = (await client.query(
    `SELECT metadata->>'author' AS a, count(*)::int n FROM embeddings WHERE user_id IS NULL AND source_type='commentary'
     AND metadata->>'author' IN ('Albert Barnes','John Wesley','John Calvin') GROUP BY 1 ORDER BY 1`)).rows;
  console.log(`\ninserted ${inserted}. New-author totals now:`, byAuthor);
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
