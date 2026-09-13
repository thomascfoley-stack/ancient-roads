// The parent /api/user-corpus/documents/[id] route — the four handlers the D35 envelope sweep
// (e4542c97) and its 4b1f4630 follow-up both missed. GET, POST, PATCH and DELETE each awaited a
// data-layer call (`getDocument`, `getDocumentSections`, `requeueForRetry`, `renameDocument`,
// `deleteDocument`) with no try around it, so a Neon hiccup — connection pool exhaustion, a query
// timeout, or (for DELETE) a `@vercel/blob` `del()` rejection on outage — escaped the handler as
// Next's raw 500 instead of the stable `{ error: { code, message } }` envelope
// (lib/api-error.ts, docs/API_ERRORS.md). The sibling `voices`/`related` routes (one directory down)
// set the precedent this route's four handlers did not follow.
//
// Fully mocked, the exact pattern of voices-related-envelope.test.ts: the route's stores are
// stubbed to throw, because a source grep cannot tell you what a route RETURNS when the DB is down.
// GET is exercised twice — without and with `?sections=1` — because `getDocumentSections` runs only
// when the query param is present, so a test that calls GET without it exercises `getDocument`'s
// throw and silently misses the sections throw.

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const guardUser = vi.fn();
const getDocument = vi.fn();
const getDocumentSections = vi.fn();
const requeueForRetry = vi.fn();
const renameDocument = vi.fn();
const deleteDocument = vi.fn();
const checkCorpusUploadRateLimit = vi.fn();
const drain = vi.fn();
const requireJsonContentType = vi.fn();

vi.mock('@/lib/user-corpus/route-guard', () => ({
  guardUser: (...a: unknown[]) => guardUser(...a),
}));
vi.mock('@/lib/user-corpus/documents', () => ({
  TITLE_MAX: 200,
  deleteDocument: (...a: unknown[]) => deleteDocument(...a),
  getDocument: (...a: unknown[]) => getDocument(...a),
  getDocumentSections: (...a: unknown[]) => getDocumentSections(...a),
  renameDocument: (...a: unknown[]) => renameDocument(...a),
  requeueForRetry: (...a: unknown[]) => requeueForRetry(...a),
  // A close-enough stub of the real `titleVerdict` (documents.ts): one line, trimmed, refuses
  // empty/non-string. This test is about the SERVER-FAULT envelope, not the title rule, which
  // rename.test.ts pins as a pure function — but a stub that returns ok:false for any input would
  // route us away from `renameDocument` and let the throw path pass for the wrong reason.
  titleVerdict: (raw: unknown): { ok: true; title: string } | { ok: false; reason: 'empty' | 'too_long' } =>
    typeof raw === 'string' && raw.trim()
      ? { ok: true as const, title: raw.trim() }
      : { ok: false as const, reason: 'empty' as const },
}));
vi.mock('@/lib/rate-limit', () => ({
  checkCorpusUploadRateLimit: (...a: unknown[]) => checkCorpusUploadRateLimit(...a),
}));
vi.mock('@/lib/user-corpus/queue', () => ({
  drain: (...a: unknown[]) => drain(...a),
}));
vi.mock('@/lib/csrf-floor', () => ({
  requireJsonContentType: (...a: unknown[]) => requireJsonContentType(...a),
}));
// `@/lib/api-error` is intentionally NOT mocked: the route uses the real envelope, so these
// assertions check the real `{ error: { code, message } }` shape, end to end.

const DB_FAULT = new Error('remaining connection slots are reserved');
const params = <T,>(v: T) => ({ params: Promise.resolve(v) });
const READY = { id: 'd1', status: 'ready' as const };
// A document POST will retry: not 'empty' (passes the 409-empty branch) and with a blobUrl
// (passes the 409-no-blob branch), so the route reaches `requeueForRetry`.
const RETRYABLE = { id: 'd1', status: 'failed' as const, blobUrl: 'blob://d1' };

