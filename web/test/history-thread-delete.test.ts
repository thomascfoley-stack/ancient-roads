// D49 (DEEP_SWEEP) — history threads were WRITE-ONLY. Every /api/history/search persisted a
// `chats` row plus two `messages` with persona 'history', and nothing could ever remove them:
// `deleteThread` fences on THREAD_PERSONA ('ask'), so a history thread id deleted nothing while
// DELETE /api/research/[id] answered 204 anyway. Invisible unbounded accumulation, and a delete
// control that reported success.
//
// WHAT THIS FIX DELIBERATELY DOES NOT CHANGE: the route's 204-always. That is not a lie about
// this id — it is a documented anti-enumeration decision ("there is then NO existence oracle at
// all"), the same class as the sign-up oracle fixed earlier this sweep. Answering 404 for
// "nothing deleted" would hand any caller a "does this id exist and is it yours" probe. So the
// route is untouched and the STORE is made truthful instead: 204 now means the delete really
// happened. Never weaken a guarantee to close a finding.
//
// Real DB (dev branch), like its history-threads-db neighbour: the whole point is the persona
// fence, which is SQL. A mock would assert the mock.
import { afterAll, describe, expect, it } from 'vitest';
import { createHistoryThread, getHistoryThread, HISTORY_PERSONA } from '@/lib/history-threads';
import { deleteThread } from '@/lib/research';
import { runAsUser } from '@/lib/db';
import type { HistoryResponse } from '@/lib/history-search-db';
import { requireDbInCi } from './helpers/env';
import { announceSkip } from './helpers/loud-skip';
import { sweepQaResidue } from './helpers/qa-residue';

const dbUrl = requireDbInCi();
const U = `qa-history-delete-${Date.now()}`;

const SKIP = announceSkip(
  'history thread delete (executed, real DB)',
  [{ name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) }],
  'the persona fence that decided whether a history thread could ever be removed',
);

const payload: HistoryResponse = {
  interpretation: { entities: [], period: null },
  closest: null,
  results: [],
  coverage: { works: 0, sections: 0 },
};

const countRows = async (userId: string, threadId: string) => {
  const [chats, msgs] = await runAsUser(userId, (sql) => [
    sql`SELECT id FROM chats WHERE id = ${threadId} AND user_id = ${userId}`,
    sql`SELECT id FROM messages WHERE chat_id = ${threadId} AND user_id = ${userId}`,
  ]);
  return { chats: (chats as unknown[]).length, messages: (msgs as unknown[]).length };
};

describe.skipIf(SKIP)('D49 — a history thread can actually be deleted', () => {
  afterAll(async () => { await sweepQaResidue([U.slice(0, 20)], ['messages', 'chats']); });

  it('deleteThread removes the chat AND its messages, and reports that it did', async () => {
    const id = await createHistoryThread(U, 'when was Nicaea', payload);
    expect(await countRows(U, id)).toEqual({ chats: 1, messages: 2 });

    const removed = await deleteThread(U, id);
    expect(removed, 'the store must report the truth — the route trusts it').toBe(true);
    expect(await countRows(U, id)).toEqual({ chats: 0, messages: 0 });
    expect(await getHistoryThread(U, id)).toBeNull();
  });

  it('a chat of some OTHER persona is still fenced out — the widening is exactly two personas', async () => {
    const [rows] = await runAsUser(U, (sql) => [
      sql`INSERT INTO chats (user_id, title, persona) VALUES (${U}, 'general chat', 'general') RETURNING id`,
    ]);
    const id = (rows as { id: string }[])[0]!.id;
    expect(await deleteThread(U, id), 'general chats are not research or history threads').toBe(false);
    expect((await countRows(U, id)).chats).toBe(1);
  });

  it('the persona constant is the one history threads are written with', () => {
    expect(HISTORY_PERSONA).toBe('history');
  });
});
