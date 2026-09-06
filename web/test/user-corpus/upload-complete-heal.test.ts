// D11 (DEEP_SWEEP) — the live upload path (upload-complete) must HEAL a re-upload whose bytes
// already exist against a HEALABLE row, not return it unchanged. The sibling legacy route
// (upload/route.ts) already does; this ports that behaviour to the only upload path the product
// UI uses, and locks it with a behavioural test against the real handler. The bug went undetected
// because blob-failure-heal.test.ts only source-greps the legacy route, never upload-complete.
//
// `after()` from next/server throws outside a real request scope (vitest), so the route's
// kickDrain catches it and the drain never runs here; the heal side effects we assert are the
// DB/store calls (putUserDocument / setBlobPathname / requeueForRetry). For the fire-and-forget
// drain itself we rely on the source-grep test below plus the route-returns-normally assertions.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { UserDocument } from '@/lib/user-corpus/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────

const USER = { id: 'u-test-heal', email: 'heal@example.com' };
const UUID = '11111111-1111-1111-1111-111111111111';
const PATHNAME = `user-corpus/${USER.id}/${UUID}`;
const BYTES_PAYLOAD = new TextEncoder().encode('a sermon text');
const NOW = '2026-09-01T00:00:00.000Z';

function makeDoc(over: Partial<UserDocument> = {}): UserDocument {
  return {
    id: 'doc-x',
    userId: USER.id,
    title: 'sermon',
    docType: 'unknown',
    sourceFilename: 'sermon.txt',
    blobUrl: null,
    byteSize: BYTES_PAYLOAD.byteLength,
    checksum: null,
    status: 'queued',
    parseError: null,
    mimeType: 'text/plain',
    pageCount: null,
    extractableChars: null,
    attempts: 0,
    claimedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    searchCategories: null,
    readingsStatus: null,
    readingsProgress: 0,
    readingsStep: null,
    readingsError: null,
    readingsDoneAt: null,
    suggestedReference: null,
    suggestedDate: null,
    ...over,
  };
}

function completeReq(body: unknown): Request {
  return new Request('http://localhost/api/user-corpus/upload-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Mocks ─────────────────────────────────────────────────────────────────────────────────
// Spies are created in vi.hoisted so vi.mock factories (which are hoisted above imports) can
// reference them WITHOUT touching outer-scope fixtures (which are not yet evaluated there).
// Default implementations that need fixtures are (re)installed in beforeEach.

const mocks = vi.hoisted(() => {
  const BYTES = new Map<string, Uint8Array>();
  return {
    BYTES,
    getUserDocument: vi.fn(),
    deleteUserDocument: vi.fn(),
    putUserDocument: vi.fn(),
    blobPathname: vi.fn(),
    findByChecksum: vi.fn(),
    createDocument: vi.fn(),
    setBlobPathname: vi.fn(),
    requeueForRetry: vi.fn(),
    drain: vi.fn(),
  };
});

vi.mock('@/lib/user-corpus/blob', () => ({
  getUserDocument: mocks.getUserDocument,
  deleteUserDocument: mocks.deleteUserDocument,
  putUserDocument: mocks.putUserDocument,
  blobPathname: mocks.blobPathname,
}));

// Predicates (isHealable, healPlan) and DuplicateDocument stay REAL via importOriginal spread —
// only the DB-touching functions are spied, so the real predicate drives branch selection.
vi.mock('@/lib/user-corpus/documents', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/user-corpus/documents')>();
  return {
    ...orig,
    findByChecksum: mocks.findByChecksum,
    createDocument: mocks.createDocument,
    setBlobPathname: mocks.setBlobPathname,
    requeueForRetry: mocks.requeueForRetry,
  };
});

vi.mock('@/lib/user-corpus/queue', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/user-corpus/queue')>();
  return { ...orig, drain: mocks.drain };
});

let completeLimit: { ok: boolean; retryAfterSec?: number } = { ok: true };
vi.mock('@/lib/rate-limit', () => ({
  checkCorpusUploadRateLimit: async () => ({ ok: true }),
  checkCorpusCompleteRateLimit: async () => completeLimit,
}));

vi.mock('@/lib/user-corpus/access', () => ({ uploadDenial: () => null }));
vi.mock('@/lib/user-corpus/route-guard', () => ({
  guardUser: async () => ({ user: USER }),
}));

