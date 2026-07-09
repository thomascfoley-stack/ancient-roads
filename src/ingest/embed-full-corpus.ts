// Batch-embed the full commentary_entries corpus (371k rows, 66 books) into the
// embeddings table for the teacher pipeline.
//
//   npx tsx src/ingest/embed-full-corpus.ts
//
// Safe to interrupt and re-run — skips already-embedded source_ids before calling
// the API, and ON CONFLICT DO NOTHING handles any remaining races.

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
// BGE-large-en-v1.5: 512-token context. Conservative 1200 chars (~340 tokens
// worst case for dense Latin/Greek theological text) virtually eliminates batch
// failures from the token limit.
// 1000 chars ≈ 285 tokens at 3.5 chars/tok — guaranteed under BGE's 512-token
// limit even for dense Latin/Greek. The first 1000 chars of a commentary entry
// capture the substantive content; the tail is typically elaboration.
const MAX_EMBED_CHARS = 1000;

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

  // Load existing source_ids into a Set for fast lookup (avoids wasting API calls)
  console.log('Loading existing source_ids...');
  const { rows: existingRows } = await client.query(
    `SELECT source_id FROM embeddings WHERE user_id IS NULL AND source_type = 'commentary'`,
  );
  const existing = new Set(existingRows.map((r: { source_id: string }) => r.source_id));
  console.log(`Existing commentary embeddings: ${existing.size}`);

  // Count total
  const { rows: [{ total }] } = await client.query(
    `SELECT count(*)::int AS total FROM commentary_entries WHERE length(body) >= $1`,
    [MIN_BODY_LENGTH],
  );
  console.log(`Total entries to process: ${total} (filtering body >= ${MIN_BODY_LENGTH} chars)`);

  let offset = 0;
  let embedded = 0;
  let preSkipped = 0;
  let dbSkipped = 0;
  let embedErrors = 0;
  const t0 = performance.now();

  while (offset < total) {
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

    // Build pending list, skipping already-embedded entries
    const pending: { text: string; row: Omit<EmbeddingRow, 'embedding'> }[] = [];
    for (const r of rows) {
      const slug = BOOK_SLUGS[r.book];
      if (!slug) continue;

      const sourceId = `commentary:${slug}:${r.chapter}:${r.verse_start}-${r.verse_end}:${r.author}`;
      if (existing.has(sourceId)) { preSkipped++; continue; }

      const verseId = r.book * 1_000_000 + r.chapter * 1_000 + r.verse_start;
      const verseEnd = r.book * 1_000_000 + r.chapter * 1_000 + r.verse_end;

      pending.push({
        text: r.body.slice(0, MAX_EMBED_CHARS),
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

    // Embed new entries in sub-batches
    for (let i = 0; i < pending.length; i += EMBED_BATCH) {
      const chunk = pending.slice(i, i + EMBED_BATCH);
      const texts = chunk.map((p) => p.text);

      let vectors: number[][];
      try {
        vectors = await embedder.embed(texts);
      } catch (e) {
        // Rare at 1200 chars. Log and skip the batch.
        console.error(`  Embed batch error at offset ${offset + i}: ${(e as Error).message.slice(0, 120)}`);
        embedErrors += chunk.length;
        continue;
      }

      // Build rows with vectors
      const embeddingRows: EmbeddingRow[] = chunk.map((p, j) => ({
        ...p.row,
        embedding: vectors[j]!,
      }));

      // Upsert (handles any races from concurrent runs)
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
      dbSkipped += embeddingRows.length - inserted;
      // Track in the in-memory set so later batches with the same source_id are skipped
      for (const r of embeddingRows) existing.add(r.sourceId);
    }

    offset += rows.length;
    const elapsed = (performance.now() - t0) / 1000;
    const processed = offset - preSkipped;
    const rate = processed > 0 ? elapsed / processed : 1;
    const remaining = total - offset;
    const eta = (remaining * (elapsed / offset)) / 60;
    console.log(
      `  ${offset}/${total} (${((offset / total) * 100).toFixed(1)}%) — ` +
      `${embedded} embedded, ${preSkipped} pre-skipped, ${embedErrors} errors — ` +
      `${elapsed.toFixed(0)}s elapsed, ~${eta.toFixed(1)} min remaining`,
    );
  }

  const totalTime = ((performance.now() - t0) / 1000 / 60).toFixed(1);
  console.log(`\nDone in ${totalTime} min.`);
  console.log(`  Embedded: ${embedded}`);
  console.log(`  Pre-skipped (already existed): ${preSkipped}`);
  console.log(`  DB-skipped (ON CONFLICT): ${dbSkipped}`);
  console.log(`  Embed errors: ${embedErrors}`);

  const { rows: [{ final }] } = await client.query(
    `SELECT count(*)::int AS final FROM embeddings WHERE user_id IS NULL AND source_type = 'commentary'`,
  );
  console.log(`Total commentary embeddings now: ${final}`);

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