/** The contract: a 500 JSON body carrying error.code === 'INTERNAL', and NO leaked internal. */
async function expectEnvelope(res: Response) {
  expect(res.status).toBe(500);
  expect(res.headers.get('content-type') ?? '').toMatch(/application\/json/);
  const text = await res.text();
  const body = JSON.parse(text) as { error?: { code?: string; message?: string } };
  expect(body.error?.code).toBe('INTERNAL');
  expect(body.error?.message).toBe('Something went wrong on our end. Please try again.');
  // The envelope must NEVER carry the fault: no DB message, no connection string, no stack. A raw
  // 500 from Next would be HTML; a leaked exception would echo "remaining connection slots".
  expect(text).not.toContain('remaining connection slots');
  expect(text).not.toContain('reserved');
}

beforeEach(() => {
  vi.clearAllMocks();
  guardUser.mockResolvedValue({ denied: null, user: { id: 'u1', email: 'u@example.com' } });
  checkCorpusUploadRateLimit.mockResolvedValue({ ok: true });
  requireJsonContentType.mockReturnValue(null);
  getDocument.mockResolvedValue(READY);
  getDocumentSections.mockResolvedValue([]);
  requeueForRetry.mockResolvedValue(true);
  renameDocument.mockResolvedValue({ id: 'd1', title: 'Renamed' });
  deleteDocument.mockResolvedValue(true);
  drain.mockResolvedValue({ attempted: 0, completed: 0, outcomes: {}, reaped: 0 });
});

const route = () =>
  import('@/app/api/user-corpus/documents/[id]/route');

