// user_active_day — the vendor-free activity signal (migration 130).
//
// Properties pinned here, all red-provable:
//   1. ONE WRITE PER USER PER DAY. The whole cost argument for this table over storing pageviews
//      rests on the bound; if the cache stopped working, a busy reader would write a row per
//      request and the table would grow with traffic instead of with people.
//      SEED: delete the `written.has(key)` guard → the dedupe test goes red.
//   2. 23505 IS SUCCESS, NOT AN ERROR. The table's RLS is INSERT-only, so `ON CONFLICT DO NOTHING`
//      is unusable (it needs the proposed row to be SELECT-visible). The duplicate is caught.
//      SEED: remove the 23505 branch → the "already active" test goes red with a logged error.
//   3. FAILS OPEN. A failed activity write must never reach the reader.
//      SEED: rethrow in insertActiveDay → the fail-open test goes red.
//   4. runAsUser IS USED, so the row is written under the GUC the policy binds to. A plain getDb()
//      insert would be refused by the policy in production while passing a naive mock.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { after } from 'next/server';
import { runAsUser } from '@/lib/db';

// The module is imported FRESH in each test (vi.resetModules below) so its per-instance dedupe
// cache starts empty. active-day.ts deliberately exports no reset helper: it writes user rows, and
// `test/invariants/no-dead-user-table-writer.test.ts` flags any export production never calls —
// correctly, so the scaffolding lives here instead.
type ActiveDay = typeof import('@/lib/active-day');
let markActiveDay: ActiveDay['markActiveDay'];
let utcDay: ActiveDay['utcDay'];

type SqlMock = ReturnType<typeof vi.fn>;
const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn() }));

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => sqlMock),
  runAsUser: vi.fn(async (_userId: string, build: (sql: SqlMock) => Promise<unknown>[]) => {
    await Promise.all(build(sqlMock));
    return [];
  }),
}));
// after() runs the callback immediately here, so the scheduled write is observable.
vi.mock('next/server', () => ({ after: vi.fn((fn: () => unknown) => void fn()) }));

beforeEach(async () => {
  vi.resetModules(); // fresh module ⇒ empty dedupe cache, without a production-only export
  ({ markActiveDay, utcDay } = await import('@/lib/active-day'));
  sqlMock.mockReset().mockReturnValue(Promise.resolve([]));
  vi.mocked(runAsUser).mockClear();
  vi.mocked(after).mockClear();
  // `AfterTask` is a callback OR a promise; the cast matches ask-outcome-persist.test.ts.
  vi.mocked(after).mockImplementation((fn) => void (fn as () => unknown)());
});

describe('markActiveDay — bounded by people, not by traffic', () => {
  it('writes one row, through runAsUser so the RLS policy binds', async () => {
    markActiveDay('user-1');
    await new Promise((r) => setImmediate(r));
    expect(runAsUser).toHaveBeenCalledWith('user-1', expect.any(Function));
    const [userId, day] = sqlMock.mock.calls[0]!.slice(1);
    expect(userId).toBe('user-1');
    expect(day).toBe(utcDay());
  });

  it('writes ONCE for the same user on the same day, however many requests they make', async () => {
    for (let i = 0; i < 50; i++) markActiveDay('user-1');
    await new Promise((r) => setImmediate(r));
    expect(sqlMock.mock.calls.length, 'the per-instance cache is what keeps this table small').toBe(1);
  });

  it('writes separately for different users', async () => {
    markActiveDay('user-1');
    markActiveDay('user-2');
    await new Promise((r) => setImmediate(r));
    expect(sqlMock.mock.calls.length).toBe(2);
  });

  it('ignores an empty user id rather than writing a junk row', async () => {
    markActiveDay('');
    await new Promise((r) => setImmediate(r));
    expect(sqlMock).not.toHaveBeenCalled();
  });
});

describe('markActiveDay — failure handling', () => {
  it('treats 23505 as success: already marked active today, nothing logged', async () => {
    const err = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
    sqlMock.mockReturnValue(Promise.reject(err));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    markActiveDay('user-1');
    await new Promise((r) => setImmediate(r));
    expect(errSpy, 'a duplicate is the expected no-op, not an incident').not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('fails open on a real error — logs once, never throws at the caller', async () => {
    sqlMock.mockReturnValue(Promise.reject(new Error('relation "user_active_day" does not exist')));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => markActiveDay('user-1')).not.toThrow();
    await new Promise((r) => setImmediate(r));
    expect(errSpy).toHaveBeenCalledWith('[user_active_day] write failed:', expect.stringContaining('user_active_day'));
    errSpy.mockRestore();
  });

  it('after() outside a request scope falls back to fire-and-forget', async () => {
    vi.mocked(after).mockImplementation(() => { throw new Error('`after` was called outside a request scope'); });
    expect(() => markActiveDay('user-1')).not.toThrow();
    await new Promise((r) => setImmediate(r));
    expect(runAsUser).toHaveBeenCalledWith('user-1', expect.any(Function));
  });
});

describe('utcDay', () => {
  it('is a plain UTC calendar date, which is what the PK dedupes on', () => {
    expect(utcDay(new Date('2026-08-24T23:59:59Z'))).toBe('2026-08-24');
    expect(utcDay(new Date('2026-08-25T00:00:01Z'))).toBe('2026-08-25');
  });
});