// ── Setup ─────────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  mocks.BYTES.clear();
  mocks.BYTES.set(PATHNAME, BYTES_PAYLOAD);
  completeLimit = { ok: true };

  mocks.getUserDocument.mockImplementation(async (p: string) => {
    const b = mocks.BYTES.get(p);
    if (!b) throw new Error(`no bytes for ${p}`);
    return b;
  });
  mocks.deleteUserDocument.mockImplementation(async (p: string) => { mocks.BYTES.delete(p); });
  mocks.putUserDocument.mockImplementation(async (u: string, d: string, bytes: Uint8Array) => {
    const p = `user-corpus/${u}/${d}`;
    mocks.BYTES.set(p, bytes);
    return p;
  });
  mocks.blobPathname.mockImplementation((u: string, d: string) => `user-corpus/${u}/${d}`);

  mocks.findByChecksum.mockResolvedValue(null);
  mocks.createDocument.mockResolvedValue(makeDoc({ id: 'doc-new', blobUrl: PATHNAME, status: 'queued' }));
  mocks.setBlobPathname.mockResolvedValue(undefined);
  mocks.requeueForRetry.mockResolvedValue(true);
  mocks.drain.mockResolvedValue({ attempted: 0, completed: 0, outcomes: {}, reaped: 0 });
});

// ── Pre-flight dedupe ────────────────────────────────────────────────────────────────────

