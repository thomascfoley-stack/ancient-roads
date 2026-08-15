// EMBEDDINGS_DESIGN v2 §2 D5 / invariants I-1, I-2: the web-plane DeepInfra clients must fail
// fast when the provider's response names a different model than requested. Covers the request
// path (embedQuery), the user-corpus batch path (embedChunks), and the composer (compose) —
// the compose path is where this hazard has ALREADY bitten: deepinfra.ts:9-11 records
// 'Qwen3.6-35B-A3B' being silently auto-forwarded to a slow fallback.
//
// The rerank path is deliberately NOT here: DeepInfra's /v1/inference/{model} response is
// { scores: number[] } with no self-reported model (docs.deepinfra.com/apis/reranker, checked
// 2026-08-12), so no response-side assertion is possible there. Recorded in EMBEDDINGS_DESIGN §2
// D5 and in a comment on rerank.ts.

import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.DEEPINFRA_API_KEY = process.env.DEEPINFRA_API_KEY || 'test-key';

import { compose, embedQuery } from '@/lib/teacher/deepinfra';
import { embedChunks } from '@/lib/user-corpus/embed';

const EMBED_MODEL = 'BAAI/bge-large-en-v1.5';
const COMPOSE_MODEL = 'Qwen/Qwen3.5-35B-A3B';
const vec = (dims = 1024) => Array.from({ length: dims }, () => 0.01);

function stubFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('embedQuery model guard (I-1, request path)', () => {
  it('accepts the matching model', async () => {
    stubFetch({ model: EMBED_MODEL, data: [{ index: 0, embedding: vec() }] });
    await expect(embedQuery('what is faith')).resolves.toHaveLength(1024);
  });

  it('fails fast on a forwarded model', async () => {
    stubFetch({ model: 'jinaai/jina-embeddings-v3', data: [{ index: 0, embedding: vec() }] });
    await expect(embedQuery('what is faith')).rejects.toThrow(/model/i);
  });

  it('fails fast when no model is reported', async () => {
    stubFetch({ data: [{ index: 0, embedding: vec() }] });
    await expect(embedQuery('what is faith')).rejects.toThrow(/model/i);
  });
});

describe('embedChunks model guard (I-1, user-corpus plane)', () => {
  it('accepts the matching model', async () => {
    stubFetch({ model: EMBED_MODEL, data: [{ embedding: vec() }] });
    await expect(embedChunks(['a chunk'])).resolves.toHaveLength(1);
  });

  it('fails fast on a forwarded model', async () => {
    stubFetch({ model: 'some/other-model', data: [{ embedding: vec() }] });
    await expect(embedChunks(['a chunk'])).rejects.toThrow(/model/i);
  });
});

describe('compose model guard (the documented auto-forward incident)', () => {
  const completion = (model: string) => ({
    model,
    choices: [{ message: { content: '{"answer":"x"}' } }],
  });

  it('accepts the pinned composer', async () => {
    stubFetch(completion(COMPOSE_MODEL));
    await expect(compose('sys', 'user')).resolves.toContain('answer');
  });

  it('fails fast when the composer is silently forwarded', async () => {
    stubFetch(completion('Qwen/a-slow-fallback'));
    await expect(compose('sys', 'user')).rejects.toThrow(/model/i);
  });
});
