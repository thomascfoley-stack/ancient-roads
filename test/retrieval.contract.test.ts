import { describe, it, expect } from 'vitest';
import { retrieve } from '../src/retrieval/retrieve';
import { ingestCorpus } from '../src/retrieval/ingest';
import { fakeEmbedder, inMemoryStore } from './retrieval.fakes';
import type { CorpusDoc } from '../src/retrieval/types';

// Contract: given corpus X and query Y, retrieve returns ranked Z. These tests
// assert behavior at the seam (ordering, limit, idempotency, filter) with fakes —
// not implementation details.

function doc(sourceId: string, text: string, chunkIndex = 0): CorpusDoc {
  return {
    sourceType: 'commentary',
    sourceId,
    chunkIndex,
    verseId: 43001014,
    verseEnd: 43001014,
    text,
    attribution: { author: 'Test', year: null, tradition: null, sourceTitle: 'T', sourceUrl: null },
  };
}

async function* stream(docs: CorpusDoc[]): AsyncIterable<CorpusDoc> {
  for (const d of docs) yield d;
}

const CORPUS = [
  doc('a', 'the Word became flesh and dwelt among us the incarnation'),
  doc('b', 'genealogy of kings and the temple in Jerusalem'),
  doc('c', 'grace and truth came through Jesus Christ the Word'),
];

describe('retrieval contract', () => {
  it('ranks the semantically-closest passage first, scores descending', async () => {
    const embedder = fakeEmbedder();
    const store = inMemoryStore();
    await ingestCorpus(stream(CORPUS), { embedder, store }, { batchSize: 2 });

    const results = await retrieve({ text: 'the Word became flesh' }, { embedder, store });

    expect(results[0]?.sourceId).toBe('a');
    const scores = results.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((x, y) => y - x));
  });

  it('respects the limit', async () => {
    const embedder = fakeEmbedder();
    const store = inMemoryStore();
    await ingestCorpus(stream(CORPUS), { embedder, store }, { batchSize: 10 });

    const results = await retrieve({ text: 'the Word', limit: 2 }, { embedder, store });
    expect(results.length).toBe(2);
  });

  it('hydrates results (text + attribution + verse) from the store', async () => {
    const embedder = fakeEmbedder();
    const store = inMemoryStore();
    await ingestCorpus(stream(CORPUS), { embedder, store }, { batchSize: 10 });

    const [top] = await retrieve({ text: 'the Word became flesh' }, { embedder, store });
    expect(top?.text).toContain('Word');
    expect(top?.attribution.author).toBe('Test');
    expect(top?.verseId).toBe(43001014);
  });

  it('upsert is idempotent on (sourceType, sourceId, chunkIndex)', async () => {
    const embedder = fakeEmbedder();
    const store = inMemoryStore();

    const first = await ingestCorpus(stream(CORPUS), { embedder, store }, { batchSize: 10 });
    const second = await ingestCorpus(stream(CORPUS), { embedder, store }, { batchSize: 10 });

    expect(first.upserted).toBe(3);
    expect(second.upserted).toBe(0);
    expect(store.rows.length).toBe(3);
  });

  it('treats chunks of one entry as distinct rows', async () => {
    const embedder = fakeEmbedder();
    const store = inMemoryStore();
    await ingestCorpus(
      stream([doc('same', 'first chunk about mercy', 0), doc('same', 'second chunk about judgment', 1)]),
      { embedder, store },
      { batchSize: 10 },
    );
    expect(store.rows.length).toBe(2);
  });

  it('returns nothing for an empty query without embedding', async () => {
    const embedder = fakeEmbedder();
    const store = inMemoryStore();
    await ingestCorpus(stream(CORPUS), { embedder, store }, { batchSize: 10 });

    expect(await retrieve({ text: '   ' }, { embedder, store })).toEqual([]);
  });
});