describe('upload-complete — D11 heal on pre-flight dedupe', () => {
  it('re-upload matching a blob-less (F1) row stores the bytes, sets the blob pathname, requeues with a reset, and returns healed', async () => {
    const broken = makeDoc({ id: 'doc-broken', blobUrl: null, status: 'queued', attempts: 0 });
    mocks.findByChecksum.mockResolvedValue(broken);

    const { POST } = await import('@/app/api/user-corpus/upload-complete/route');
    const res = await POST(completeReq({ pathname: PATHNAME, name: 'sermon.txt' }) as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ document: { id: 'doc-broken' }, duplicateOf: 'doc-broken', healed: true });
    expect(body.message).toBe('That file was already uploaded but had not been stored. It has been restored and queued.');

    // The fresh bytes were stored onto the existing row's canonical pathname.
    expect(mocks.putUserDocument).toHaveBeenCalledWith(USER.id, 'doc-broken', BYTES_PAYLOAD);
    expect(mocks.setBlobPathname).toHaveBeenCalledWith(USER.id, 'doc-broken', `user-corpus/${USER.id}/doc-broken`);
    // Re-queued with a full reset: the prior attempts were burned by a now-repaired fault.
    expect(mocks.requeueForRetry).toHaveBeenCalledWith(USER.id, 'doc-broken', { resetAttempts: true });
    // No new row was created.
    expect(mocks.createDocument).not.toHaveBeenCalled();
    // The just-uploaded orphan was deleted; the stored bytes survive at the canonical pathname.
    expect(mocks.deleteUserDocument).toHaveBeenCalledWith(PATHNAME);
    expect(mocks.BYTES.has(PATHNAME)).toBe(false);
    expect(mocks.BYTES.has(`user-corpus/${USER.id}/doc-broken`)).toBe(true);
  });

  it('re-upload matching a healthy duplicate returns it unchanged with no healed flag and re-stores nothing', async () => {
    const healthy = makeDoc({ id: 'doc-healthy', blobUrl: `user-corpus/${USER.id}/doc-healthy`, status: 'ready', attempts: 0 });
    mocks.findByChecksum.mockResolvedValue(healthy);

    const { POST } = await import('@/app/api/user-corpus/upload-complete/route');
    const res = await POST(completeReq({ pathname: PATHNAME, name: 'sermon.txt' }) as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      document: healthy,
      duplicateOf: 'doc-healthy',
      message: 'You have already uploaded this file.',
    });
    expect(mocks.putUserDocument).not.toHaveBeenCalled();
    expect(mocks.setBlobPathname).not.toHaveBeenCalled();
    expect(mocks.requeueForRetry).not.toHaveBeenCalled();
    expect(mocks.createDocument).not.toHaveBeenCalled();
    expect(mocks.deleteUserDocument).toHaveBeenCalledWith(PATHNAME);
  });

  it('re-upload matching a FAILED row with its blob still attached requeues without re-storing and WITHOUT resetting the budget', async () => {
    const failed = makeDoc({ id: 'doc-failed', blobUrl: `user-corpus/${USER.id}/doc-failed`, status: 'failed', attempts: 1 });
    mocks.findByChecksum.mockResolvedValue(failed);

    const { POST } = await import('@/app/api/user-corpus/upload-complete/route');
    const res = await POST(completeReq({ pathname: PATHNAME, name: 'sermon.txt' }) as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ duplicateOf: 'doc-failed', healed: true });
    expect(body.message).toBe('That file is already uploaded. It has been queued to try processing again.');
    expect(mocks.putUserDocument).not.toHaveBeenCalled();
    expect(mocks.setBlobPathname).not.toHaveBeenCalled();
    expect(mocks.requeueForRetry).toHaveBeenCalledWith(USER.id, 'doc-failed', { resetAttempts: false });
    expect(mocks.createDocument).not.toHaveBeenCalled();
    expect(mocks.deleteUserDocument).toHaveBeenCalledWith(PATHNAME);
  });

  it('re-upload matching a FAILED row at the attempt ceiling does NOT requeue and reports healed:false', async () => {
    const { MAX_ATTEMPTS } = await import('@/lib/user-corpus/queue');
    const exhausted = makeDoc({ id: 'doc-exhausted', blobUrl: `user-corpus/${USER.id}/doc-exhausted`, status: 'failed', attempts: MAX_ATTEMPTS });
    mocks.findByChecksum.mockResolvedValue(exhausted);

    const { POST } = await import('@/app/api/user-corpus/upload-complete/route');
    const res = await POST(completeReq({ pathname: PATHNAME, name: 'sermon.txt' }) as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ duplicateOf: 'doc-exhausted', healed: false });
    expect(body.message).toMatch(/re-uploading it will not help/i);
    expect(mocks.requeueForRetry).not.toHaveBeenCalled();
    expect(mocks.putUserDocument).not.toHaveBeenCalled();
    expect(mocks.setBlobPathname).not.toHaveBeenCalled();
    expect(mocks.createDocument).not.toHaveBeenCalled();
    // The orphan is still cleaned up.
    expect(mocks.deleteUserDocument).toHaveBeenCalledWith(PATHNAME);
  });

  it('a healable row that is already being processed (requeueForRetry false) reports healed:true with the processing message', async () => {
    const broken = makeDoc({ id: 'doc-broken', blobUrl: null, status: 'queued', attempts: 0 });
    mocks.findByChecksum.mockResolvedValue(broken);
    mocks.requeueForRetry.mockResolvedValue(false);

    const { POST } = await import('@/app/api/user-corpus/upload-complete/route');
    const res = await POST(completeReq({ pathname: PATHNAME, name: 'sermon.txt' }) as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ duplicateOf: 'doc-broken', healed: true });
    expect(body.message).toBe('That file is already uploaded and is being processed right now.');
    // The bytes were still stored onto the row before the requeue attempt.
    expect(mocks.putUserDocument).toHaveBeenCalledWith(USER.id, 'doc-broken', BYTES_PAYLOAD);
    expect(mocks.setBlobPathname).toHaveBeenCalled();
    expect(mocks.requeueForRetry).toHaveBeenCalled();
    expect(mocks.deleteUserDocument).toHaveBeenCalledWith(PATHNAME);
  });

  it('a failure to delete the orphaned blob does not fail the heal response', async () => {
    const broken = makeDoc({ id: 'doc-broken', blobUrl: null, status: 'queued', attempts: 0 });
    mocks.findByChecksum.mockResolvedValue(broken);
    mocks.deleteUserDocument.mockRejectedValue(new Error('blob del failed'));

    const { POST } = await import('@/app/api/user-corpus/upload-complete/route');
    const res = await POST(completeReq({ pathname: PATHNAME, name: 'sermon.txt' }) as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ healed: true, duplicateOf: 'doc-broken' });
    expect(mocks.requeueForRetry).toHaveBeenCalled();
  });
});

// ── DuplicateDocument race ─────────────────────────────────────────────────────────────────