describe('documents/[id] — a DB fault returns the envelope, never a raw 500', () => {
  describe('GET', () => {
    const call = (id = 'd1', sections = false) =>
      route().then(({ GET }) =>
        GET(
          new NextRequest(`http://t/api/user-corpus/documents/${id}${sections ? '?sections=1' : ''}`),
          params({ id }),
        ),
      );

    it('a getDocument failure returns the envelope, not a raw exception', async () => {
      getDocument.mockRejectedValue(DB_FAULT);
      await expectEnvelope(await call());
    });

    it('a getDocumentSections failure returns the envelope (only reachable with ?sections=1)', async () => {
      // getDocument resolves here; the sections lookup is the call that throws. A test that omits
      // ?sections=1 would never reach getDocumentSections and would silently miss this path.
      getDocumentSections.mockRejectedValue(DB_FAULT);
      await expectEnvelope(await call('d1', true));
    });

    it('a ready document returns 200 with the document and no sections by default', async () => {
      const res = await call();
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ document: { id: 'd1' } });
      expect(getDocumentSections).not.toHaveBeenCalled();
    });

    it('a ready document with ?sections=1 returns 200 with sections', async () => {
      getDocumentSections.mockResolvedValue([{ id: 's1', ordinal: 1, heading: null, body: 'text' }]);
      const res = await call('d1', true);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ document: { id: 'd1' }, sections: [{ id: 's1' }] });
    });

    it('a missing document returns 404', async () => {
      getDocument.mockResolvedValue(null);
      const res = await call();
      expect(res.status).toBe(404);
    });
  });

  describe('POST', () => {
    const call = (id = 'd1') =>
      route().then(({ POST }) =>
        POST(new NextRequest(`http://t/api/user-corpus/documents/${id}`, { method: 'POST' }), params({ id })),
      );

    it('a getDocument failure returns the envelope, not a raw exception', async () => {
      getDocument.mockRejectedValue(DB_FAULT);
      await expectEnvelope(await call());
    });

    it('a requeueForRetry failure returns the envelope, not a raw exception', async () => {
      getDocument.mockResolvedValue(RETRYABLE);
      requeueForRetry.mockRejectedValue(DB_FAULT);
      await expectEnvelope(await call());
    });

    it('a successful retry returns 200 with the refreshed document', async () => {
      getDocument.mockResolvedValue(RETRYABLE);
      const res = await call();
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ document: { id: 'd1' } });
    });

    it('a missing document returns 404 (before the rate meter is no proof — meter passes here)', async () => {
      getDocument.mockResolvedValue(null);
      const res = await call();
      expect(res.status).toBe(404);
    });

    it('an empty-file document returns 409 with a DELIBERATE plain-string error, not the envelope', async () => {
      // The carve-out the wrap must preserve: client-error 404/409 plain strings are NOT remapped
      // to the envelope. Asserting so confirms the try/catch only catches THROWS, not returns.
      getDocument.mockResolvedValue({ id: 'd1', status: 'empty', blobUrl: 'blob://d1' });
      const res = await call();
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: unknown };
      expect(typeof body.error).toBe('string'); // H6: the client renders `error` as a string
      expect(getDocumentSections).not.toHaveBeenCalled();
      expect(requeueForRetry).not.toHaveBeenCalled();
    });

    it('a document with no blob returns 409 plain-string and never reaches requeueForRetry', async () => {
      getDocument.mockResolvedValue({ id: 'd1', status: 'ready', blobUrl: null });
      const res = await call();
      expect(res.status).toBe(409);
      expect(typeof ((await res.json()) as { error: unknown }).error).toBe('string');
      expect(requeueForRetry).not.toHaveBeenCalled();
    });

    it('a document already being processed returns 409 plain-string (requeueForRetry false)', async () => {
      getDocument.mockResolvedValue(RETRYABLE);
      requeueForRetry.mockResolvedValue(false);
      const res = await call();
      expect(res.status).toBe(409);
      expect(typeof ((await res.json()) as { error: unknown }).error).toBe('string');
    });

    it('a rate-limited retry returns 429 with the Retry-After header, before any data call', async () => {
      // The 429 carve-out sits OUTSIDE the new try by design (the limiter fails closed, never
      // throws). Pinning it here proves the wrap did not move or reshape it.
      checkCorpusUploadRateLimit.mockResolvedValue({ ok: false, limited: 'min', retryAfterSec: 60 });
      const res = await call();
      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBe('60');
      expect(getDocument).not.toHaveBeenCalled();
    });
  });

  describe('PATCH', () => {
    const patch = (id: string, body: unknown) =>
      new NextRequest(`http://t/api/user-corpus/documents/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });
    const call = (id = 'd1', body: unknown = { title: 'New Name' }) =>
      route().then(({ PATCH }) => PATCH(patch(id, body), params({ id })));

    it('a renameDocument failure returns the envelope, not a raw exception', async () => {
      renameDocument.mockRejectedValue(DB_FAULT);
      await expectEnvelope(await call());
    });

    it('a successful rename returns 200 with the updated document', async () => {
      renameDocument.mockResolvedValue({ id: 'd1', title: 'New Name' });
      const res = await call();
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ document: { id: 'd1', title: 'New Name' } });
    });

    it('a missing document returns 404', async () => {
      renameDocument.mockResolvedValue(null);
      const res = await call();
      expect(res.status).toBe(404);
    });

    it('an unusable title returns 400 INVALID_REQUEST (client-error envelope, untouched by the wrap)', async () => {
      const res = await call('d1', { title: '   ' });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe('INVALID_REQUEST');
      expect(renameDocument).not.toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    const call = (id = 'd1') =>
      route().then(({ DELETE }) =>
        DELETE(new NextRequest(`http://t/api/user-corpus/documents/${id}`, { method: 'DELETE' }), params({ id })),
      );

    it('a deleteDocument failure returns the envelope, not a raw exception', async () => {
      // deleteDocument throws on a blob outage (del() rejects) by design — the row survives. The
      // throw still happens; the route's catch only translates it into the envelope at the
      // boundary. This asserts the shape, not the row survival (a data-layer property).
      deleteDocument.mockRejectedValue(DB_FAULT);
      await expectEnvelope(await call());
    });

    it('a successful delete returns 200 with { deleted: true }', async () => {
      const res = await call();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ deleted: true });
    });

    it('a missing document returns 404', async () => {
      deleteDocument.mockResolvedValue(false);
      const res = await call();
      expect(res.status).toBe(404);
    });
  });
});
