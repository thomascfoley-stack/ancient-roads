import { beforeEach, describe, expect, it, vi } from 'vitest';
import { teach } from '@/lib/teacher/teach';

// Exit test for the fallback strip (teach.ts:358): the fallback result is serialized whole into
// the /api/ask response body (route.ts: `NextResponse.json({ ...result })`), and the verifier
// attaches MODEL-AUTHORED text to violations as `span` (v1.ts: the rejected quote that failed
// quote_verbatim, and interpretation-screen hits matched against the model's own output). The
// fallback path is taken exactly when the model misbehaved worst, so shipping the raw violations
// meant fabricated model text reached the browser on the worst runs — against the absolute
// "never emit unverified model text to a user" rule.
//
// The client already types fallback violations as `{ check, message }[]` and never renders them
// (ask-client.tsx), so the server converges to the existing client contract by stripping.
// The canary below stands in for fabricated model text: it must survive nowhere in the payload.

const CANARY = 'CANARY_fabricated_quote_7f3a9b2e_never_ship_this';

vi.mock('@/lib/teacher/deepinfra', () => ({
  embedQuery: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
  compose: vi.fn().mockResolvedValue(JSON.stringify({ blocks: [] })),
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

vi.mock('@/lib/teacher/normalize-contract', () => ({
  normalizeContract: vi.fn().mockImplementation((parsed: unknown) => parsed),
}));

// Every attempt rejected with a quote_verbatim violation whose `span` is the model's rejected
// (fabricated) quote — the exact shape v1.ts produces, with the canary inside.
vi.mock('@/verifier/v1', () => ({
  verifyV1: vi.fn().mockResolvedValue({
    ok: false,
    violations: [
      {
        check: 'quote_verbatim',
        message: 'quote is not a normalized substring of any cited section',
        span: 'the model wrote: CANARY_fabricated_quote_7f3a9b2e_never_ship_this',
      },
    ],
  }),
}));

vi.mock('@/lib/teacher/routing', () => ({ hasPassageCoverage: vi.fn().mockReturnValue(true) }));
vi.mock('../../bible/pericopes', () => ({ resolveIntent: vi.fn().mockReturnValue({ inject: [], floor: [] }) }));
vi.mock('../../bible/verse-id', () => ({ formatVerseId: vi.fn().mockReturnValue('John 1:1') }));

describe('teach() fallback violation strip (never emit unverified model text)', () => {
  beforeEach(() => {
    process.env.DEEPINFRA_API_KEY = 'test-key';
  });

  it('returns fallback violations with NO span key — check and message only', async () => {
    const { result } = await teach('why does this fail');
    expect(result.kind).toBe('fallback'); // all attempts rejected, so the loop exhausts
    if (result.kind !== 'fallback') return;

    expect(result.violations.length).toBeGreaterThan(0);
    for (const v of result.violations) {
      expect(Object.keys(v).sort()).toEqual(['check', 'message']);
      expect(v).not.toHaveProperty('span');
    }
  });

  it('the canary (model-authored span text) appears NOWHERE in the serialized result', async () => {
    const { result } = await teach('why does this fail');
    expect(result.kind).toBe('fallback');
    // route.ts does NextResponse.json({ ...result }) — JSON.stringify is that boundary.
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it('still carries the bounded check+message the diagnostic reads', async () => {
    const { result } = await teach('why does this fail');
    if (result.kind !== 'fallback') throw new Error('expected fallback');
    expect(result.violations[0]!.check).toBe('quote_verbatim');
    expect(result.violations[0]!.message).toContain('normalized substring');
  });
});
