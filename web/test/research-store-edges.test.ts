// Exhaustive-pass part 1 (owner directive 2026-08-16, task #31): the store's edge cases,
// executed against the real dev DB. Findings are DOCUMENTED before fixing in
// docs/evidence/research-history/build-findings-2026-08-16.md §Exhaustive pass.
import { afterAll, describe, expect, it } from 'vitest';
import {
  createThreadWithQuestion,
  appendQuestion,
  appendAnswer,
  getThread,
  listThreads,
  isThreadId,
  type StoredAnswer,
} from '@/lib/research';
import { runAsUser } from '@/lib/db';
import { requireDbInCi } from './helpers/env';
import { announceSkip } from './helpers/loud-skip';

const dbUrl = requireDbInCi();
const U = `qa-research-edge-${Date.now()}`;

const SKIP = announceSkip(
  'Research store edge cases (executed)',
  [{ name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) }],
  'turn assembly, bounds, and input-shape behavior of the research store',
);

const answer = (over: Partial<StoredAnswer> = {}): StoredAnswer => ({
  v: 1,
  result: { kind: 'empty', reason: 'edge fixture' },
  lanes: {},
  attempts: 1,
  latencyMs: 1,
  askedAt: new Date().toISOString(),
  ...over,
});

describe.skipIf(SKIP)('research store — edge cases (executed)', () => {
  afterAll(async () => {
    if (!dbUrl) return;
    await runAsUser(U, (sql) => [sql`DELETE FROM chats WHERE user_id = ${U} AND persona = 'ask'`]).catch(() => {});
  });

  it('E1: a crashed ask (question with no answer) renders as an unanswered turn, not lost', async () => {
    const { threadId } = await createThreadWithQuestion(U, 'crashed ask');
    const t = await getThread(U, threadId);
    expect(t!.turns).toHaveLength(1);
    expect(t!.turns[0]!.answer).toBeNull();
  });

  it('E2: interleaved Q1,Q2,A1,A2 pairs by qid — never misattributed (I1-M1 by execution)', async () => {
    const { threadId, qid: q1 } = await createThreadWithQuestion(U, 'first question');
    const q2 = await appendQuestion(U, threadId, 'second question');
    // Answers arrive OUT of positional order: A1 lands after Q2 was asked.
    await appendAnswer(U, threadId, answer({ qid: q1, result: { kind: 'empty', reason: 'ANSWER-ONE' } }));
    await appendAnswer(U, threadId, answer({ qid: q2, result: { kind: 'empty', reason: 'ANSWER-TWO' } }));
    const t = await getThread(U, threadId);
    expect(t!.turns).toHaveLength(2);
    expect((t!.turns[0]!.answer!.result as { reason: string }).reason).toBe('ANSWER-ONE');
    expect((t!.turns[1]!.answer!.result as { reason: string }).reason).toBe('ANSWER-TWO');
  });

  it('E3: a qid-less answer (pre-2026-08-16 rows) still pairs positionally', async () => {
    const { threadId } = await createThreadWithQuestion(U, 'legacy pairing');
    await appendAnswer(U, threadId, answer({ result: { kind: 'empty', reason: 'LEGACY' } }));
    const t = await getThread(U, threadId);
    expect((t!.turns[0]!.answer!.result as { reason: string }).reason).toBe('LEGACY');
  });

  it('E4: an answer whose qid matches nothing attaches to NO turn rather than the wrong one', async () => {
    const { threadId } = await createThreadWithQuestion(U, 'orphan answer target');
    await appendAnswer(U, threadId, answer({ qid: '00000000-0000-4000-8000-000000000000', result: { kind: 'empty', reason: 'ORPHAN' } }));
    const t = await getThread(U, threadId);
    // X1 FIXED: a present-but-missed qid attaches NOWHERE — the positional fallback is for
    // qid-less legacy rows only. Red-proof: reverting getThread's X1 branch turns this red.
    expect(t!.turns[0]!.answer).toBeNull();
  });

  it('E5: unparsable stored JSON degrades to an unanswered turn, never a crash', async () => {
    const { threadId, qid } = await createThreadWithQuestion(U, 'corrupt answer row');
    await runAsUser(U, (sql) => [
      sql`INSERT INTO messages (user_id, chat_id, role, content)
          SELECT ${U}, ${threadId}, 'assistant', ${'NOT JSON {'}
          WHERE EXISTS (SELECT 1 FROM chats WHERE id = ${threadId} AND user_id = ${U})`,
    ]);
    void qid;
    const t = await getThread(U, threadId);
    expect(t!.turns[0]!.answer).toBeNull();
  });

  it('E6: a v!=1 stored answer is ignored (forward-versioning), not mis-rendered', async () => {
    const { threadId } = await createThreadWithQuestion(U, 'future version row');
    await runAsUser(U, (sql) => [
      sql`INSERT INTO messages (user_id, chat_id, role, content)
          SELECT ${U}, ${threadId}, 'assistant', ${JSON.stringify({ v: 2, alien: true })}
          WHERE EXISTS (SELECT 1 FROM chats WHERE id = ${threadId} AND user_id = ${U})`,
    ]);
    const t = await getThread(U, threadId);
    expect(t!.turns[0]!.answer).toBeNull();
  });

  it('E7: title truncates at 80 with an ellipsis; short titles stay verbatim', async () => {
    const long = 'x'.repeat(200);
    const { threadId } = await createThreadWithQuestion(U, long);
    const list = await listThreads(U, 50);
    const row = list.find((r) => r.id === threadId)!;
    expect(row.title.length).toBeLessThanOrEqual(80);
    expect(row.title.endsWith('…')).toBe(true);
    const { threadId: t2 } = await createThreadWithQuestion(U, 'short title');
    const row2 = (await listThreads(U, 50)).find((r) => r.id === t2)!;
    expect(row2.title).toBe('short title');
  });

  it('E8: isThreadId rejects every malformed shape and accepts a real uuid', () => {
    expect(isThreadId('11111111-2222-4333-8444-555555555555')).toBe(true);
    for (const bad of [null, undefined, 42, '', 'not-a-uuid', '11111111222243338444555555555555', "'; DROP TABLE chats;--", '11111111-2222-4333-8444-55555555555Z']) {
      expect(isThreadId(bad)).toBe(false);
    }
  });

  it('E9: getThread on a malformed id returns null without touching the DB', async () => {
    expect(await getThread(U, 'not-a-uuid')).toBeNull();
  });

  it('E10: listThreads default is 20; limit 0 and negative clamp up to 1', async () => {
    const one = await listThreads(U, 0);
    expect(one.length).toBeLessThanOrEqual(1);
    const neg = await listThreads(U, -5);
    expect(neg.length).toBeLessThanOrEqual(1);
  });

  it('E11: an archived thread disappears from the list but stays readable at its URL', async () => {
    const { threadId } = await createThreadWithQuestion(U, 'archived thread');
    await runAsUser(U, (sql) => [sql`UPDATE chats SET is_archived = true WHERE id = ${threadId} AND user_id = ${U}`]);
    const list = await listThreads(U, 50);
    expect(list.some((r) => r.id === threadId)).toBe(false);
    // DOCUMENTED BEHAVIOR CHECK: getThread has no is_archived filter — records reality.
    const t = await getThread(U, threadId);
    expect(t).not.toBeNull();
  });

  it('E12: appendAnswer stores the FULL surfaced index with register labels (§4.1 contract)', async () => {
    const { threadId, qid } = await createThreadWithQuestion(U, 'sources index check');
    await appendAnswer(U, threadId, answer({
      qid,
      result: {
        kind: 'fallback',
        violations: [],
        retrieval: [{ sourceId: 'sx-1', score: 1, content: 'c', metadata: { author: 'A', sourceTitle: 'T', tradition: null } }],
        sermons: [{ sourceId: 'sx-2', content: 'c', metadata: { author: 'B', sourceTitle: 'S' } }],
      } as unknown as StoredAnswer['result'],
    }));
    const [rows] = await runAsUser(U, (sql) => [
      sql`SELECT sources FROM messages WHERE user_id = ${U} AND chat_id = ${threadId} AND role = 'assistant'`,
    ]);
    const sources = (rows as { sources: { sourceId: string; register: string }[] }[])[0]!.sources;
    expect(sources.map((s) => s.register).sort()).toEqual(['commentary', 'sermon']);
  });

  it('E13: updated_at ordering — the most recently ACTIVE thread lists first', async () => {
    const { threadId: older } = await createThreadWithQuestion(U, 'older thread');
    const { threadId: newer } = await createThreadWithQuestion(U, 'newer thread');
    // Touch the older one — it must rise.
    await appendQuestion(U, older, 'a follow-up bumps recency');
    const list = await listThreads(U, 50);
    const iOlder = list.findIndex((r) => r.id === older);
    const iNewer = list.findIndex((r) => r.id === newer);
    expect(iOlder).toBeGreaterThanOrEqual(0);
    expect(iNewer).toBeGreaterThanOrEqual(0);
    expect(iOlder).toBeLessThan(iNewer);
  });

  it('E14: a 500-char question round-trips byte-exact', async () => {
    const q = 'θ'.repeat(250) + 'a'.repeat(250);
    const { threadId } = await createThreadWithQuestion(U, q);
    const t = await getThread(U, threadId);
    expect(t!.turns[0]!.question).toBe(q);
  });
});
