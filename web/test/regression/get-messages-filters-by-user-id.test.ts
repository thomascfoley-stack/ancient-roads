// Regression — H1: getMessages must filter by caller user_id, not only channel/chat id.
//
// This runs in CI (no DB). The previous version asserted only `sql.toMatch(/user_id/)`,
// which is structure-not-behavior: it PASSES on the decoy `WHERE user_id IS NOT NULL`
// (caller filter gone, any authenticated user reads any channel). We instead capture the
// bound parameter VALUES and assert the CALLER's id is the value bound to the `user_id =`
// predicate — a behavioral assertion at the mock layer. The full two-account proof lives
// in web/test/invariants/tenancy.test.ts (DB-backed; see the skipIf-in-CI finding in
// docs/FALSE_CONFIDENCE_AUDIT.md — that behavioral proof does NOT run in CI without a DB).

import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured: { sql: string; userId: string; values: unknown[] }[] = [];

vi.mock('@/lib/db', () => ({
  runAsUser: async (userId: string, build: (sql: SqlTag) => unknown[]) => {
    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''), '');
      captured.push({ sql: text, userId, values });
      return Promise.resolve([]);
    }) as unknown as SqlTag;
    sql.transaction = async (queries: unknown) => queries;
    await build(sql);
    return [[]];
  },
}));

type SqlTag = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {
  transaction: (queries: unknown) => Promise<unknown>;
};

/** The value bound to the `<column> = $N` predicate, or undefined if the column is not
 *  compared to a bound parameter at all (e.g. `IS NOT NULL`, a literal, or absent). */
function boundValueFor(column: string, cap: { sql: string; values: unknown[] }): unknown {
  const m = cap.sql.match(new RegExp(`${column}\\s*=\\s*\\$(\\d+)`));
  if (!m) return undefined;
  return cap.values[Number(m[1]) - 1];
}

describe('get-messages-filters-by-user-id (H1)', () => {
  beforeEach(() => {
    captured.length = 0;
    vi.resetModules();
  });

  it('channel reads bind the CALLER id to the user_id predicate', async () => {
    const { getMessages } = await import('@/lib/chat');
    await getMessages('user-abc', 'channel-xyz', null);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.userId).toBe('user-abc');
    // Caller id must be the value compared to user_id — not merely present in the text.
    expect(boundValueFor('user_id', captured[0]!)).toBe('user-abc');
    expect(boundValueFor('channel_id', captured[0]!)).toBe('channel-xyz');
  });

  it('chat reads bind the CALLER id to the user_id predicate', async () => {
    const { getMessages } = await import('@/lib/chat');
    await getMessages('user-abc', null, 'chat-xyz');
    expect(captured).toHaveLength(1);
    expect(boundValueFor('user_id', captured[0]!)).toBe('user-abc');
    expect(boundValueFor('chat_id', captured[0]!)).toBe('chat-xyz');
  });
});
