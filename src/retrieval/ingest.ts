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
): Promise<{ embedded: number; upserted: number; failedBatches: number }> {
  let embedded = 0;
  let upserted = 0;
  let failedBatches = 0;
  let batch: CorpusDoc[] = [];

  // Embed + upsert one batch. A single batch that keeps failing (e.g. a provider
  // timeout that outlasts the embedder's own retries) must not kill a multi-hour
  // run: the caller catches, counts it, and continues. Upserts are idempotent
  // (ON CONFLICT DO NOTHING), so re-running the ingest fills any skipped batches.
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const vectors = await deps.embedder.embed(batch.map((d) => d.text));

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
    // Count only batches that actually persisted: a failed upsert lands in
    // `failedBatches` and is re-filled by a later re-run, so its vectors must
    // not inflate `embedded` (B7). `embedded` (rows embedded into the store)
    // still diverges from `upserted` on purpose: ON CONFLICT DO NOTHING skips
    // count as embedded but not as upserted, so embedded - upserted is the
    // re-run progress signal.
    embedded += vectors.length;
    upserted += res.inserted;
    batch = [];
  };

  // Flush the current batch; on failure, drop it and keep going.
  const flushSafely = async (): Promise<void> => {
    try {
      await flush();
    } catch (e) {
      failedBatches++;
      batch = []; // discard the failed batch so ingestion advances
      process.stdout.write(`  ⚠ batch failed (${failedBatches} total), skipping: ${(e as Error).message}\n`);
    }
  };

  let batchNum = 0;
  for await (const doc of docs) {
    batch.push(doc);
    if (batch.length >= opts.batchSize) {
      await flushSafely();
      batchNum++;
      if (batchNum % 10 === 0) process.stdout.write(`  batch ${batchNum}: ${embedded} embedded, ${upserted} upserted\n`);
    }
  }
  await flushSafely();

  return { embedded, upserted, failedBatches };
}
