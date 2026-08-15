// EMBEDDINGS_DESIGN v2 §2 D5 / invariant I-1: the corpus embedder must fail fast when the
// provider's response names a model other than the one requested (DeepInfra silently forwards
// deprecated/substituted models — recon §5.1 #6), when it names none, and when a vector's width
// is not 1024 (Jina v3 is also 1024-dim: width alone cannot catch a wrong model, which is why
// the model assertion is the guard and dims is the free catch).
//
// This is the only guard that compares against a value the pipeline did not write.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeepInfraEmbedder } from '../src/retrieval/embedder';

const MODEL = 'BAAI/bge-large-en-v1.5';
const vec = (dims = 1024) => Array.from({ length: dims }, () => 0.01);

function stubFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('embedder provider-model guard (I-1)', () => {
  it('accepts a response whose model matches the request', async () => {
    stubFetch({ model: MODEL, data: [{ index: 0, embedding: vec() }] });
    const e = createDeepInfraEmbedder({ apiKey: 'test-key' });
    await expect(e.embed(['hello'])).resolves.toHaveLength(1);
  });

  it('fails fast when the provider forwards a different model', async () => {
    stubFetch({ model: 'jinaai/jina-embeddings-v3', data: [{ index: 0, embedding: vec() }] });
    const e = createDeepInfraEmbedder({ apiKey: 'test-key' });
    await expect(e.embed(['hello'])).rejects.toThrow(/model/i);
  });

  it('fails fast when the response carries no model at all', async () => {
    stubFetch({ data: [{ index: 0, embedding: vec() }] });
    const e = createDeepInfraEmbedder({ apiKey: 'test-key' });
    await expect(e.embed(['hello'])).rejects.toThrow(/model/i);
  });

  it('fails fast on a wrong-width vector, naming the cause', async () => {
    stubFetch({ model: MODEL, data: [{ index: 0, embedding: vec(768) }] });
    const e = createDeepInfraEmbedder({ apiKey: 'test-key' });
    await expect(e.embed(['hello'])).rejects.toThrow(/768.*1024|1024.*768|dims/i);
  });

  it('a model mismatch is not retried (not a transient failure)', async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ model: 'other/model', data: [{ index: 0, embedding: vec() }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', mock);
    const e = createDeepInfraEmbedder({ apiKey: 'test-key' });
    await expect(e.embed(['hello'])).rejects.toThrow(/model/i);
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
