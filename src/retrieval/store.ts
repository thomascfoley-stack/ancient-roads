import { neon } from '@neondatabase/serverless';
import type { EmbeddingStore, EmbeddingRow, RankedRow, RowMetadata, SearchOpts } from './types';

// The only module that knows SQL / pgvector. Maps EmbeddingRow <-> the `embeddings`
// table (platform content = user_id NULL). Attribution + content are stored on the
// row (content column + metadata JSONB), so search returns fully-hydrated rows in
// one query — no N+1.
export function createNeonStore(databaseUrl: string): EmbeddingStore {
  const sql = neon(databaseUrl.replace(/^"|"$/g, ''));

  return {
    async upsert(rows: EmbeddingRow[]): Promise<{ inserted: number; skipped: number }> {
      if (rows.length === 0) return { inserted: 0, skipped: 0 };

      const COLS = 6;
      const params: unknown[] = [];
      const tuples = rows.map((r, i) => {
        const b = i * COLS;
        params.push(
          r.sourceType,
          r.sourceId,
          r.chunkIndex,
          r.content,
          JSON.stringify(r.embedding), // pgvector text input: '[1,2,3]'
          JSON.stringify(r.metadata),
        );
        return `(NULL, $${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}::vector, $${b + 6}::jsonb)`;
      });

      const text =
        `INSERT INTO embeddings (user_id, source_type, source_id, chunk_index, content, embedding, metadata) ` +
        `VALUES ${tuples.join(', ')} ` +
        `ON CONFLICT (source_type, source_id, chunk_index) DO NOTHING RETURNING id`;

      const returned = (await sql.query(text, params)) as { id: string }[];
      return { inserted: returned.length, skipped: rows.length - returned.length };
    },

    async search(queryVector: number[], opts: SearchOpts): Promise<RankedRow[]> {
      const params: unknown[] = [JSON.stringify(queryVector), opts.limit];
      let filter = '';
      if (opts.sourceType) {
        params.push(opts.sourceType);
        filter = `AND source_type = $3`;
      }

      const text =
        `SELECT source_id, 1 - (embedding <=> $1::vector) AS score, content, metadata ` +
        `FROM embeddings ` +
        `WHERE user_id IS NULL ${filter} ` +
        `ORDER BY embedding <=> $1::vector ` +
        `LIMIT $2`;

      const rows = (await sql.query(text, params)) as {
        source_id: string;
        score: number;
        content: string;
        metadata: RowMetadata;
      }[];

      return rows.map((r) => ({
        sourceId: r.source_id,
        score: Number(r.score),
        content: r.content,
        metadata: r.metadata,
      }));
    },
  };
}
