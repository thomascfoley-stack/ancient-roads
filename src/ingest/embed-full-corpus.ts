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
import { sanitizeForIngest } from './content-sanity.js';
import { readFileSync, existsSync } from 'fs';
// Canonical source_id synthesis + eligibility floor, shared with the coverage
// gate (check-corpus-coverage.ts / measure-embedding-gap.ts) so the embed job
// and the gate can never disagree on which rows are eligible or what key they
// carry. If they diverged, the gate would report phantom gaps. See source-id.ts.
import { MIN_BODY_LENGTH, synthesizeSourceId } from './source-id.js';

const EMBED_BATCH = 64;
// DeepInfra allows 200 concurrent requests/model; stay at 90% of that so a
// burst doesn't get 429'd right at the ceiling.
const EMBED_CONCURRENCY = 180;
// Must be large relative to EMBED_CONCURRENCY * EMBED_BATCH (180*64=11,520) or
// most workers sit idle waiting for the next DB page instead of embedding.
const DB_BATCH = 50_000;
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
  // Prefer the POOLED (PgBouncer) endpoint, not the direct one — embed
  // concurrency (180) and DB connection count are decoupled on purpose:
  // PgBouncer transaction-pools many workers' short queries over far fewer
  // real Postgres connections, instead of each worker opening its own
  // connection and hammering Neon's auth handshake with a herd of ~180 at once.
  const dbUrl = localEnv('DATABASE_URL') ?? localEnv('DATABASE_URL_UNPOOLED');
  if (!apiKey) throw new Error('DEEPINFRA_API_KEY is required');
  if (!dbUrl) throw new Error('DATABASE_URL is required');

  const embedder = createDeepInfraEmbedder({ apiKey });
  const cleanUrl = dbUrl.replace(/^"|"$/g, '') +
    (dbUrl.includes('?') ? '&' : '?') + 'connect_timeout=15';

  // Small pool relative to EMBED_CONCURRENCY — PgBouncer multiplexes the 180
  // embed workers' brief INSERT/SELECT calls over this many real connections.
  const pool = new pg.Pool({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
    max: 20,
    connectionTimeoutMillis: 15_000,
  });
  pool.on('error', (err: Error) => {
    console.error(`  Pool connection error: ${err.message}`);
  });

  // Load existing source_ids into a Set for fast lookup (avoids wasting API calls)
  console.log('Loading existing source_ids...');
  const { rows: existingRows } = await pool.query(
    `SELECT source_id FROM embeddings WHERE user_id IS NULL AND source_type = 'commentary'`,
  );
  const existing = new Set(existingRows.map((r: { source_id: string }) => r.source_id));
  console.log(`Existing commentary embeddings: ${existing.size}`);

  // Count total
  const { rows: [{ total }] } = await pool.query(
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

  // Retry on ANY error, not just specific known transient-error strings — at
  // 180-way concurrency Neon surfaces auth-handshake timeouts, pool exhaustion,
  // etc. under many different messages. Backoff is capped at 30s and runs for
  // MAX_ATTEMPTS tries (~10 min total) so a full network/DNS outage — the whole
  // machine losing connectivity for a minute or two, which we've now seen twice
  // — is ridden out rather than killing a multi-hundred-thousand-row job.
  async function dbQuery(sql: string, params: unknown[]): Promise<pg.QueryResult> {
    const MAX_ATTEMPTS = 30;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await pool.query(sql, params);
      } catch (e) {
        const msg = (e as Error).message;
        if (attempt === MAX_ATTEMPTS - 1) throw e;
        console.error(`  DB error (attempt ${attempt + 1}/${MAX_ATTEMPTS}): ${msg.slice(0, 100)} — retrying...`);
        await new Promise((r) => setTimeout(r, Math.min(3000 * (attempt + 1), 30_000)));
      }
    }
    throw new Error('unreachable');
  }

  // Embed a sub-batch, tolerating BGE's wholesale 512-token batch failure.
  // Fast path: one call for the whole batch. On failure (a poisoned text), fall
  // back to per-text embedding so the innocents still get vectors. Returns one
  // slot per input text (null = truly unembeddable, ~never in practice).
  async function embedResilient(texts: string[], offsetHint: number): Promise<(number[] | null)[]> {
    try {
      return await embedder.embed(texts);
    } catch {
      console.error(`  Batch @${offsetHint} failed — re-embedding ${texts.length} texts individually`);
      const out: (number[] | null)[] = [];
      for (const t of texts) out.push(await embedOneAdaptive(t));
      return out;
    }
  }

  // Embed a single text, adaptively shortening it until it fits BGE's 512-token
  // limit. `texts` are already sliced to MAX_EMBED_CHARS upstream, so the first
  // attempt matches the batch attempt; only a genuinely oversized (dense) text
  // shrinks further. Consistent with the head-truncation applied corpus-wide.
  const ADAPTIVE_CHARS = [MAX_EMBED_CHARS, 600, 400, 250];
  async function embedOneAdaptive(text: string): Promise<number[] | null> {
    for (const chars of ADAPTIVE_CHARS) {
      try {
        const [v] = await embedder.embed([text.slice(0, chars)]);
        if (v) return v;
      } catch {
        // token-limit or transient — shrink and retry the next size down
      }
    }
    return null;
  }

  while (offset < total) {
    const { rows } = await dbQuery(
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
      const sourceId = synthesizeSourceId(r);
      if (sourceId === null) continue;
      if (existing.has(sourceId)) { preSkipped++; continue; }

      const verseId = r.book * 1_000_000 + r.chapter * 1_000 + r.verse_start;
      const verseEnd = r.book * 1_000_000 + r.chapter * 1_000 + r.verse_end;

      // Decode HTML entities before storing/embedding so the reader shows real
      // characters (Greek/Hebrew, curly quotes) and the vector is computed over
      // real text — not &#x3b1; noise. The verifier decodes at match time too,
      // so stored and matched forms agree.
      const cleanBody = sanitizeForIngest(r.body);

      pending.push({
        text: cleanBody.slice(0, MAX_EMBED_CHARS),
        row: {
          sourceType: 'commentary',
          sourceId,
          chunkIndex: 0,
          content: cleanBody,
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

    // Embed sub-batches with EMBED_CONCURRENCY requests in flight at once.
    // DB writes still happen one batch at a time (dbQuery/client are not
    // concurrency-safe), but the embedding API calls — the actual bottleneck,
    // one network round-trip per 64 texts — overlap.
    const subBatches: { text: string; row: Omit<EmbeddingRow, 'embedding'> }[][] = [];
    for (let i = 0; i < pending.length; i += EMBED_BATCH) {
      subBatches.push(pending.slice(i, i + EMBED_BATCH));
    }

    let nextIdx = 0;
    async function worker(): Promise<void> {
      while (nextIdx < subBatches.length) {
        const idx = nextIdx++;
        const chunk = subBatches[idx]!;
        const texts = chunk.map((p) => p.text);

        // De-poisoned embed: the batch API fails WHOLESALE if any single text
        // exceeds BGE's 512-token limit, so one dense (Greek/Hebrew/entity)
        // text would otherwise drop its ~63 innocent batchmates. On batch
        // failure we re-embed each text on its own; a text that STILL exceeds
        // the limit is adaptively shortened until it fits. Every text gets a
        // real vector — nothing is dropped.
        const vectors = await embedResilient(texts, offset + idx * EMBED_BATCH);

        const embeddingRows: EmbeddingRow[] = [];
        for (let j = 0; j < chunk.length; j++) {
          const v = vectors[j];
          if (v) embeddingRows.push({ ...chunk[j]!.row, embedding: v });
          else embedErrors++; // truly unembeddable — ~never in practice
        }
        if (embeddingRows.length === 0) continue;

        const COLS = 6;
        const params: unknown[] = [];
        const tuples = embeddingRows.map((r, idx2) => {
          const b = idx2 * COLS;
          params.push(
            r.sourceType, r.sourceId, r.chunkIndex, r.content,
            JSON.stringify(r.embedding), JSON.stringify(r.metadata),
          );
          return `(NULL, $${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}::vector, $${b + 6}::jsonb)`;
        });

        let res: pg.QueryResult;
        try {
          res = await dbQuery(
            `INSERT INTO embeddings (user_id, source_type, source_id, chunk_index, content, embedding, metadata)
             VALUES ${tuples.join(', ')}
             ON CONFLICT (source_type, source_id, chunk_index) DO NOTHING RETURNING id`,
            params,
          );
        } catch (e) {
          // Exhausted retries — leave these unembedded rather than crash the
          // whole job; the next run's pre-skip naturally picks up whatever
          // didn't make it in (they won't be in `existing`).
          console.error(`  DB insert failed at offset ${offset + idx * EMBED_BATCH}: ${(e as Error).message.slice(0, 120)}`);
          embedErrors += embeddingRows.length;
          continue;
        }

        const inserted = res.rowCount ?? 0;
        embedded += inserted;
        dbSkipped += embeddingRows.length - inserted;
        for (const r of embeddingRows) existing.add(r.sourceId);
      }
    }

    await Promise.all(Array.from({ length: EMBED_CONCURRENCY }, () => worker()));

    offset += rows.length;
    const elapsed = (performance.now() - t0) / 1000;
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

  const finalRes = await dbQuery(
    `SELECT count(*)::int AS final FROM embeddings WHERE user_id IS NULL AND source_type = 'commentary'`,
    [],
  );
  console.log(`Total commentary embeddings now: ${finalRes.rows[0].final}`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
