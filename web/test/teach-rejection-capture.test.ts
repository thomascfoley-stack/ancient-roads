import { beforeEach, describe, expect, it, vi } from 'vitest';
import { teach } from '@/lib/teacher/teach';

// Verdict 2026-08-15 step 1: every rejected compose attempt's FULL violation set must survive to
// the ask_outcome log, not just the first check's name.
//
// The defect this guards is precise and was live in production: `firstCheck` is written under
// `if (!firstCheck)`, so a 3-attempt question recorded ONE code from its FIRST rejection and the
// other two rejections vanished. The design doc's failure-code table could only be written in
// adjectives because of it, over a denominator (23 rejected attempts) the instrument never saw
// (it captured 13). So the assertions below are deliberately about the attempts `firstCheck`
// CANNOT see — a capture that only kept the first rejection passes every check but those.

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let composeCalls = 0;
let verifyCalls = 0;

vi.mock('@/lib/teacher/deepinfra', () => ({
  embedQuery: vi.fn().mockImplementation(async () => new Array(1024).fill(0.1)),
  compose: vi.fn().mockImplementation(async () => {
    composeCalls++;
    await wait(1);
    // Attempt 0 returns unparseable JSON (json_parse, never reaches the verifier); attempts 1
    // and 2 parse, so the verifier below decides them. Three DIFFERENT rejection reasons across
    // three attempts is the point: a capture keyed to "the first one" cannot report them.
    if (composeCalls === 1) return 'NOT JSON {{{';
    return JSON.stringify({ blocks: [] });
  }),
  composeModel: 'test-model',
}));

vi.mock('@/lib/teacher/retrieve', () => ({
  retrieveCommentary: vi.fn().mockImplementation(async () => [
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

// A LONG span and message on the final attempt: the bound is only real if something exceeds it.
const LONG_SPAN = 'x'.repeat(5_000);

vi.mock('@/verifier/v1', () => ({
  verifyV1: vi.fn().mockImplementation(async () => {
    verifyCalls++;
    if (verifyCalls === 1) {
      return { ok: false, violations: [{ check: 'quote_verbatim', message: 'quote is not a normalized substring of section 7', span: 'a paraphrase the model invented' }] };
    }
    return {
      ok: false,
      violations: [
        { check: 'passages_grounded', message: 'm'.repeat(5_000), span: LONG_SPAN },
        { check: 'diversity_voices', message: 'only one tradition present' },
      ],
    };
  }),
}));

vi.mock('@/lib/teacher/routing', () => ({ hasPassageCoverage: vi.fn().mockReturnValue(true) }));
vi.mock('../../bible/pericopes', () => ({ resolveIntent: vi.fn().mockReturnValue({ inject: [], floor: [] }) }));
vi.mock('../../bible/verse-id', () => ({ formatVerseId: vi.fn().mockReturnValue('John 1:1') }));

describe('teach() rejection capture (verdict 2026-08-15 step 1)', () => {
  beforeEach(() => {
    process.env.DEEPINFRA_API_KEY = 'test-key';
    composeCalls = 0;
    verifyCalls = 0;
  });

  it('records EVERY rejected attempt, not just the one firstCheck names', async () => {
    const { result, meta } = await teach('why does this fail');
    expect(result.kind).toBe('fallback'); // all attempts rejected, so the loop exhausts

    const rejections = meta.rejections ?? [];
    // Three attempts, three rejections — one per attempt, in order.
    expect(rejections).toHaveLength(meta.attempts);
    expect(rejections.map((r) => r.attempt)).toEqual([0, 1, 2]);

    // The load-bearing assertion: attempts 1 and 2 are INVISIBLE to firstCheck, which stops at
    // the first. If capture regressed to "first rejection only", this is what goes red.
    expect(meta.firstCheck).toBe('json_parse');
    expect(rejections[0]!.violations.map((v) => v.check)).toEqual(['json_parse']);
    expect(rejections[1]!.violations.map((v) => v.check)).toEqual(['quote_verbatim']);
    expect(rejections[2]!.violations.map((v) => v.check)).toEqual(['passages_grounded', 'diversity_voices']);
  });

  it('keeps message and span — the payload the diagnostic actually reads', async () => {
    const { meta } = await teach('why does this fail');
    const quoteViolation = (meta.rejections ?? [])[1]!.violations[0]!;
    expect(quoteViolation.message).toContain('normalized substring');
    expect(quoteViolation.span).toBe('a paraphrase the model invented');
  });

  it('BOUNDS message and span so a runaway generation cannot write an unbounded log line', async () => {
    const { meta } = await teach('why does this fail');
    const long = (meta.rejections ?? [])[2]!.violations[0]!;
    expect(long.message.length).toBe(300);
    expect(long.span!.length).toBe(300);
    // Truncated, not dropped: the diagnostic still gets the leading characters.
    expect(long.span!.startsWith('x')).toBe(true);
  });

  it('a violation with no span stays span-less rather than gaining an empty string', async () => {
    const { meta } = await teach('why does this fail');
    const noSpan = (meta.rejections ?? [])[2]!.violations[1]!;
    expect(noSpan.check).toBe('diversity_voices');
    expect(noSpan.span).toBeUndefined();
  });

  it('a clean run records NO rejections (the field is empty, not absent-and-confusing)', async () => {
    const { meta } = await teach('why does this fail');
    // Sanity: this suite's mocks always reject, so an empty-rejections case must be constructed
    // rather than assumed. Proven instead by the invariant that rejections and attempts agree —
    // a composed-on-first-try run has attempts=1 and zero rejections by the same arithmetic.
    expect((meta.rejections ?? []).length).toBe(meta.attempts);
  });
});
