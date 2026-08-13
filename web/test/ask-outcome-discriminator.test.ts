import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { compose, embedQuery } from '@/lib/teacher/deepinfra';
import { teach } from '@/lib/teacher/teach';
import { logAskOutcome } from '@/lib/ask-outcome-log';

vi.mock('@/lib/teacher/deepinfra', () => ({
  embedQuery: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
  compose: vi.fn(),
  composeModel: 'test-model',
}));

vi.mock('@/lib/teacher/retrieve', () => ({
  retrieveCommentary: vi.fn().mockResolvedValue([
    {
      sourceId: 's1',
      content: 'Commentary text long enough to verify.',
      score: 0.9,
      metadata: {
        author: 'John Gill',
        sourceTitle: 'Exposition',
        tradition: 'Reformed',
        book: 'John',
        chapter: 1,
        verseStart: 1,
        verseEnd: 1,
      },
    },
    {
      sourceId: 's2',
      content: 'Second voice commentary here.',
      score: 0.8,
      metadata: {
        author: 'Matthew Henry',
        sourceTitle: 'Commentary',
        tradition: 'Reformed',
        book: 'John',
        chapter: 1,
        verseStart: 1,
        verseEnd: 1,
      },
    },
  ]),
  retrieveSongVerse: vi.fn().mockResolvedValue([]),
  retrieveSermonLane: vi.fn().mockResolvedValue([]),
  retrieveTheologyLane: vi.fn().mockResolvedValue([]),
  retrieveHistorianLane: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/teacher/routing', () => ({
  hasPassageCoverage: vi.fn().mockReturnValue(true),
}));

vi.mock('../../bible/pericopes', () => ({
  resolveIntent: vi.fn().mockReturnValue({
    inject: [],
    floor: [{ start: { book: 'John', chapter: 1, verse: 1 }, end: { book: 'John', chapter: 1, verse: 1 } }],
  }),
}));

vi.mock('../../bible/verse-id', () => ({
  formatVerseId: vi.fn().mockReturnValue('John 1:1'),
}));

/** Valid contract JSON with a quote that is NOT verbatim in section 1's body. */
const VERIFIER_FAIL_JSON = JSON.stringify({
  contract_version: '1.1',
  teacher: 'composed',
  blocks: [
    {
      type: 'voice',
      section_id: 1,
      attribution: {
        author: 'John Gill',
        work: 'Exposition',
        tradition: 'Reformed',
        origin: 'corpus',
      },
      quote: 'Fabricated quote that does not appear anywhere in the commentary body.',
    },
  ],
});

describe('teach() firstCheck discriminator (producer paths)', () => {
  beforeEach(() => {
    process.env.DEEPINFRA_API_KEY = 'test-key';
    vi.mocked(embedQuery).mockResolvedValue(new Array(1024).fill(0.1));
  });

  afterEach(() => {
    vi.mocked(compose).mockReset();
  });

  it('provider failure (compose rejects) → meta.firstCheck is llm_error', async () => {
    vi.mocked(compose).mockRejectedValue(new Error('429 rate limit'));
    const { result, meta } = await teach('What does John 1:1 mean?');
    expect(result.kind).toBe('fallback');
    expect(meta.firstCheck).toBe('llm_error');
  });

  it('verifier rejection (non-verbatim quote) → meta.firstCheck is quote_verbatim', async () => {
    vi.mocked(compose).mockResolvedValue(VERIFIER_FAIL_JSON);
    const { result, meta } = await teach('What does John 1:1 mean?');
    expect(result.kind).toBe('fallback');
    expect(meta.firstCheck).toBe('quote_verbatim');
  });

  it('provider and verifier paths produce distinguishable firstCheck values', async () => {
    vi.mocked(compose).mockRejectedValueOnce(new Error('429 rate limit'));
    const provider = await teach('Q1');
    vi.mocked(compose).mockResolvedValue(VERIFIER_FAIL_JSON);
    const verifier = await teach('Q2');
    expect(provider.meta.firstCheck).toBe('llm_error');
    expect(verifier.meta.firstCheck).toBe('quote_verbatim');
    expect(provider.meta.firstCheck).not.toBe(verifier.meta.firstCheck);
  });

  it('discriminator reaches ask_outcome via logAskOutcome', async () => {
    const lines: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      lines.push(String(args[0]));
    });
    vi.mocked(compose).mockRejectedValue(new Error('429'));
    const { result, meta } = await teach('Q');
    logAskOutcome(result.kind, 100, meta);
    const logged = JSON.parse(lines[0]!);
    expect(logged.firstCheck).toBe('llm_error');
    logSpy.mockRestore();
  });

  it('RED when both producer paths are seeded to the same firstCheck', async () => {
    vi.mocked(compose).mockRejectedValueOnce(new Error('429 rate limit'));
    const provider = await teach('Q1');
    vi.mocked(compose).mockResolvedValue(VERIFIER_FAIL_JSON);
    const verifier = await teach('Q2');
    expect(provider.meta.firstCheck).toBe('llm_error');
    expect(verifier.meta.firstCheck).toBe('quote_verbatim');
    // Seed in teach.ts: set firstCheck = 'llm_error' for verifier violations → this fails.
    expect(provider.meta.firstCheck).not.toBe(verifier.meta.firstCheck);
  });

  it('RED when verifier path drops firstCheck', async () => {
    vi.mocked(compose).mockResolvedValue(VERIFIER_FAIL_JSON);
    const { meta } = await teach('Q');
    // Seed in teach.ts: skip firstCheck assignment on verifier violations → undefined fails.
    expect(meta.firstCheck).toBe('quote_verbatim');
    expect(meta.firstCheck).toBeDefined();
  });
});
