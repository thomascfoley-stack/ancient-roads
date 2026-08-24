// createHistoryThread against the REAL dev DB — the executed half of BUG_SWEEP B6 (#113).
// The mocked suite (history-threads-create.test.ts) proves the atomicity property; this one
// proves the one-statement CTE actually runs against Postgres: the `sources` jsonb cast must
// survive the UNION ALL (the sweep's warning — both branches must type the column the same),
// and getHistoryThread must read back what was written. Skips without a DB, like its
// research-store neighbours.
import { afterAll, describe, expect, it } from 'vitest';
import { createHistoryThread, getHistoryThread, HISTORY_PERSONA } from '@/lib/history-threads';
import { runAsUser } from '@/lib/db';
import type { HistoryResponse } from '@/lib/history-search-db';
import { requireDbInCi } from './helpers/env';
import { announceSkip } from './helpers/loud-skip';
import { sweepQaResidue } from './helpers/qa-residue';

const dbUrl = requireDbInCi();
const U = `qa-history-thread-${Date.now()}`;

const SKIP = announceSkip(
  'createHistoryThread (executed, real DB)',
  [{ name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) }],
  'the one-statement chat+messages insert, jsonb cast across the UNION ALL',
);

const payload: HistoryResponse = {
  interpretation: { entities: [{ slug: 'ephesus', label: 'Ephesus' }], period: null },
  closest: null,
  results: [],
  coverage: { works: 0, sections: 0 },
};

describe.skipIf(SKIP)('createHistoryThread (executed, real DB)', () => {
  afterAll(async () => {
    if (!dbUrl) return;
    try {
      await runAsUser(U, (sql) => [sql`DELETE FROM chats WHERE user_id = ${U} AND persona = ${HISTORY_PERSONA}`]);
    } catch (e) {
      console.error(`[teardown] chats for ${U} failed: ${(e as Error).message}`);
    }
    await sweepQaResidue(['qa-history-thread-'], ['chats']);
  });

  it('persists chat + both messages in one statement; the payload round-trips through jsonb', async () => {
    const threadId = await createHistoryThread(U, 'qa b6 executed check — who wrote about ephesus?', payload);
    const back = await getHistoryThread(U, threadId);
    expect(back, 'getHistoryThread returned null — a message row is missing').not.toBeNull();
    expect(back!.query).toBe('qa b6 executed check — who wrote about ephesus?');
    expect(back!.payload).toEqual(payload);
  });

  it('a surrogate pair on the truncation boundary stores no U+FFFD (#120, executed)', async () => {
    const query = `${'a'.repeat(76)}\u{1F600}tail`;
    const threadId = await createHistoryThread(U, query, payload);
    const [rows] = await runAsUser(U, (sql) => [
      sql`SELECT title FROM chats WHERE id = ${threadId} AND user_id = ${U}`,
    ]);
    const title = (rows as { title: string }[])[0]!.title;
    expect(title).not.toContain('�');
    expect(title).toBe(`${'a'.repeat(76)}\u{1F600}…`);
  });
});
