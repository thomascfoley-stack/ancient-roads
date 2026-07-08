import type { Embedder, EmbeddingStore, RetrievalResult, SourceType } from './types';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

// The public retrieval entrypoint: text query -> ranked passages. Depends only on
// an Embedder and an EmbeddingStore, so it is fully testable with fakes.
export async function retrieve(
  query: { text: string; limit?: number; sourceType?: SourceType },
  deps: { embedder: Embedder; store: EmbeddingStore },
): Promise<RetrievalResult[]> {
  const text = query.text.trim();
  if (!text) return [];

  const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_LIMIT), MAX_LIMIT);

  const [vector] = await deps.embedder.embed([text]);
  if (!vector) return [];

  const rows = await deps.store.search(vector, { limit, sourceType: query.sourceType });

  return rows.map((r) => ({
    sourceId: r.sourceId,
    score: r.score,
    text: r.content,
    verseId: r.metadata.verseId,
    verseEnd: r.metadata.verseEnd,
    attribution: {
      author: r.metadata.author,
      year: r.metadata.year,
      tradition: r.metadata.tradition,
      sourceTitle: r.metadata.sourceTitle,
      sourceUrl: r.metadata.sourceUrl,
    },
  }));
}
