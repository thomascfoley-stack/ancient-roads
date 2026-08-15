import { beforeEach, describe, expect, it, vi } from 'vitest';
import { teach } from '@/lib/teacher/teach';

// B1 (plan 2026-08-13): the stage stopwatch must reproduce KNOWN seeded delays — the
// measurement run's numbers are only as honest as this harness proves them to be. Real timers
// on purpose (fake timers would also fake the orderings under test); tolerances are generous
// for CI jitter but strict enough that a stage attributed to the wrong bucket goes red.
// The failure path matters most: a compose that THROWS must still record its duration —
// timings that vanish exactly when things go wrong would hide the tail we exist to measure.

const DELAY = { embed: 40, retrieve: 60, compose: 80, verify: 30 };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let composeCalls = 0;

vi.mock('@/lib/teacher/deepinfra', () => ({
  embedQuery: vi.fn().mockImplementation(async () => {
    await wait(DELAY.embed);
    return new Array(1024).fill(0.1);
  }),
  compose: vi.fn().mockImplementation(async () => {
    composeCalls++;
    await wait(DELAY.compose);
    if (composeCalls === 1) return 'NOT JSON {{{'; // attempt 1: json_parse violation, no verify
    return JSON.stringify({ ok: true });
  }),
  composeModel: 'test-model',
}));

vi.mock('@/lib/teacher/retrieve', () => ({
  retrieveCommentary: vi.fn().mockImplementation(async () => {
    await wait(DELAY.retrieve);
    return [
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
        metadata: { author: 'Matthew Henry', sourceTitle: 'Commentary', tradition: 'Reformed', book: 'John', chapter: 1, verseStart: 1, verseEnd: 1 },
      },
    ];
  }),
  retrieveSongVerse: vi.fn().mockResolvedValue([]),
  retrieveSermonLane: vi.fn().mockResolvedValue([]),
  retrieveTheologyLane: vi.fn().mockResolvedValue([]),
  retrieveHistorianLane: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/teacher/normalize-contract', () => ({
  normalizeContract: vi.fn().mockImplementation((parsed: unknown) => parsed),
}));

vi.mock('@/verifier/v1', () => ({
  verifyV1: vi.fn().mockImplementation(async () => {
    await wait(DELAY.verify);
    return { ok: true };
  }),
}));

vi.mock('@/lib/teacher/routing', () => ({
  hasPassageCoverage: vi.fn().mockReturnValue(true),
}));

vi.mock('../../bible/pericopes', () => ({
  resolveIntent: vi.fn().mockReturnValue({ inject: [], floor: [] }),
}));

vi.mock('../../bible/verse-id', () => ({
  formatVerseId: vi.fn().mockReturnValue('John 1:1'),
}));

describe('teach() stage timings (B1)', () => {
  beforeEach(() => {
    process.env.DEEPINFRA_API_KEY = 'test-key';
    composeCalls = 0;
  });

  it('reproduces seeded stage delays, records EVERY compose attempt, and totals coherently', async () => {
    const { meta } = await teach('What does John 1:1 mean?', {});
    const stage = meta.stageMs!;
    expect(stage).toBeDefined();

    // Each bucket holds at least its seeded delay and not wildly more (attribution, not noise).
    expect(stage.embed).toBeGreaterThanOrEqual(DELAY.embed - 5);
    expect(stage.embed).toBeLessThan(DELAY.embed + 150);
    expect(stage.retrieve).toBeGreaterThanOrEqual(DELAY.retrieve - 5);
    expect(stage.retrieve).toBeLessThan(DELAY.retrieve + 150);

    // Attempt 1 composed invalid JSON (no verify sample); attempt 2 composed + verified.
    // SEED: drop the timing push from compose's catch/invalid path -> RED: only one sample.
    expect(meta.attempts).toBe(2);
    expect(stage.compose).toHaveLength(2);
    for (const ms of stage.compose) {
      expect(ms).toBeGreaterThanOrEqual(DELAY.compose - 5);
      expect(ms).toBeLessThan(DELAY.compose + 150);
    }
    expect(stage.verify).toHaveLength(1);
    expect(stage.verify[0]).toBeGreaterThanOrEqual(DELAY.verify - 5);

    // The total covers the parts — a stopwatch that loses stages reads under its own sum.
    const partsSum = stage.embed + stage.retrieve + stage.lanes + stage.compose[0]! + stage.compose[1]! + stage.verify[0]!;
    expect(stage.total).toBeGreaterThanOrEqual(partsSum - 10);
    expect(typeof meta.coldStart).toBe('boolean');
  });

  it('a compose that THROWS still records its duration (the tail must not hide)', async () => {
    const { compose } = await import('@/lib/teacher/deepinfra');
    (compose as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      await wait(DELAY.compose);
      throw new Error('provider blew up');
    });
    const { meta } = await teach('What does John 1:1 mean?', {});
    const stage = meta.stageMs!;
    // EXACT accounting: one sample per attempt, thrown attempts included. `>=` here was the
    // weak assertion the first mutation run exposed — the dropped catch-path sample still left
    // two samples from the retry chain, and the test stayed green. One sample PER attempt is
    // the property; anything less hides exactly the failing-provider tail we measure for.
    expect(stage.compose).toHaveLength(meta.attempts);
    expect(stage.compose[0]).toBeGreaterThanOrEqual(DELAY.compose - 5);
  });
});
