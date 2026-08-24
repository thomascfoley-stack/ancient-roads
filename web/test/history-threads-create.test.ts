// createHistoryThread — exit tests for BUG_SWEEP B6 (#113) and the B2 (#120) title site.
//
// B6: the chat INSERT and the two message INSERTs ran as TWO separate runAsUser transactions.
// A failure in the second left a `chats` row with persona 'history' and no messages — an orphan
// that listing and delete both fence out (they filter persona 'ask') and getHistoryThread
// reports as null, so it is invisible AND undeletable. The fix is research.ts's I1-L2 shape on
// the same tables: one statement, chat CTE + both message rows via UNION ALL.
//
// The mock below is an in-memory chats/messages store whose runAsUser is HONESTLY
// TRANSACTIONAL: one call = one transaction, a throw rolls the whole call back. That is the
// property under test, so the mock must not fake it away.
//
// RED-PROOF (executed against the pre-fix two-transaction code): with the message insert
// failing, the first runAsUser call has already committed the chat row — the orphan assertion
// finds 1 row and goes red. The boundary-title assertion goes red on U+FFFD from slice(0, 77).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: {
    chats: [] as { id: string; user_id: string; title: string; persona: string }[],
    messages: [] as { user_id: string; chat_id: string; role: string; content: string; sources: unknown }[],
    failMessages: false,
    seq: 0,
    calls: 0,
  },
}));

type Stmt = { text: string; values: unknown[] };

const sqlTag = (strings: TemplateStringsArray, ...values: unknown[]): Stmt => ({
  text: strings.join('?'),
  values,
});

const nextId = (): string => `00000000-0000-4000-8000-${String(++state.seq).padStart(12, '0')}`;

function exec(userId: string, s: Stmt): unknown[] {
  if (s.text.includes('INSERT INTO chats') && s.text.includes('INSERT INTO messages')) {
    // One-statement CTE form (the B6 fix): chat + user message + assistant message, atomic.
    // values: [userId, title, persona, userId, query, userId, payloadJson]
    const id = nextId();
    state.chats.push({ id, user_id: userId, title: s.values[1] as string, persona: s.values[2] as string });
    if (state.failMessages) throw new Error('simulated message insert failure');
    state.messages.push({ user_id: userId, chat_id: id, role: 'user', content: s.values[4] as string, sources: null });
    state.messages.push({ user_id: userId, chat_id: id, role: 'assistant', content: 'history-results', sources: JSON.parse(s.values[6] as string) });
    return [{ chat_id: id }, { chat_id: id }];
  }
  if (s.text.includes('INSERT INTO chats')) {
    // Two-transaction form (pre-fix): the chat row alone, committed by this call.
    const id = nextId();
    state.chats.push({ id, user_id: s.values[0] as string, title: s.values[1] as string, persona: s.values[2] as string });
    return [{ id }];
  }
  if (s.text.includes('INSERT INTO messages')) {
    if (state.failMessages) throw new Error('simulated message insert failure');
    // Pre-fix standalone form: role/'history-results' are SQL literals, so the binds are
    // [userId, chatId, query] or [userId, chatId, payloadJson].
    const [uid, chatId, third] = s.values as [string, string, string];
    const isUser = s.text.includes(`'user'`);
    state.messages.push({
      user_id: uid,
      chat_id: chatId,
      role: isUser ? 'user' : 'assistant',
      content: isUser ? third : 'history-results',
      sources: isUser ? null : JSON.parse(third),
    });
    return [];
  }
  throw new Error(`unmocked statement: ${s.text.slice(0, 80)}`);
}

vi.mock('@/lib/db', () => ({
  runAsUser: async (userId: string, build: (sql: unknown) => Stmt[]) => {
    state.calls += 1;
    const chatsSnap = [...state.chats];
    const msgsSnap = [...state.messages];
    try {
      return build(sqlTag).map((s) => exec(userId, s));
    } catch (e) {
      state.chats = chatsSnap;
      state.messages = msgsSnap;
      throw e;
    }
  },
}));

const { createHistoryThread } = await import('@/lib/history-threads');

const U = 'test-user';
const payload = { works: [], totalHits: 0 } as never;

beforeEach(() => {
  state.chats = [];
  state.messages = [];
  state.failMessages = false;
  state.calls = 0;
});

describe('createHistoryThread', () => {
  it('B6: a failing message insert leaves ZERO chats rows — no orphan empty thread (#113)', async () => {
    state.failMessages = true;
    await expect(createHistoryThread(U, 'who wrote about ephesus?', payload)).rejects.toThrow();
    expect(
      state.chats.filter((c) => c.persona === 'history'),
      'orphan history chat left behind — chat and messages did not commit atomically',
    ).toHaveLength(0);
  });

  it('B6: the happy path persists chat + user message + assistant message with the payload', async () => {
    const threadId = await createHistoryThread(U, 'who wrote about ephesus?', payload);
    const chat = state.chats.find((c) => c.id === threadId);
    expect(chat, 'chat row missing').toBeTruthy();
    const msgs = state.messages.filter((m) => m.chat_id === threadId);
    expect(msgs.map((m) => m.role).sort()).toEqual(['assistant', 'user']);
    expect(msgs.find((m) => m.role === 'user')!.content).toBe('who wrote about ephesus?');
    expect(msgs.find((m) => m.role === 'assistant')!.sources).toEqual({ works: [], totalHits: 0 });
  });

  it('B6: chat and messages go out in ONE runAsUser transaction', async () => {
    await createHistoryThread(U, 'who wrote about ephesus?', payload);
    expect(state.calls, 'chat and messages were written in separate transactions').toBe(1);
  });

  it('B2: a title truncated on a surrogate pair stores no U+FFFD (#120)', () => {
    return (async () => {
      // 76 ASCII + emoji + tail: code-unit slice(0, 77) lands mid-pair.
      const query = `${'a'.repeat(76)}\u{1F600}tail`;
      const threadId = await createHistoryThread(U, query, payload);
      const title = state.chats.find((c) => c.id === threadId)!.title;
      const roundTrip = Buffer.from(title, 'utf8').toString('utf8');
      expect(roundTrip).toBe(title);
      expect(roundTrip).not.toContain('�');
      expect(title.endsWith('…')).toBe(true);
    })();
  });
});
