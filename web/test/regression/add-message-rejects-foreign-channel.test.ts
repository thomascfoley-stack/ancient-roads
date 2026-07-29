// Regression — H2: addMessage must reject writes to another user's channel/chat.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let insertReturnsRow = false;

vi.mock('@/lib/db', () => ({
  runAsUser: async (_userId: string, build: (sql: SqlTag) => unknown[]) => {
    const sql = ((_strings: TemplateStringsArray, ..._values: unknown[]) =>
      Promise.resolve(insertReturnsRow ? [{ id: 'm1', role: 'user', content: 'x', sources: [], created_at: '' }] : [])) as unknown as SqlTag;
    sql.transaction = async (queries: unknown) => queries;
    await build(sql);
    return [insertReturnsRow ? [{ id: 'm1', role: 'user', content: 'x', sources: [], created_at: '' }] : []];
  },
}));

type SqlTag = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {
  transaction: (queries: unknown) => Promise<unknown>;
};

describe('add-message-rejects-foreign-channel (H2)', () => {
  beforeEach(() => {
    insertReturnsRow = false;
    vi.resetModules();
  });

  it('throws when INSERT returns zero rows (channel not owned)', async () => {
    const { addMessage } = await import('@/lib/chat');
    await expect(addMessage('user-b', 'foreign-channel', null, 'user', 'hack')).rejects.toThrow(
      /not found|not owned/i,
    );
  });

  it('uses INSERT…SELECT…WHERE EXISTS (atomic ownership check)', () => {
    const src = readFileSync(path.join(__dirname, '../../src/lib/chat.ts'), 'utf-8');
    expect(src).toMatch(/INSERT INTO messages[\s\S]*WHERE EXISTS \(SELECT 1 FROM channels/);
    expect(src).toMatch(/INSERT INTO messages[\s\S]*WHERE EXISTS \(SELECT 1 FROM chats/);
  });
});
