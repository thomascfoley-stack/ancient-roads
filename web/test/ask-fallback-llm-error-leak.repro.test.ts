import { beforeEach, describe, expect, it, vi } from 'vitest';
import { teach } from '@/lib/teacher/teach';

// Exit test for the llm_error leak (teach.ts clientViolations builder). The sibling test
// teach-fallback-strip.test.ts models `quote_verbatim` — a VERIFIER check whose model-authored
// text rides `span`, which `f23202f4` already strips. This test models the case that commit did
// NOT model: a compose 5xx, where the raw provider error (HTTP status + DeepInfra 5xx body) rides
// the `llm_error` violation's `message` — infrastructure text, not a verifier diagnostic.
//
// The route's throw path already hides this (route.ts sends "The teacher failed to answer." for
// the same failure); the fallback RETURN path bypassed that catch and forwarded the raw message
// verbatim. The canary below stands in for the provider's internal error text: it must survive
// nowhere in the serialized fallback result the browser receives.

const { CANARY, COMPOSE_ERROR } = vi.hoisted(() => {
  const CANARY = 'CANARY_provider_internal_55f3a9b2e_never_ship_this';
  const COMPOSE_ERROR = `Compose request failed: 500 {"error":"internal server error","request_id":"req_${CANARY}"}`;
  return { CANARY, COMPOSE_ERROR };
});

vi.mock('@/lib/teacher/deepinfra', () => ({
  embedQuery: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
  compose: vi.fn().mockRejectedValue(new Error(COMPOSE_ERROR)),
  composeModel: 'test-model',
}));

vi.mock('@/lib/teacher/retrieve', () => ({
  retrieveCommentary: vi.fn().mockResolvedValue([
    {
      sourceId: 's1',
      content: 'Commentary text long enough to verify.',
      score: 0.9,
      metadata: { author: 'John Gill', sourceTitle: 'Exposition', tradition: 'Reformed', book: 'John', chapter: 1, verseStart: 1, verseEnd: 1 },
    },
    {
      sourceId: 's2',
      content: 'Second voice commentary here.',
      score: 0.8,
      metadata: { author: 'Matthew Henry', sourceTitle: 'Commentary', tradition: 'Lutheran', book: 'John', chapter: 1, verseStart: 1, verseEnd: 1 },
    },
  ]),
  retrieveSongVerse: vi.fn().mockResolvedValue([]),
  retrieveSermonLane: vi.fn().mockResolvedValue([]),
  retrieveTheologyLane: vi.fn().mockResolvedValue([]),
  retrieveHistorianLane: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/teacher/routing', () => ({ hasPassageCoverage: vi.fn().mockReturnValue(true) }));
vi.mock('../../bible/pericopes', () => ({ resolveIntent: vi.fn().mockReturnValue({ inject: [], floor: [] }) }));
vi.mock('../../bible/verse-id', () => ({ formatVerseId: vi.fn().mockReturnValue('John 1:1') }));

describe('teach() fallback llm_error leak (never emit raw provider error to client)', () => {
  beforeEach(() => {
    process.env.DEEPINFRA_API_KEY = 'test-key';
  });

  it('returns kind:fallback when every compose attempt 5xxs', async () => {
    const { result } = await teach('why does this fail');
    expect(result.kind).toBe('fallback');
  });

  it('the llm_error canary (raw provider error in message) appears NOWHERE in the serialized result', async () => {
    const { result } = await teach('why does this fail');
    expect(result.kind).toBe('fallback');
    // route.ts write() does JSON.stringify(e) on the done event — JSON.stringify is that boundary.
    expect(JSON.stringify(result)).not.toContain(CANARY);
    expect(JSON.stringify(result)).not.toContain('Compose request failed');
  });

  it('the llm_error violation carries a generic client message, not the raw provider error', async () => {
    const { result } = await teach('why does this fail');
    if (result.kind !== 'fallback') throw new Error('expected fallback');
    const v = result.violations.find((x) => x.check === 'llm_error');
    expect(v).toBeDefined();
    expect(v!.message).toBe('The composing model failed to respond.');
    expect(v!.message).not.toContain('500');
    expect(v!.message).not.toContain('Compose request failed');
  });

  it('preserves the raw provider error in the server-only meta.rejections diagnostic', async () => {
    const { result, meta } = await teach('why does this fail');
    expect(result.kind).toBe('fallback');
    // meta.rejections is the server-only log copy — the raw message must survive here so the
    // failure-code diagnostic still sees the provider's HTTP status + body.
    expect(meta.rejections).toBeDefined();
    expect(meta.rejections!.length).toBeGreaterThan(0);
    const rej = meta.rejections!.flatMap((r) => r.violations).find((v) => v.check === 'llm_error');
    expect(rej).toBeDefined();
    expect(rej!.message).toContain('Compose request failed');
    expect(rej!.message).toContain('500');
    expect(rej!.message).toContain(CANARY);
  });
});
