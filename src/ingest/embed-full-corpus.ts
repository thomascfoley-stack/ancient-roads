// Batch-embed the full commentary_entries corpus (371k rows, 66 books) into the
// embeddings table for the teacher pipeline. Reads from commentary_entries (which
// already has FTS), embeds via BGE-large-en-v1.5 on DeepInfra, and upserts with
// ON CONFLICT so existing Gospel embeddings are kept and new books fill the gaps.
//
//   cd web && npx tsx --env-file=.env.local ../src/ingest/embed-full-corpus.ts
//
// Filters: body >= 100 chars (skips ~29k stub entries). Source IDs match the
// existing format: commentary:{book_slug}:{chapter}:{verse_start}-{verse_end}:{author}
// so Gospel entries that already have embeddings are deduplicated automatically.
//
// Progress is printed every batch. Safe to interrupt and re-run — ON CONFLICT
// DO NOTHING means already-embedded rows are skipped for free.

import pg from 'pg';
import { createDeepInfraEmbedder } from '../retrieval/embedder.js';
import type { EmbeddingRow } from '../retrieval/types.js';
import { readFileSync, existsSync } from 'fs';

const BOOK_SLUGS: Record<number, string> = {
  1:'gen',2:'exo',3:'lev',4:'num',5:'deu',6:'jos',7:'jdg',8:'rut',9:'1sa',10:'2sa',
  11:'1ki',12:'2ki',13:'1ch',14:'2ch',15:'ezr',16:'neh',17:'est',18:'job',19:'psa',
  20:'pro',21:'ecc',22:'sng',23:'isa',24:'jer',25:'lam',26:'ezk',27:'dan',28:'hos',
  29:'jol',30:'amo',31:'oba',32:'jon',33:'mic',34:'nam',35:'hab',36:'zep',37:'hag',
  38:'zec',39:'mal',40:'mat',41:'mrk',42:'luk',43:'jhn',44:'act',45:'rom',46:'1co',
  47:'2co',48:'gal',49:'eph',50:'php',51:'col',52:'1th',53:'2th',54:'1ti',55:'2ti',
  56:'tit',57:'phm',58:'heb',59:'jas',60:'1pe',61:'2pe',62:'1jn',63:'2jn',64:'3jn',
  65:'jud',66:'rev',
};

const MIN_BODY_LENGTH = 100;
const EMBED_BATCH = 64;
const DB_BATCH = 500;
// BGE-large-en-v1.5 has a 512-token context. 1800 chars is the theoretical max
// but dense theological text (long proper nouns, Latin) can exceed 512 tokens at
// ~1600 chars. Pre-truncate before handing to the embedder.
const MAX_CHARS = 1500;

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8')
    .match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]
    ?.trim()
    .replace(/^"|"$/g, '');
}

