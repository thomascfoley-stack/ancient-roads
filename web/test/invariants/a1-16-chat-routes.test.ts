// A1-16 (pre-deploy audit 2026-08-07, checklist line 358, checkbox STILL UNTICKED) surfaced
// again as DEEP_SWEEP D13. `/api/channels`, `/api/chats` and `/api/messages` wrapped requireUser,
// the body parse and the DB call in ONE try whose catch returned `{ error: 'Unauthorized' }, 401`.
// So a DB outage, a malformed JSON body, and — the one that matters — an RLS denial all reached
// the user as "signed out". A real cross-tenant isolation failure is exactly what RLS produces,
// and this shape files it as a session bug.
//
// D13 was DISPUTED between two investigators: one excluded it as "already documented as A1-16",
// the other reported it as documented-but-unfixed. Adjudicated by reading the checklist — the
// item is documented AND unticked, so both were half right and the finding stands.
//
// These are BEHAVIOURAL, not source greps: each handler is imported and invoked with its
// collaborators mocked, so the test exercises the catch it is about. The sibling prayers-route
// test reads source text; this one can fail for a reason source text cannot show.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const requireUser = vi.fn();
const getChannels = vi.fn(), createChannel = vi.fn();
const getChats = vi.fn(), createChat = vi.fn();
const getMessages = vi.fn(), addMessage = vi.fn();

vi.mock('@/lib/session', () => ({ requireUser: () => requireUser() }));
vi.mock('@/lib/chat', () => ({
  getChannels: (...a: unknown[]) => getChannels(...a),
  createChannel: (...a: unknown[]) => createChannel(...a),
  getChats: (...a: unknown[]) => getChats(...a),
  createChat: (...a: unknown[]) => createChat(...a),
  getMessages: (...a: unknown[]) => getMessages(...a),
  addMessage: (...a: unknown[]) => addMessage(...a),
}));

const USER = { id: 'u1' };
const DB_FAULT = new Error('remaining connection slots are reserved');
const post = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue(USER);
});

describe('A1-16 / D13 — auth failure is distinguishable from server failure', () => {
  it('channels GET: a DB fault is 500, not 401', async () => {
    const { GET } = await import('@/app/api/channels/route');
    getChannels.mockRejectedValue(DB_FAULT);
    expect((await GET()).status).toBe(500);
  });

  it('channels GET: a genuine auth failure is still 401', async () => {
    const { GET } = await import('@/app/api/channels/route');
    requireUser.mockRejectedValue(new Error('no session'));
    expect((await GET()).status).toBe(401);
  });

  it('chats GET: a DB fault is 500, not 401', async () => {
    const { GET } = await import('@/app/api/chats/route');
    getChats.mockRejectedValue(DB_FAULT);
    expect((await GET()).status).toBe(500);
  });

  it('chats POST: a DB fault is 500, not 401', async () => {
    const { POST } = await import('@/app/api/chats/route');
    createChat.mockRejectedValue(DB_FAULT);
    expect((await POST(post('http://t/api/chats', { title: 'x' }) as never)).status).toBe(500);
  });

  it('channels POST: a DB fault is 500, not 401', async () => {
    const { POST } = await import('@/app/api/channels/route');
    createChannel.mockRejectedValue(DB_FAULT);
    expect((await POST(post('http://t/api/channels', { name: 'x' }) as never)).status).toBe(500);
  });

  it('messages POST: a DB fault is 500, not 401', async () => {
    const { POST } = await import('@/app/api/messages/route');
    addMessage.mockRejectedValue(DB_FAULT);
    expect((await POST(post('http://t/api/messages', { chatId: 'c1', content: 'hi' }) as never)).status).toBe(500);
  });

  // Malformed JSON is caller error, not an auth problem and not our fault.
  it('a malformed JSON body is 400, not 401', async () => {
    const { POST } = await import('@/app/api/chats/route');
    const bad = new Request('http://t/api/chats', { method: 'POST', body: '{not json', headers: { 'content-type': 'application/json' } });
    expect((await POST(bad as never)).status).toBe(400);
  });

  // The reason this severity is not cosmetic: RLS denial IS the isolation boundary firing.
  it('an RLS denial surfaces as a server fault, never as "signed out"', async () => {
    const { GET } = await import('@/app/api/chats/route');
    getChats.mockRejectedValue(new Error('permission denied for table chats'));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/unauthorized/i);
  });

  // D12 — `?limit=abc` became NaN, reached the SQL LIMIT, threw, and the blanket catch answered
  // 401 "Unauthorized" to a plain caller error.
  it('D12: a non-numeric limit is 400, and never reaches the query', async () => {
    const { GET } = await import('@/app/api/messages/route');
    const res = await GET(new Request('http://t/api/messages?chatId=c1&limit=abc') as never);
    expect(res.status).toBe(400);
    expect(getMessages).not.toHaveBeenCalled();
  });

  it('D12: an out-of-range limit is refused, so no unbounded result set is possible', async () => {
    const { GET } = await import('@/app/api/messages/route');
    for (const bad of ['0', '-5', '9999', '1.5']) {
      const res = await GET(new Request(`http://t/api/messages?chatId=c1&limit=${bad}`) as never);
      expect(res.status, `limit=${bad}`).toBe(400);
    }
    expect(getMessages).not.toHaveBeenCalled();
  });

  it('D12: an absent limit still takes the default and queries normally', async () => {
    const { GET } = await import('@/app/api/messages/route');
    getMessages.mockResolvedValue([]);
    expect((await GET(new Request('http://t/api/messages?chatId=c1') as never)).status).toBe(200);
    expect(getMessages).toHaveBeenCalledWith('u1', null, 'c1', 50, undefined);
  });

  // D30 — both ids violates the msg_belongs_to_one CHECK; that surfaced as 401 too.
  it('D30: passing both channelId and chatId is 400, not a CHECK violation dressed as 401', async () => {
    const { POST } = await import('@/app/api/messages/route');
    const res = await POST(post('http://t/api/messages', { channelId: 'ch1', chatId: 'c1', content: 'hi' }) as never);
    expect(res.status).toBe(400);
    expect(addMessage).not.toHaveBeenCalled();
  });
});
