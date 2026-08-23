// searchHistory RUNS ITS INDEPENDENT WORK AT THE SAME TIME, AND FOLDS IT IN THE OLD ORDER.
//
// The owner's report on 2026-08-22 was that a history search "seems like it's paused". It was not
// paused; it was six round trips in a row — vocab, entity, period, embed, KNN, FTS, coverage —
// where only two of them depend on another's result. Measured against dev before the change:
// 3.39s / 1.33s / 1.82s / 2.17s / 2.22s on five real queries; after: 0.95 / 0.38 / 0.54 / 0.50 /
// 0.44, with all five payloads deep-equal to the serial ones.
//
// TWO PROPERTIES, and the second is the one that makes the first safe.
//
//   1. CONCURRENCY. The FTS query must be in flight before the embedding call resolves. Under the
//      old serial shape it could not even start until the KNN had returned. This is the check that
//      goes red if someone "tidies" the Promise.all back into a run of awaits.
//   2. FOLD ORDER. `fold` keeps the FIRST row object seen for a section id and only marks it — so
//      a row folded from the entity query keeps NO cosine (the batch backfill supplies it later),
//      while the same row folded from the KNN first would carry the KNN's cosine and never be
//      backfilled. Those are different numbers into `scoreSection`, i.e. a ranking change. Firing
//      the queries together makes their COMPLETION order arbitrary, so the fold order has to be
//      pinned explicitly — this test is what pins it.
//
// SEEDS, all three executed rather than asserted:
//   * Swap the `fold(entityHit.rows, …)` and `fold(knn.rows, …)` lines → case 2 RED.
//   * Move the FTS query's CONSTRUCTION below `await knnP` — the shape this replaced → case 1 RED.
//   * Await the four promises one at a time instead of in one Promise.all → STILL GREEN, and that
//     is correct rather than a hole. The concurrency comes from constructing every query before
//     awaiting any of them; sequential awaits over already-issued promises are still concurrent.
//     Case 1 is deliberately about WHEN A QUERY IS ISSUED, not about the shape of the await. The
//     first draft of this comment claimed the sequential-await seed would redden it; running the
//     seed is what corrected that, which is the entire reason seeds get run here.
//
// No DB and no DeepInfra: both are mocked, because the property is about ORDER and OVERLAP in this
// function, not about what Postgres returns.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const timeline: string[] = [];

/** Row shape as the SELECT list returns it (see ROW_COLS). */
const row = (id: number, extra: Record<string, unknown> = {}) => ({
  id, source_id: 1, ordinal: id, heading: `Chapter ${id}`,
  body: `Body of section ${id}, long enough to be excerpted without any trimming at all.`,
  period_start_year: null, period_end_year: null,
  slug: 'schaff-hcc1', title: 'History of the Christian Church', author: 'Philip Schaff',
  ...extra,
});

// Section 1 is returned by BOTH the entity query and the KNN, which is what makes fold order
// observable: the entity copy has no cosine, the KNN copy has 0.95, and the backfill answers 0.10.
// Above the floor (0.6) the row is marked 'text'; below it, it is not.
const ENTITY_ROWS = [row(1)];
const KNN_ROWS = [row(1, { cosine: 0.95 }), row(2, { cosine: 0.95 })];
const BACKFILL = [{ section_id: '1', cosine: 0.1 }];

function fakeSql() {
  const tag = (): Promise<unknown[]> => Promise.resolve([]);
  return Object.assign(tag, {
    query: async (text: string): Promise<unknown[]> => {
      if (text.includes('entity_slug AS slug')) { timeline.push('vocab'); return [{ slug: 'ephesus', label: 'Ephesus' }]; }
      if (text.includes('section_history_anchors a')) { timeline.push('entity'); return ENTITY_ROWS; }
      if (text.includes('ORDER BY he.embedding')) { timeline.push('knn'); return KNN_ROWS; }
      if (text.includes('he.section_id = ANY')) { timeline.push('backfill'); return BACKFILL; }
      if (text.includes('plainto_tsquery')) { timeline.push('fts:start'); return []; }
      if (text.includes('count(DISTINCT')) { timeline.push('coverage'); return [{ works: 28, sections: 40463 }]; }
      throw new Error(`unmocked query: ${text.slice(0, 60)}`);
    },
    transaction: async (qs: unknown[]): Promise<unknown[]> => [null, await qs[1]],
  });
}

vi.mock('@/lib/db', () => ({ getDb: () => fakeSql() }));
vi.mock('@/lib/teacher/deepinfra', () => ({
  embedQuery: async () => {
    // A real embedding is a network call. The delay is the point: everything that does not need
    // the vector should already be in flight before this resolves.
    await new Promise((r) => setTimeout(r, 60));
    timeline.push('embed:resolve');
    return [0.1, 0.2, 0.3];
  },
}));

const { searchHistory } = await import('@/lib/history-search-db');

beforeEach(() => { timeline.length = 0; });

describe('searchHistory', () => {
  it('has the text search in flight before the embedding comes back', async () => {
    await searchHistory('Ephesus');
    const fts = timeline.indexOf('fts:start');
    const embed = timeline.indexOf('embed:resolve');
    expect(fts, 'the FTS query never ran').toBeGreaterThanOrEqual(0);
    expect(embed, 'the embedding never resolved').toBeGreaterThanOrEqual(0);
    expect(fts, 'FTS is queued behind the embedding — the searches are serial again').toBeLessThan(embed);
  });

  it('folds the entity rows before the vector rows, so the backfill still owns the cosine', async () => {
    const res = await searchHistory('Ephesus');
    const one = res.results.flatMap((g) => g.sections).find((s) => s.sectionId === 1);
    expect(one, 'section 1 dropped out of the results entirely').toBeTruthy();
    // Entity-first: the kept object has no cosine, the backfill's 0.10 lands, and 0.10 is below
    // HISTORY_TEXT_COSINE_FLOOR (0.6) — so this row is entity evidence only. Vector-first would
    // have kept 0.95 and added 'text', changing what the reader is told matched and by how much.
    expect(one!.matched).toEqual(['entity']);
  });

  it('still asks for the coverage numbers it prints in the footer', async () => {
    const res = await searchHistory('Ephesus');
    expect(res.coverage).toEqual({ works: 28, sections: 40463 });
  });
});