async function main() {
  const apiKey = localEnv('DEEPINFRA_API_KEY');
  const dbUrl = localEnv('DATABASE_URL_UNPOOLED') ?? localEnv('DATABASE_URL');
  if (!apiKey) throw new Error('DEEPINFRA_API_KEY is required');
  if (!dbUrl) throw new Error('DATABASE_URL_UNPOOLED is required');

  const embedder = createDeepInfraEmbedder({ apiKey });
  const client = new pg.Client({
    connectionString: dbUrl.replace(/^"|"$/g, ''),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // Count total
  const { rows: [{ total }] } = await client.query(
    `SELECT count(*)::int AS total FROM commentary_entries WHERE length(body) >= $1`,
    [MIN_BODY_LENGTH],
  );
  console.log(`Total entries to embed: ${total} (of 371k, filtering body >= ${MIN_BODY_LENGTH} chars)`);

  // Check how many already exist
  const { rows: [{ existing }] } = await client.query(
    `SELECT count(*)::int AS existing FROM embeddings WHERE user_id IS NULL AND source_type = 'commentary'`,
  );
  console.log(`Existing commentary embeddings: ${existing}`);

  let offset = 0;
  let embedded = 0;
  let skipped = 0;
  const t0 = performance.now();

  while (offset < total) {
    // Fetch a batch of commentary_entries
    const { rows } = await client.query(
      `SELECT id, book, chapter, verse_start, verse_end, author, year, tradition,
              source_title, source_url, body
       FROM commentary_entries
       WHERE length(body) >= $1
       ORDER BY id
       LIMIT $2 OFFSET $3`,
      [MIN_BODY_LENGTH, DB_BATCH, offset],
    );

    if (rows.length === 0) break;

    // Build EmbeddingRows (without vectors yet)
    const pending: { row: Omit<EmbeddingRow, 'embedding'>; text: string }[] = [];
    for (const r of rows) {
      const slug = BOOK_SLUGS[r.book];
      if (!slug) { skipped++; continue; }

      const sourceId = `commentary:${slug}:${r.chapter}:${r.verse_start}-${r.verse_end}:${r.author}`;
      const verseId = r.book * 1_000_000 + r.chapter * 1_000 + r.verse_start;
      const verseEnd = r.book * 1_000_000 + r.chapter * 1_000 + r.verse_end;

      pending.push({
        text: r.body.slice(0, MAX_CHARS),
        row: {
          sourceType: 'commentary',
          sourceId,
          chunkIndex: 0,
          content: r.body,
          metadata: {
            author: r.author,
            year: r.year,
            tradition: r.tradition,
            sourceTitle: r.source_title,
            sourceUrl: r.source_url || null,
            verseId,
            verseEnd,
            model: embedder.model,
          },
        },
      });
    }

    // Embed in sub-batches
    for (let i = 0; i < pending.length; i += EMBED_BATCH) {
      const chunk = pending.slice(i, i + EMBED_BATCH);
      const texts = chunk.map((p) => p.text);

      let vectors: number[][];
      try {
        vectors = await embedder.embed(texts);
      } catch (e) {
        console.error(`  Embed error at offset ${offset + i}, skipping batch: ${(e as Error).message}`);
        skipped += chunk.length;
        continue;
      }

      // Build full rows with vectors
      const embeddingRows: EmbeddingRow[] = chunk.map((p, j) => ({
        ...p.row,
        embedding: vectors[j]!,
      }));

      // Upsert
      const COLS = 6;
      const params: unknown[] = [];
      const tuples = embeddingRows.map((r, idx) => {
        const b = idx * COLS;
        params.push(
          r.sourceType, r.sourceId, r.chunkIndex, r.content,
          JSON.stringify(r.embedding), JSON.stringify(r.metadata),
        );
        return `(NULL, $${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}::vector, $${b + 6}::jsonb)`;
      });

      const res = await client.query(
        `INSERT INTO embeddings (user_id, source_type, source_id, chunk_index, content, embedding, metadata)
         VALUES ${tuples.join(', ')}
         ON CONFLICT (source_type, source_id, chunk_index) DO NOTHING RETURNING id`,
        params,
      );

      const inserted = res.rowCount ?? 0;
      embedded += inserted;
      skipped += embeddingRows.length - inserted;
    }

    offset += rows.length;
    const elapsed = ((performance.now() - t0) / 1000).toFixed(0);
    const rate = (offset / Number(elapsed)).toFixed(0);
    const eta = (((total - offset) / Number(rate)) / 60).toFixed(1);
    console.log(`  ${offset}/${total} (${((offset / total) * 100).toFixed(1)}%) — ${embedded} new, ${skipped} skipped — ${elapsed}s elapsed, ~${eta} min remaining`);
  }

  const totalTime = ((performance.now() - t0) / 1000 / 60).toFixed(1);
  console.log(`\nDone in ${totalTime} min. Embedded: ${embedded}, Skipped: ${skipped}`);

  // Verify final count
  const { rows: [{ final }] } = await client.query(
    `SELECT count(*)::int AS final FROM embeddings WHERE user_id IS NULL AND source_type = 'commentary'`,
  );
  console.log(`Total commentary embeddings now: ${final}`);

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
