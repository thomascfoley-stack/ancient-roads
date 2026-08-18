// @vitest-environment node
//
// /api/annotations route contract — 2026-08-17 pre-deploy audit (attack lens), findings #7 + #8.
//
// #7: all three handlers wrapped auth AND the DB call in ONE try whose catch returned 401 — an
// RLS denial or schema error surfaced to the user as "signed out". Five sibling routes name this
// defect and avoid it (studies/route.ts:13-17: "the /api/chats blanket-401 bare-catch is a known
// defect (pre-deploy audit A1-16) and is not copied"; prayers/route.ts:12-15). These cases pin
// the split: 401 ONLY for a missing session; DB faults are 500 INTERNAL; malformed input is 400.
//
// #8: `Number(body.verseId)` accepted 1.5 and 1e999 (both truthy), which reached SQL as a cast
// error — and the blanket catch then reported THAT as 401 too. And the note body was uncapped
// while the bookmark label four lines down was capped at 200 with a comment explaining why.
//
// Session is mocked at the requireUser seam (the studies-routes pattern); lib/annotations is
// mocked so the DB-fault cases are drivable without a database and validation cases can assert
// the lib was never reached.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const session: { user: { id: string; email: string } | null } = {
  user: { id: 'qa-annotations-routes', email: 'qa@example.test' },
};
vi.mock('@/lib/session', () => ({
  requireUser: async () => {
    if (!session.user) throw new Error('Unauthorized');
    return session.user;
  },
  currentUser: async () => session.user,
}));

const lib = vi.hoisted(() => ({
  getChapterAnnotations: vi.fn(),
  createHighlight: vi.fn(),
  removeHighlight: vi.fn(),
  removeHighlightById: vi.fn(),
  upsertNote: vi.fn(),
  removeNote: vi.fn(),
  createBookmark: vi.fn(),
  removeBookmark: vi.fn(),
}));
vi.mock('@/lib/annotations', () => lib);

import { DELETE, GET, POST } from '@/app/api/annotations/route';

const get = (qs: string) => GET(new NextRequest(`http://localhost/api/annotations?${qs}`));
const post = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/annotations', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  );
const del = (body: unknown) =>
  DELETE(
    new NextRequest('http://localhost/api/annotations', {
      method: 'DELETE',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  );
const code = async (res: Response) => ((await res.json()) as { error?: { code?: string } }).error?.code;

beforeEach(() => {
  session.user = { id: 'qa-annotations-routes', email: 'qa@example.test' };
  for (const fn of Object.values(lib)) fn.mockReset();
  lib.getChapterAnnotations.mockResolvedValue({ highlights: [], notes: [], bookmarks: [] });
  lib.createHighlight.mockResolvedValue({ id: 'h1' });
  lib.upsertNote.mockResolvedValue({ id: 'n1' });
  lib.createBookmark.mockResolvedValue({ id: 'b1' });
});

describe('#7 — 401 means signed out, and ONLY signed out', () => {
  it('no session → 401 UNAUTHENTICATED on all three verbs', async () => {
    session.user = null;
    for (const res of [await get('book=43&chapter=3'), await post({ kind: 'note', verseId: 43003016, body: 'x' }), await del({ kind: 'note', verseId: 43003016 })]) {
      expect(res.status).toBe(401);
      expect(await code(res)).toBe('UNAUTHENTICATED');
    }
  });

  it('a DB fault on GET is 500 INTERNAL, never 401 — and leaks nothing', async () => {
    // SEED: restore the single try/catch-→-401 → this reads 401 and goes RED.
    lib.getChapterAnnotations.mockRejectedValueOnce(new Error('connection to ep-odd-fog failed: password authentication'));
    const res = await get('book=43&chapter=3');
    expect(res.status).toBe(500);
    expect(await code(res)).toBe('INTERNAL');
    const raw = JSON.stringify(await (await get('book=43&chapter=3')).json());
    expect(raw).not.toMatch(/ep-odd-fog|password/);
  });

  it('a DB fault on POST is 500 INTERNAL, never 401', async () => {
    lib.upsertNote.mockRejectedValueOnce(new Error('permission denied for table notes'));
    const res = await post({ kind: 'note', verseId: 43003016, body: 'a note' });
    expect(res.status).toBe(500);
    expect(await code(res)).toBe('INTERNAL');
  });

  it('a DB fault on DELETE is 500 INTERNAL, never 401', async () => {
    lib.removeNote.mockRejectedValueOnce(new Error('permission denied for table notes'));
    const res = await del({ kind: 'note', verseId: 43003016 });
    expect(res.status).toBe(500);
    expect(await code(res)).toBe('INTERNAL');
  });

  it('a malformed body is 400 INVALID_REQUEST, never 401', async () => {
    // SEED: move req.json() back inside the auth try → these read 401 and go RED.
    for (const res of [await post('this is not JSON{'), await del('this is not JSON{')]) {
      expect(res.status).toBe(400);
      expect(await code(res)).toBe('INVALID_REQUEST');
    }
  });
});

describe('#8 — verseId is an integer in the encoded range, not merely truthy', () => {
  it('refuses a fractional, overflowing, or out-of-range verseId before any DB work', async () => {
    // 1.5 and 1e999 (Infinity after JSON.parse) were both truthy and reached SQL as cast errors.
    // 67000000 decodes to book 67 — one past the canon; the ceiling comes from @bible/verse-id's
    // book*1e6+chapter*1e3+verse encoding over 66 books.
    for (const verseId of [1.5, '1e999', 67_000_000, -5, 0]) {
      const body = verseId === '1e999' ? '{"kind":"highlight","verseId":1e999}' : { kind: 'highlight', verseId };
      const res = await post(body);
      expect(res.status, `verseId=${String(verseId)}`).toBe(400);
    }
    expect(lib.createHighlight).not.toHaveBeenCalled();
    // Same parse on DELETE — the same Number() was there too.
    expect((await del({ kind: 'note', verseId: 1.5 })).status).toBe(400);
    expect(lib.removeNote).not.toHaveBeenCalled();
  });

  it('accepts a real verse id and forwards it (positive control)', async () => {
    // Without this, every refusal above could pass by refusing everything.
    const res = await post({ kind: 'highlight', verseId: 43_003_016 });
    expect(res.status).toBe(201);
    expect(lib.createHighlight).toHaveBeenCalledWith('qa-annotations-routes', expect.objectContaining({ verseId: 43_003_016 }));
  });

  it('GET refuses a fractional book/chapter instead of forwarding it to SQL', async () => {
    for (const qs of ['book=1.5&chapter=3', 'book=43&chapter=NaN', 'book=67&chapter=1', 'book=0&chapter=1']) {
      expect((await get(qs)).status, qs).toBe(400);
    }
    expect(lib.getChapterAnnotations).not.toHaveBeenCalled();
  });
});

describe('#8 — the note body is capped like every other free-text write', () => {
  it('refuses a note over 20,000 chars (PRAYER_MAX_LENGTH’s bound) rather than storing it', async () => {
    const res = await post({ kind: 'note', verseId: 43_003_016, body: 'x'.repeat(20_001) });
    expect(res.status).toBe(400);
    expect(lib.upsertNote).not.toHaveBeenCalled();
  });

  it('accepts a note AT the cap (positive control)', async () => {
    const res = await post({ kind: 'note', verseId: 43_003_016, body: 'x'.repeat(20_000) });
    expect(res.status).toBe(201);
    expect(lib.upsertNote).toHaveBeenCalledWith('qa-annotations-routes', 43_003_016, 'x'.repeat(20_000));
  });
});
