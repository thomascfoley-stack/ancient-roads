// Research-history tenancy invariant (ASK_HISTORY_DESIGN §6): user B cannot read user A's
// thread, cannot append to it, and the thread list is owner-scoped and bounded — through the
// data layer's own functions, against the real DB when APP_DATABASE_URL is set (two-account
// discipline, CLAUDE.md §Security: RLS is proven with accounts, not by reading policy).
//
// RED-PROOF, and what it actually showed (executed 2026-08-16): the `user_id = ${userId}`
// belt was removed from getThread's chats WHERE and this suite — running as the real
// app_runtime role — STAYED GREEN, because chats_policy (RLS on app.current_user_id) blocked
// the cross-tenant read on its own. That green is the RLS policy proven by execution, the
// thing MASTER C5 records as unproven under Neon ids. The belt is therefore defense-in-depth
// for the owner-fallback connection (DATABASE_URL, BYPASSRLS), where RLS is inert and the
// belt is the ONLY enforcement — which is exactly chat.ts's H1 rationale. Belt restored.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createThreadWithQuestion, appendQuestion, appendAnswer, getThread, listThreads } from '@/lib/research';
import { runAsUser } from '@/lib/db';
import { requireDbInCi } from './helpers/env';
import { announceSkip } from './helpers/loud-skip';

const dbUrl = requireDbInCi();
const userA = `qa-research-a-${Date.now()}`;
const userB = `qa-research-b-${Date.now()}`;
let threadId = '';

const SKIP = announceSkip(
  'Research tenancy invariant (two-account, executed)',
  [{ name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) }],
  'the two-account tenancy invariant on research threads (chats/messages persona=ask)',
);

describe.skipIf(SKIP)('Research tenancy invariant (two-account, executed)', () => {
  beforeAll(async () => {
    const created = await createThreadWithQuestion(userA, 'qa tenancy question — who is the good shepherd?');
    threadId = created.threadId;
    await appendAnswer(userA, threadId, {
      qid: created.qid,
      v: 1,
      result: { kind: 'empty', reason: 'qa fixture' },
      lanes: {},
      attempts: 1,
      latencyMs: 1,
      askedAt: new Date().toISOString(),
    });
  }, 30_000);

  afterAll(async () => {
    if (!dbUrl) return;
    // I1-M3: the v1 cleanup used bare getDb() — as app_runtime without the GUC it saw (and
    // deleted) ZERO rows, silently, behind a .catch. Cleanup goes through runAsUser so RLS
    // binds and the fixtures actually die (messages cascade on chats).
    await runAsUser(userA, (sql) => [
      sql`DELETE FROM chats WHERE user_id = ${userA} AND persona = 'ask'`,
    ]).catch(() => {});
  });

  it('the owner reads their thread back, with the turn assembled', async () => {
    const t = await getThread(userA, threadId);
    expect(t).not.toBeNull();
    expect(t!.turns).toHaveLength(1);
    expect(t!.turns[0]!.question).toContain('good shepherd');
    expect(t!.turns[0]!.answer?.result.kind).toBe('empty');
  });

  it('user B reading user A’s thread gets null — indistinguishable from absent', async () => {
    expect(await getThread(userB, threadId)).toBeNull();
  });

  it('user B cannot append a question to user A’s thread (H2 belt throws)', async () => {
    await expect(appendQuestion(userB, threadId, 'stolen turn')).rejects.toThrow(/not found or not owned/);
  });

  it('user B cannot append an ANSWER to user A’s thread — the I-1 surface', async () => {
    await expect(
      appendAnswer(userB, threadId, {
        v: 1,
        result: { kind: 'empty', reason: 'forged' },
        lanes: {},
        attempts: 1,
        latencyMs: 1,
        askedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(/not found or not owned/);
  });

  it('listThreads is owner-scoped', async () => {
    const mine = await listThreads(userA, 10);
    expect(mine.some((t) => t.id === threadId)).toBe(true);
    const theirs = await listThreads(userB, 10);
    expect(theirs.some((t) => t.id === threadId)).toBe(false);
  });

  it('listThreads clamps an oversized ask to 50 — proven against >50 real rows (I2-H3)', async () => {
    // The v1 assertion was vacuous: the user owned ONE thread, so `length <= 50` could not
    // fail even with the clamp deleted (inspector 2 proved it). Seed past the cap and watch
    // the clamp actually bite; afterAll's persona-wide delete removes all of these.
    for (let i = 0; i < 55; i++) {
      await createThreadWithQuestion(userA, `qa bound fixture ${i}`);
    }
    const clamped = await listThreads(userA, 10_000);
    expect(clamped.length).toBe(50);
  }, 120_000);
});
