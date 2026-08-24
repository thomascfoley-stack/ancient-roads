// search-outcome persistence — the write path behind scheduleSearchOutcome (migration 127,
// the query log for every search surface). Two properties, both red-provable, mirroring
// ask-outcome-persist.test.ts:
//
//   1. FAIL-OPEN: a failing insert must never break a search. recordSearchOutcome swallows
//      its own error into one caught log line; scheduleSearchOutcome's after() fallback
//      cannot throw either. SEED: make recordSearchOutcome rethrow (drop the catch) and the
//      "insert failure" tests go red.
//   2. THE ROW LANDS with the right fields: surface, the typed query (bounded), validated
//      params as JSON, counts, latency — and user_id bound through runAsUser for an authed
//      search / a plain NULL insert for a public one. SEED: drop `params` from the INSERT
//      column list and the field assertions go red.
//
// The DB is mocked at @/lib/db (the neon tagged-template function), so values are asserted
// from the bind parameters — no live database, runs in CI.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { after } from 'next/server';
import { getDb, runAsUser } from '@/lib/db';
import {
  buildSearchOutcomeRow,
  recordSearchOutcome,
  scheduleSearchOutcome,
  type SearchOutcomeInput,
} from '@/lib/search-outcomes';

type SqlMock = ReturnType<typeof vi.fn>;

const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn() }));

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => sqlMock),
  runAsUser: vi.fn(async (_userId: string, build: (sql: SqlMock) => Promise<unknown>[]) => {
    await Promise.all(build(sqlMock));
    return [];
  }),
}));

vi.mock('next/server', () => ({ after: vi.fn() }));

function input(overrides: Partial<SearchOutcomeInput> = {}): SearchOutcomeInput {
  return {
    surface: 'works',
    userId: null,
    query: 'good shepherd',
    params: { catalogs: ['sermons'], traditions: ['reformed'] },
    resultCount: 12,
    total: 340,
    latencyMs: 82,
    ...overrides,
  };
}

/** Bind parameters of the first issued statement (tagged-template values). */
function firstInsertValues(): unknown[] {
  expect(sqlMock.mock.calls.length).toBeGreaterThan(0);
  return sqlMock.mock.calls[0]!.slice(1);
}

// The INSERT's column order, typed HERE rather than read out of the module under test — the
// same deliberate hand-typed list as ask-outcome-persist.test.ts: if the statement's order
// changes, this goes red and someone looks, instead of every positional index silently
// shifting (the 125 lesson).
const INSERT_COLS = ['user_id', 'surface', 'query', 'params', 'result_count', 'total', 'latency_ms'] as const;

function val(name: (typeof INSERT_COLS)[number]): unknown {
  const values = firstInsertValues();
  expect(values).toHaveLength(INSERT_COLS.length);
  return values[INSERT_COLS.indexOf(name)];
}

beforeEach(() => {
  sqlMock.mockReset().mockReturnValue(Promise.resolve([]));
  vi.mocked(runAsUser).mockClear();
  vi.mocked(getDb).mockClear();
  vi.mocked(after).mockReset();
});

describe('recordSearchOutcome — the row lands with the right fields', () => {
  it('public search: plain insert with NULL user_id, runAsUser untouched', async () => {
    await recordSearchOutcome(input());
    expect(runAsUser).not.toHaveBeenCalled();
    expect(getDb).toHaveBeenCalled();
    const [userId, surface, query, params, resultCount, total, latencyMs] = firstInsertValues();
    expect(userId).toBeNull();
    expect(surface).toBe('works');
    expect(query).toBe('good shepherd');
    expect(JSON.parse(params as string)).toEqual({ catalogs: ['sermons'], traditions: ['reformed'] });
    expect(resultCount).toBe(12);
    expect(total).toBe(340);
    expect(latencyMs).toBe(82);
  });

  it('authed search: insert goes through runAsUser with user_id bound', async () => {
    await recordSearchOutcome(input({ surface: 'my_works', userId: 'user-123', params: { mode: 'fused' } }));
    expect(runAsUser).toHaveBeenCalledWith('user-123', expect.any(Function));
    expect(getDb).not.toHaveBeenCalled();
    expect(val('user_id')).toBe('user-123');
    expect(val('surface')).toBe('my_works');
  });

  it('absent params/total land as {} and NULL, not as the strings "undefined"/"null"', async () => {
    await recordSearchOutcome(input({ params: undefined, total: undefined }));
    expect(JSON.parse(val('params') as string)).toEqual({});
    expect(val('total')).toBeNull();
  });

  it('the query is bounded at 500 code points — belt and braces behind the route caps', async () => {
    await recordSearchOutcome(input({ query: 'x'.repeat(2000) }));
    expect((val('query') as string).length).toBeLessThanOrEqual(500);
  });

  it('buildSearchOutcomeRow clamps counts and latency to non-negative integers', () => {
    const row = buildSearchOutcomeRow(input({ resultCount: -3, latencyMs: 41.7 }));
    expect(row.result_count).toBe(0);
    expect(row.latency_ms).toBe(42);
  });
});

describe('recordSearchOutcome — fail-open: a logging failure never breaks a search', () => {
  it('a rejecting insert resolves, and logs exactly the caught failure', async () => {
    sqlMock.mockReturnValue(Promise.reject(new Error('relation "search_outcomes" does not exist')));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // The search completed; this is the write after it. It must RESOLVE, not throw.
    await expect(recordSearchOutcome(input())).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith(
      '[search_outcomes] persist failed:',
      expect.stringContaining('search_outcomes'),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"evt":"error"'));
    errSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe('scheduleSearchOutcome — off the request path', () => {
  it('schedules the write via after(), which runs it to completion', async () => {
    vi.mocked(after).mockImplementation((fn) => void (fn as () => Promise<void>)());
    scheduleSearchOutcome(input({ userId: 'user-123' }));
    expect(after).toHaveBeenCalledOnce();
    await new Promise((r) => setImmediate(r)); // let the scheduled write settle
    expect(runAsUser).toHaveBeenCalledWith('user-123', expect.any(Function));
  });

  it('after() outside a request scope falls back to fire-and-forget', async () => {
    vi.mocked(after).mockImplementation(() => {
      throw new Error('`after` was called outside a request scope');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => scheduleSearchOutcome(input({ userId: 'user-123' }))).not.toThrow();
    await new Promise((r) => setImmediate(r));
    expect(runAsUser).toHaveBeenCalledWith('user-123', expect.any(Function));
    expect(errSpy).not.toHaveBeenCalled(); // the fallback write SUCCEEDED — nothing to log
    errSpy.mockRestore();
  });
});
