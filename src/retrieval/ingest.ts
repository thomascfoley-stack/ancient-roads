import type { CorpusDoc, Embedder, EmbeddingRow, EmbeddingStore } from './types';

// Offline batch ingestion: stream CorpusDocs -> embed in batches -> upsert.
// Never call this in a request path. Batching bounds the embedding provider calls;
// the store's ON CONFLICT DO NOTHING makes re-runs idempotent.
//
// v1.1 optimization (not needed at one-book scale): query existing source_ids and
// skip embedding docs already stored, so re-runs don't re-spend on embeddings.
export async function ingestCorpus(
  docs: AsyncIterable<CorpusDoc>,
  deps: { embedder: Embedder; store: EmbeddingStore },
  opts: { batchSize: number },
): Promise<{ embedded: number; upserted: number }> {
  let embedded = 0;
  let upserted = 0;
  let batch: CorpusDoc[] = [];

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const vectors = await deps.embedder.embed(batch.map((d) => d.text));
    embedded += vectors.length;

    const rows: EmbeddingRow[] = batch.map((d, i) => {
      const embedding = vectors[i];
      if (!embedding) throw new Error(`Embedder returned no vector for batch index ${i}`);
      return {
        sourceType: d.sourceType,
        sourceId: d.sourceId,
        chunkIndex: d.chunkIndex,
        content: d.text,
        embedding,
        metadata: {
          ...d.attribution,
          verseId: d.verseId,
          verseEnd: d.verseEnd,
          model: deps.embedder.model,
        },
      };
    });

    const res = await deps.store.upsert(rows);
    upserted += res.inserted;
    batch = [];
  };

  for await (const doc of docs) {
    batch.push(doc);
    if (batch.length >= opts.batchSize) await flush();
  }
  await flush();

  return { embedded, upserted };
}
