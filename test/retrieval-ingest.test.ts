// B7 (#112): `ingestCorpus` counted `embedded` right after the embedder returned, BEFORE the
// upsert — so a batch whose upsert failed (counted in `failedBatches`, skipped, and re-filled
// by a later re-run) still added its vectors to `embedded`. The log line and the return value
// then claimed rows were embedded that never reached the store. `embedded` may only count
// batches that actually persisted.

import { describe, expect, it } from 'vitest';
import { ingestCorpus } from '../src/retrieval/ingest';
import type { CorpusDoc, Embedder, EmbeddingStore } from '../src/retrieval/types';

const doc = (i: number): CorpusDoc => ({
  sourceType: 'commentary',
  sourceId: `entry-${i}`,
  chunkIndex: 0,
  verseId: 43003016,
  verseEnd: 43003016,
  text: `text ${i}`,
  attribution: { author: 'A', year: null, tradition: null, sourceTitle: 'T', sourceUrl: null },
});

async function* docs(n: number): AsyncIterable<CorpusDoc> {
  for (let i = 0; i < n; i++) yield doc(i);
}

const embedder: Embedder = {
  model: 'BAAI/bge-large-en-v1.5',
  dims: 1024,
  embed: (texts) => Promise.resolve(texts.map(() => Array.from({ length: 1024 }, () => 0.01))),
};

// `failOnCalls` lists the 1-based upsert calls that throw.
function store(failOnCalls: number[] = []): EmbeddingStore {
  let call = 0;
  return {
    upsert: (rows) => {
      call++;
      if (failOnCalls.includes(call)) return Promise.reject(new Error('upsert boom'));
      return Promise.resolve({ inserted: rows.length, skipped: 0 });
    },
    search: () => Promise.resolve([]),
  };
}

describe('ingestCorpus embedded counter (B7)', () => {
  it('counts every batch when all upserts succeed', async () => {
    const res = await ingestCorpus(docs(4), { embedder, store: store() }, { batchSize: 2 });
    expect(res).toEqual({ embedded: 4, upserted: 4, failedBatches: 0 });
  });

  it('does not count a batch whose upsert failed', async () => {
    // second of two batches fails: only the first batch's 2 docs may count as embedded
    const res = await ingestCorpus(docs(4), { embedder, store: store([2]) }, { batchSize: 2 });
    expect(res).toEqual({ embedded: 2, upserted: 2, failedBatches: 1 });
  });

  it('reports embedded 0 when every batch fails', async () => {
    const res = await ingestCorpus(docs(4), { embedder, store: store([1, 2]) }, { batchSize: 2 });
    expect(res).toEqual({ embedded: 0, upserted: 0, failedBatches: 2 });
  });
});