describe('upload-complete — D11 heal on the in-transaction dedupe race', () => {
  it('a DuplicateDocument race against a healable twin heals the twin instead of returning it unchanged', async () => {
    const { DuplicateDocument } = await import('@/lib/user-corpus/documents');
    const twin = makeDoc({ id: 'doc-twin', blobUrl: null, status: 'queued', attempts: 0 });
    mocks.findByChecksum.mockResolvedValue(null); // pre-flight missed (both racers past it)
    mocks.createDocument.mockRejectedValue(new DuplicateDocument(twin));

    const { POST } = await import('@/app/api/user-corpus/upload-complete/route');
    const res = await POST(completeReq({ pathname: PATHNAME, name: 'sermon.txt' }) as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ duplicateOf: 'doc-twin', healed: true });
    expect(mocks.putUserDocument).toHaveBeenCalledWith(USER.id, 'doc-twin', BYTES_PAYLOAD);
    expect(mocks.setBlobPathname).toHaveBeenCalledWith(USER.id, 'doc-twin', `user-corpus/${USER.id}/doc-twin`);
    expect(mocks.requeueForRetry).toHaveBeenCalledWith(USER.id, 'doc-twin', { resetAttempts: true });
    expect(mocks.deleteUserDocument).toHaveBeenCalledWith(PATHNAME);
  });

  it('a DuplicateDocument race against a healthy twin returns it unchanged', async () => {
    const { DuplicateDocument } = await import('@/lib/user-corpus/documents');
    const twin = makeDoc({ id: 'doc-twin', blobUrl: `user-corpus/${USER.id}/doc-twin`, status: 'ready', attempts: 0 });
    mocks.findByChecksum.mockResolvedValue(null);
    mocks.createDocument.mockRejectedValue(new DuplicateDocument(twin));

    const { POST } = await import('@/app/api/user-corpus/upload-complete/route');
    const res = await POST(completeReq({ pathname: PATHNAME, name: 'sermon.txt' }) as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ document: twin, duplicateOf: 'doc-twin', message: 'You have already uploaded this file.' });
    expect(mocks.putUserDocument).not.toHaveBeenCalled();
    expect(mocks.requeueForRetry).not.toHaveBeenCalled();
    expect(mocks.deleteUserDocument).toHaveBeenCalledWith(PATHNAME);
  });
});

// ── Happy path (no dedupe) regression ────────────────────────────────────────────────────

describe('upload-complete — fresh upload is unchanged', () => {
  it('a fresh upload creates the document, sets its blob pathname to the just-uploaded pathname, and returns 201', async () => {
    mocks.findByChecksum.mockResolvedValue(null);
    const fresh = makeDoc({ id: 'doc-new', blobUrl: null, status: 'queued' });
    mocks.createDocument.mockResolvedValue(fresh);

    const { POST } = await import('@/app/api/user-corpus/upload-complete/route');
    const res = await POST(completeReq({ pathname: PATHNAME, name: 'sermon.txt' }) as never);

    expect(res.status).toBe(201);
    expect(mocks.createDocument).toHaveBeenCalledWith(USER.id, expect.objectContaining({ filename: 'sermon.txt', checksum: expect.any(String) }));
    expect(mocks.setBlobPathname).toHaveBeenCalledWith(USER.id, 'doc-new', PATHNAME);
    // The heal path was NOT taken.
    expect(mocks.putUserDocument).not.toHaveBeenCalled();
    expect(mocks.requeueForRetry).not.toHaveBeenCalled();
    // The just-uploaded blob is NOT deleted (it is now the document's blob).
    expect(mocks.deleteUserDocument).not.toHaveBeenCalled();
    expect(mocks.BYTES.has(PATHNAME)).toBe(true);
  });
});

// ── Source-level wiring guard ─────────────────────────────────────────────────────────────
// The legacy route's heal was guarded only by a source-grep of upload/route.ts. The live route
// must wire the same primitives; pin the call sites (not just the imports) so a future port
// cannot drop them again.

describe('upload-complete — D11 heal wiring present', () => {
  it('the route calls the heal primitives and kicks the drain', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../src/app/api/user-corpus/upload-complete/route.ts', import.meta.url), 'utf8'));
    expect(src, 'imports the heal predicate').toMatch(/\bisHealable\b/);
    expect(src, 'plans the heal against MAX_ATTEMPTS').toMatch(/healPlan\(existing, MAX_ATTEMPTS\)/);
    expect(src, 'stores the fresh bytes onto the existing row').toMatch(/putUserDocument\(user\.id, existing\.id, bytes\)/);
    expect(src, 'points the existing row at its canonical pathname').toMatch(/setBlobPathname\(user\.id, existing\.id, blobPathname\(user\.id, existing\.id\)\)/);
    expect(src, 'requeues with the plan\u2019s reset, never unconditional')
      .toMatch(/requeueForRetry\(user\.id, existing\.id, \{ resetAttempts: plan\.resetAttempts \}\)/);
    expect(src, 'an exhausted document is not requeued').toMatch(/'exhausted'/);
    expect(src, 'the drain is kicked on heal').toMatch(/kickDrain\(user\.id\)/);
  });
});
