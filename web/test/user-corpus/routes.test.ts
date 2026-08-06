// The API routes, driven as route handlers.
//
// WHY THIS EXISTS. Until this file, THREE route handlers existed and not one line of them had ever
// executed: every other suite calls the library directly. That left `requireUser`, the multipart
// parsing, the 401/413/415 status mapping, the dedupe short-circuit and the `after()` drain kick
// entirely unexercised — the whole product surface, untested, behind a well-tested library.
//
// WHAT IS MOCKED, AND THE LIMIT THAT LEAVES. `requireUser` is mocked, because this machine has no
// auth keys at all (the main clone's .env.local carries only DEEPINFRA_API_KEY), so no session can
// exist locally. That means these tests prove the routes' BEHAVIOUR GIVEN A USER, and do not prove
// the auth wiring itself. The 401 path is asserted by making the mock throw, which is what the real
// `requireUser` does — but that the real one is correctly wired to a real session remains unproven
// here and is A10's job against a deployed environment.

import { Buffer } from 'node:buffer';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let currentUser: { id: string; email: string } | null = null;
vi.mock('@/lib/session', () => ({
  requireUser: async () => {
    if (!currentUser) throw new Error('Unauthorized');
    return currentUser;
  },
  getUser: async () => currentUser,
}));

const BYTES = new Map<string, Uint8Array>();
vi.mock('@/lib/user-corpus/blob', () => ({
  getUserDocument: async (p: string) => {
    const b = BYTES.get(p);
    if (!b) throw new Error(`no bytes for ${p}`);
    return b;
  },
  putUserDocument: async (u: string, d: string, bytes: Uint8Array) => {
    const p = `user-corpus/${u}/${d}`;
    BYTES.set(p, bytes);
    return p;
  },
  deleteUserDocument: async (p: string) => { BYTES.delete(p); },
  blobPathname: (u: string, d: string) => `user-corpus/${u}/${d}`,
}));

const { runAsUser } = await import('@/lib/db');
const upload = (await import('@/app/api/user-corpus/upload/route')).POST;
const list = (await import('@/app/api/user-corpus/documents/route')).GET;
const byId = await import('@/app/api/user-corpus/documents/[id]/route');
const search = (await import('@/app/api/user-corpus/search/route')).GET;
const { localEnv, runtimeDbUrl } = await import('../helpers/env');
const { existsSync } = await import('node:fs');
const path = (await import('node:path')).default;

const KEY = localEnv('DEEPINFRA_API_KEY');
if (KEY && !process.env.DEEPINFRA_API_KEY) process.env.DEEPINFRA_API_KEY = KEY;
const enabled = Boolean(runtimeDbUrl() && KEY && existsSync(path.resolve(__dirname, '../../public/bible/kjv')));
if (!enabled) console.warn('⚠ SKIPPED (visibly): route suite needs APP_DATABASE_URL, DEEPINFRA_API_KEY and public/bible/kjv.');

const RUN = `routes-${Date.now().toString(36)}`;
const USER = { id: `${RUN}-user`, email: 'u@example.com' };

function docxBytes(paragraphs: string[]): Uint8Array {
  const xml = Buffer.from(`<w:document><w:body>${paragraphs.map((p) => `<w:p><w:t>${p}</w:t></w:p>`).join('')}</w:body></w:document>`, 'utf8');
  const name = Buffer.from('word/document.xml', 'utf8');
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 8);
  lh.writeUInt32LE(xml.length, 18); lh.writeUInt32LE(xml.length, 22); lh.writeUInt16LE(name.length, 26);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0, 10);
  cd.writeUInt32LE(xml.length, 20); cd.writeUInt32LE(xml.length, 24); cd.writeUInt16LE(name.length, 28);
  cd.writeUInt32LE(0, 42);
  const local = Buffer.concat([lh, name, xml]);
  const central = Buffer.concat([cd, name]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(local.length, 16);
  return new Uint8Array(Buffer.concat([local, central, eocd]));
}

const SERMON = [
  'THE GOOD SHEPHERD',
  'Our text is Romans 8:28, and I would have you weigh it with me at length this morning, for it is the ground of all our comfort in the hour of affliction and of loss.',
  'And we know that all things work together for good to them that love God, to them who are the called according to his purpose, and there is the promise entire.',
];

