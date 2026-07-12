// Regression — H1: getMessages must filter by caller user_id, not only channel/chat id.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured: { sql: string; userId: string }[] = [];

vi.mock('@/lib/db', () => ({
  runAsUser: async (userId: string, build: (sql: SqlTag) => unknown[]) => {
    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''), '');
      captured.push({ sql: text, userId });
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

describe('get-messages-filters-by-user-id (H1)', () => {
  beforeEach(() => {
    captured.length = 0;
    vi.resetModules();
  });

  it('channel reads include an explicit user_id predicate', async () => {
    const { getMessages } = await import('@/lib/chat');
    await getMessages('user-abc', 'channel-xyz', null);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.userId).toBe('user-abc');
    expect(captured[0]!.sql).toMatch(/user_id/);
    expect(captured[0]!.sql).toMatch(/channel_id/);
  });

  it('chat reads include an explicit user_id predicate', async () => {
    const { getMessages } = await import('@/lib/chat');
    await getMessages('user-abc', null, 'chat-xyz');
    expect(captured).toHaveLength(1);
    expect(captured[0]!.sql).toMatch(/user_id/);
    expect(captured[0]!.sql).toMatch(/chat_id/);
  });
});
