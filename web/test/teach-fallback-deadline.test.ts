import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { teach } from '@/lib/teacher/teach';
import { PIPELINE_RESERVE_MS } from '@/lib/teacher/teach-budget';

vi.mock('@/lib/teacher/deepinfra', () => ({
  embedQuery: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
  compose: vi.fn().mockImplementation((_s: string, _u: string, opts?: { timeoutMs?: number }) => {
    const ms = opts?.timeoutMs ?? 100;
    return new Promise<string>((_resolve, reject) => {
      setTimeout(() => reject(new Error('compose timeout')), ms);
    });
  }),
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

describe('teach() fallback before platform ceiling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.DEEPINFRA_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns kind:fallback with retrieval when compose exhausts retries before maxDurationMs', async () => {
    const maxDurationMs = PIPELINE_RESERVE_MS + 20_000;
    const run = teach('What does John 1:1 mean?', { maxDurationMs });
    await vi.advanceTimersByTimeAsync(maxDurationMs);
    const { result, meta } = await run;

    expect(result.kind).toBe('fallback');
    if (result.kind === 'fallback') {
      expect(result.retrieval.length).toBeGreaterThan(0);
      expect(result.violations.length).toBeGreaterThan(0);
    }
    expect(meta.attempts).toBeGreaterThan(0);
    expect(meta.firstCheck).toBeDefined();
  }, 30_000);
});