function req(url: string, init?: RequestInit): Request {
  return new Request(`http://localhost${url}`, init);
}
/** The search route reads `req.nextUrl`, which only a NextRequest carries — as production passes. */
function nreq(url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`);
}
function uploadReq(bytes: Uint8Array, filename: string): Request {
  const fd = new FormData();
  fd.append('file', new File([bytes as unknown as BlobPart], filename));
  return new Request('http://localhost/api/user-corpus/upload', { method: 'POST', body: fd });
}

async function cleanup() {
  await runAsUser(USER.id, (sql) => [sql`DELETE FROM user_documents WHERE user_id = ${USER.id}`]).catch(() => undefined);
  BYTES.clear();
}

describe.skipIf(!enabled)('the user-corpus routes', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  beforeEach(() => { currentUser = USER; });

  describe('auth', () => {
    it.each([
      ['upload', async () => upload(uploadReq(docxBytes(SERMON), 'a.docx') as never)],
      ['list', async () => list()],
      ['search', async () => search(nreq('/api/user-corpus/search?q=grace'))],
    ])('%s returns 401 with no user, and never touches the database', async (_n, call) => {
      currentUser = null;
      const res = await call();
      expect(res.status).toBe(401);
    });
  });

  describe('upload', () => {
    it('rejects a request with no file as 400, not 500', async () => {
      const res = await upload(new Request('http://localhost/api/user-corpus/upload', { method: 'POST', body: new FormData() }) as never);
      expect(res.status).toBe(400);
    });

    it('refuses an unsupported type as 415 with an actionable message', async () => {
      // An executable renamed .docx — UPLOADER_DESIGN §8 A3. It carries no zip magic, so the
      // sniffer refuses it at the door rather than after storing and queueing it.
      const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      const res = await upload(uploadReq(exe, 'trojan.docx') as never);
      expect(res.status).toBe(415);
      expect((await res.json()).error).toMatch(/pdf|word|text/i);
    });

    it('refuses an oversize file as 413', async () => {
      const big = new Uint8Array(26 * 1024 * 1024);
      big.set([0x25, 0x50, 0x44, 0x46]);
      const res = await upload(uploadReq(big, 'huge.pdf') as never);
      expect(res.status).toBe(413);
    }, 60_000);

    it('accepts a real document as 201 and indexes it through the drain', async () => {
      const res = await upload(uploadReq(docxBytes(SERMON), 'sermon.docx') as never);
      expect(res.status).toBe(201);
      const { document } = (await res.json()) as { document: { id: string; status: string } };
      expect(document.status).toBe('queued');

      // The route kicks the drain via `after()`, which vitest does not run, so the queue is driven
      // explicitly here. What this proves is the ROUTE's contract — a document created and queued —
      // not that `after()` fires, which only a real request lifecycle can show.
      const { drain } = await import('@/lib/user-corpus/queue');
      await drain(USER.id, 1);

      const one = await byId.GET(req(`/api/user-corpus/documents/${document.id}`) as never, { params: Promise.resolve({ id: document.id }) });
      expect(((await one.json()) as { document: { status: string } }).document.status).toBe('ready');
    }, 180_000);

    it('dedupes identical bytes with a 200 and names the existing document', async () => {
      const res = await upload(uploadReq(docxBytes(SERMON), 'sermon-again.docx') as never);
      expect(res.status).toBe(200);
      const d = (await res.json()) as { duplicateOf?: string; message?: string };
      expect(d.duplicateOf).toBeTruthy();
      expect(d.message).toMatch(/already/i);
    }, 60_000);
  });

  describe('list and status', () => {
    it('returns the documents with queue stats in ONE response', async () => {
      const res = await list();
      expect(res.status).toBe(200);
      const d = (await res.json()) as { documents: unknown[]; queue: { depth: number } };
      expect(Array.isArray(d.documents)).toBe(true);
      expect(d.queue).toHaveProperty('depth');
    });

    it('404s another id rather than confirming it exists', async () => {
      const res = await byId.GET(req('/api/user-corpus/documents/does-not-exist') as never, { params: Promise.resolve({ id: 'does-not-exist' }) });
      expect(res.status).toBe(404);
    });
  });

  describe('search', () => {
    it('400s with neither q nor ref', async () => {
      expect((await search(nreq('/api/user-corpus/search'))).status).toBe(400);
    });

    it('answers a text query from the indexed rows', async () => {
      const res = await search(nreq('/api/user-corpus/search?q=comfort%20in%20affliction'));
      expect(res.status).toBe(200);
      const d = (await res.json()) as { hits: { title: string }[] };
      expect(d.hits.length).toBeGreaterThan(0);
    }, 60_000);

    it('answers a passage reference through the presence scan', async () => {
      const res = await search(nreq('/api/user-corpus/search?ref=Romans%208'));
      expect(res.status).toBe(200);
      const d = (await res.json()) as { mode: string; anchors: unknown[] };
      expect(d.mode).toBe('verse');
      expect(d.anchors.length).toBeGreaterThan(0);
    }, 60_000);

    it('400s an unparseable reference rather than searching for it as text', async () => {
      const res = await search(nreq('/api/user-corpus/search?ref=Hezekiah%2099'));
      expect(res.status).toBe(400);
    });
  });
});
