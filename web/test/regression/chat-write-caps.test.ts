// @vitest-environment node
//
// Free-text caps on the chat surface writes — 2026-08-17 pre-deploy audit (attack lens), #6.
//
// POST /api/chats (`title`, `persona`), /api/channels (`name`, `description`) and /api/messages
// (`content`, `sources`) had NO length cap on any free-text write, and `sources` was arbitrary
// client JSON straight into a jsonb column. prayers/route.ts:62-68 names this exact class
// ("an uncapped text column is a cheap way to fill a database", audit A1-8) and fixed itself by
// REJECTING over-cap bodies — these routes now follow that choice, and this suite pins it.
//
// Deliberately NOT covered here: the persona='ask' research-thread bypass (audit #5 / I-1). That
// is a design change on a live API and is documented at the persona parse site in
// chats/route.ts, not fixed. The persona cases below only pin the type/length bound.
//
// Session mocked at the requireUser seam; lib/chat mocked so validation cases can assert the DB
// layer was never reached (the studies-routes pattern).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const session: { user: { id: string; email: string } | null } = {
  user: { id: 'qa-chat-caps', email: 'qa@example.test' },
};
vi.mock('@/lib/session', () => ({
  requireUser: async () => {
    if (!session.user) throw new Error('Unauthorized');
    return session.user;
  },
  currentUser: async () => session.user,
}));

const lib = vi.hoisted(() => ({
  getChats: vi.fn(),
  createChat: vi.fn(),
  getChannels: vi.fn(),
  createChannel: vi.fn(),
  getMessages: vi.fn(),
  addMessage: vi.fn(),
}));
vi.mock('@/lib/chat', () => lib);

import { POST as postChat } from '@/app/api/chats/route';
import { POST as postChannel } from '@/app/api/channels/route';
import { POST as postMessage } from '@/app/api/messages/route';

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/x', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  session.user = { id: 'qa-chat-caps', email: 'qa@example.test' };
  for (const fn of Object.values(lib)) fn.mockReset();
  lib.createChat.mockResolvedValue({ id: 'c1' });
  lib.createChannel.mockResolvedValue({ id: 'ch1' });
  lib.addMessage.mockResolvedValue({ id: 'm1' });
});

describe('POST /api/chats — title and persona are bounded (#6)', () => {
  it('refuses a title over 300 chars (STUDY_TITLE_MAX’s bound) before any DB work', async () => {
    // SEED: pass `title` through uncapped → this reads 201 and goes RED.
    const res = await postChat(req({ title: 'x'.repeat(301) }));
    expect(res.status).toBe(400);
    expect(lib.createChat).not.toHaveBeenCalled();
  });

  it('accepts a title AT the cap and forwards it (positive control)', async () => {
    const res = await postChat(req({ title: 'x'.repeat(300) }));
    expect(res.status).toBe(201);
    expect(lib.createChat).toHaveBeenCalledWith('qa-chat-caps', 'x'.repeat(300), undefined);
  });

  it('refuses a non-string or over-long persona instead of forwarding it', async () => {
    expect((await postChat(req({ title: 't', persona: 123 }))).status).toBe(400);
    expect((await postChat(req({ title: 't', persona: 'x'.repeat(65) }))).status).toBe(400);
    expect(lib.createChat).not.toHaveBeenCalled();
  });

  it('still admits persona="ask" — the #5 bypass is DOCUMENTED here, not fenced (by order)', async () => {
    const res = await postChat(req({ title: 't', persona: 'ask' }));
    expect(res.status).toBe(201);
    expect(lib.createChat).toHaveBeenCalledWith('qa-chat-caps', 't', 'ask');
  });
});

describe('POST /api/channels — name and description are bounded (#6)', () => {
  it('refuses a name over 200 chars (the bookmark-label bound) before any DB work', async () => {
    const res = await postChannel(req({ name: 'x'.repeat(201) }));
    expect(res.status).toBe(400);
    expect(lib.createChannel).not.toHaveBeenCalled();
  });

  it('refuses a description over 2,000 chars or of the wrong type', async () => {
    expect((await postChannel(req({ name: 'n', description: 'x'.repeat(2_001) }))).status).toBe(400);
    expect((await postChannel(req({ name: 'n', description: 42 }))).status).toBe(400);
    expect(lib.createChannel).not.toHaveBeenCalled();
  });

  it('accepts bounded values and forwards them (positive control)', async () => {
    const res = await postChannel(req({ name: 'x'.repeat(200), description: 'x'.repeat(2_000) }));
    expect(res.status).toBe(201);
    expect(lib.createChannel).toHaveBeenCalledWith('qa-chat-caps', 'x'.repeat(200), 'x'.repeat(2_000));
  });
});

describe('POST /api/messages — content is capped, sources is bounded typed JSON (#6)', () => {
  it('refuses content over 20,000 chars (PRAYER_MAX_LENGTH’s bound) before any DB work', async () => {
    const res = await postMessage(req({ chatId: 'c1', content: 'x'.repeat(20_001) }));
    expect(res.status).toBe(400);
    expect(lib.addMessage).not.toHaveBeenCalled();
  });

  it('accepts content AT the cap (positive control)', async () => {
    const res = await postMessage(req({ chatId: 'c1', content: 'x'.repeat(20_000) }));
    expect(res.status).toBe(201);
  });

  it('refuses sources that are not an array of objects', async () => {
    // Today a bare string, number, or array of scalars all reached the jsonb column verbatim.
    // SEED: restore `sources ?? []` with no shape check → these read 201 and go RED.
    for (const sources of ['not-an-array', 42, { a: 1 }, [1, 2], ['x'], [null], [[1]]]) {
      const res = await postMessage(req({ chatId: 'c1', content: 'hi', sources }));
      expect(res.status, JSON.stringify(sources)).toBe(400);
    }
    expect(lib.addMessage).not.toHaveBeenCalled();
  });

  it('refuses sources whose serialized form exceeds 100,000 chars', async () => {
    const big = [{ excerpt: 'x'.repeat(100_001) }];
    const res = await postMessage(req({ chatId: 'c1', content: 'hi', sources: big }));
    expect(res.status).toBe(400);
    expect(lib.addMessage).not.toHaveBeenCalled();
  });

  it('omitted sources default to [] and a small valid array passes through (positive control)', async () => {
    await postMessage(req({ chatId: 'c1', content: 'hi' }));
    expect(lib.addMessage).toHaveBeenCalledWith('qa-chat-caps', null, 'c1', 'user', 'hi', []);
    const srcs = [{ work: 'gill-john', excerpt: 'short' }];
    await postMessage(req({ chatId: 'c1', content: 'hi', sources: srcs }));
    expect(lib.addMessage).toHaveBeenCalledWith('qa-chat-caps', null, 'c1', 'user', 'hi', srcs);
  });
});
