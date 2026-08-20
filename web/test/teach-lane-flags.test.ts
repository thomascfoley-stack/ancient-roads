import { describe, expect, it, vi, beforeEach } from 'vitest';
import { teach } from '@/lib/teacher/teach';

// The exegetical `retrieveCommentary` pool resolves empty, so teach() short-
// circuits to `kind: 'empty'` immediately after the lane Promise.all — fast and
// deterministic, with no need to mock compose()/the verifier. The lane fetches
// (or skips) have already happened by that point (teach.ts constructs all four
// lane promises, then retrieveCommentary, then awaits Promise.all — BEFORE the
// empty-retrieval check), so this still proves what fired and what didn't.
const retrieveSongVerse = vi.fn().mockResolvedValue([]);
const retrieveSermonLane = vi.fn().mockResolvedValue([]);
const retrieveTheologyLane = vi.fn().mockResolvedValue([]);
const retrieveHistorianLane = vi.fn().mockResolvedValue([]);
const retrieveCommentary = vi.fn().mockResolvedValue([]);

vi.mock('@/lib/teacher/deepinfra', () => ({
  embedQuery: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
  compose: vi.fn(),
  composeModel: 'test-model',
}));

vi.mock('@/lib/teacher/retrieve', () => ({
  retrieveCommentary: (...args: unknown[]) => retrieveCommentary(...args),
  retrieveSongVerse: (...args: unknown[]) => retrieveSongVerse(...args),
  retrieveSermonLane: (...args: unknown[]) => retrieveSermonLane(...args),
  retrieveTheologyLane: (...args: unknown[]) => retrieveTheologyLane(...args),
  retrieveHistorianLane: (...args: unknown[]) => retrieveHistorianLane(...args),
}));

vi.mock('@/lib/teacher/routing', () => ({
  hasPassageCoverage: vi.fn().mockReturnValue(true),
}));

vi.mock('../../bible/pericopes', () => ({
  resolveIntent: vi.fn().mockReturnValue({ inject: [], floor: [] }),
}));

describe('teach(): caller-controlled lane flags', () => {
  beforeEach(() => {
    process.env.DEEPINFRA_API_KEY = 'test-key';
    vi.clearAllMocks();
    retrieveSongVerse.mockResolvedValue([]);
    retrieveSermonLane.mockResolvedValue([]);
    retrieveTheologyLane.mockResolvedValue([]);
    retrieveHistorianLane.mockResolvedValue([]);
    retrieveCommentary.mockResolvedValue([]);
  });

  // CONTRACT CHANGE 2026-08-20 (owner decision #4, standalone-history ruling): the historian lane
  // is explicit OPT-IN. Omitted lanes now fire THREE lanes; historians requires `historians: true`,
  // which nothing in the product sends anymore — the voices picker no longer offers it.
  it('fires the three voices lanes when lanes is omitted; historians stays OFF (decision #4)', async () => {
    await teach('What is grace?', {});
    expect(retrieveSongVerse).toHaveBeenCalledTimes(1);
    expect(retrieveSermonLane).toHaveBeenCalledTimes(1);
    expect(retrieveTheologyLane).toHaveBeenCalledTimes(1);
    expect(retrieveHistorianLane).not.toHaveBeenCalled();
  });

  it('historians fires ONLY on explicit opt-in — the flip that makes retirement controllable', async () => {
    await teach('q', { lanes: { historians: true } });
    expect(retrieveHistorianLane).toHaveBeenCalledTimes(1);
  });

  it('skips a lane whose flag is explicitly false, and still fires the others', async () => {
    await teach('What is grace?', { lanes: { sermons: false } });
    expect(retrieveSermonLane).not.toHaveBeenCalled();
    expect(retrieveSongVerse).toHaveBeenCalledTimes(1);
    expect(retrieveTheologyLane).toHaveBeenCalledTimes(1);
    expect(retrieveHistorianLane).not.toHaveBeenCalled(); // absent = OFF since decision #4
  });

  it('skips every lane when every flag is false — the exegetical retrieval is never gated by it', async () => {
    await teach('What is grace?', { lanes: { sermons: false, theology: false, songVerse: false, historians: false } });
    expect(retrieveSermonLane).not.toHaveBeenCalled();
    expect(retrieveTheologyLane).not.toHaveBeenCalled();
    expect(retrieveSongVerse).not.toHaveBeenCalled();
    expect(retrieveHistorianLane).not.toHaveBeenCalled();
    expect(retrieveCommentary).toHaveBeenCalledTimes(1);
  });
});
