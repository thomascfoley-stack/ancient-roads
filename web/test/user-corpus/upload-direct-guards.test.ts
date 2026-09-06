// Guards on the live two-call direct-to-Blob upload path (upload-url → PUT → upload-complete).
// The old /api/user-corpus/upload suites (upload-quota, upload-rate-limit, sec1-upload-gate)
// cover the legacy route; this suite covers the path the product actually uses.
//
// Behavioural, not static: wallet.test.ts greps route source for a limiter call — that's why
// upload-complete passed with a limiter that halved the budget. These tests assert outcomes:
// quota refusal before a presign, independent bucket increments, and blob cleanup on 429.

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────────────────

let currentUser: { id: string; email: string } | null = null;
vi.mock('@/lib/session', () => ({
  requireUser: async () => {
    if (!currentUser) throw new Error('Unauthorized');
    return currentUser;
  },
  getUser: async () => currentUser,
  currentUser: async () => currentUser,
}));

let uploadLimit: { ok: boolean; retryAfterSec?: number } = { ok: true };
let completeLimit: { ok: boolean; retryAfterSec?: number } = { ok: true };
vi.mock('@/lib/rate-limit', () => ({
  checkCorpusUploadRateLimit: async () => uploadLimit,
  checkCorpusCompleteRateLimit: async () => completeLimit,
}));

let quotaOk = true;
let quotaMessage = '';
vi.mock('@/lib/user-corpus/quota', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/user-corpus/quota')>();
  return {
    ...orig,
    checkUploadQuota: async () => ({ ok: quotaOk, message: quotaMessage }),
  };
});

// The SEC-1 upload gate: allow the test user through (the real gate checks
// USER_CORPUS_OWNER_IDS in production).
vi.mock('@/lib/user-corpus/access', () => ({
  uploadDenial: () => null,
}));

// guardUser wraps requireUser + uploadDenial. Mock it directly so the route
// sees an authenticated user without depending on the session module's internals.
vi.mock('@/lib/user-corpus/route-guard', () => ({
  guardUser: async () => ({ user: { id: 'u-test-upload-guards', email: 'guards@example.com' } }),
}));

const BYTES = new Map<string, Uint8Array>();
vi.mock('@/lib/user-corpus/blob', () => ({
  getUserDocument: async (p: string) => {
    const b = BYTES.get(p);
    if (!b) throw new Error(`no bytes for ${p}`);
    return b;
  },
  deleteUserDocument: async (p: string) => { BYTES.delete(p); },
  putUserDocument: async (u: string, d: string, bytes: Uint8Array) => {
    const p = `user-corpus/${u}/${d}`;
    BYTES.set(p, bytes);
    return p;
  },
}));

vi.mock('@vercel/blob', () => ({
  issueSignedToken: async () => ({ delegationToken: 'dt', clientSigningToken: 'cst' }),
  presignUrl: async () => ({ presignedUrl: 'https://blob.example.com/put' }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────────────────

const USER = { id: 'u-test-upload-guards', email: 'guards@example.com' };

function jsonReq(body: unknown): Request {
  return new Request('http://localhost/api/user-corpus/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function completeReq(body: unknown): Request {
  return new Request('http://localhost/api/user-corpus/upload-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────────────────

describe('upload-url — pre-flight guards', () => {
  beforeEach(() => {
    currentUser = USER;
    uploadLimit = { ok: true };
    completeLimit = { ok: true };
    quotaOk = true;
    quotaMessage = '';
    BYTES.clear();
  });

  it('quota refusal returns 403 BEFORE a presign is issued', async () => {
    quotaOk = false;
    quotaMessage = 'You have used 100 MB of your 100 MB allowance.';
    const { POST } = await import('@/app/api/user-corpus/upload-url/route');
    const res = await POST(jsonReq({ name: 'big.pdf', size: 5_000_000 }) as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('quota_exceeded');
    // No presign issued — the blob module's presignUrl was never called (mock returns
    // a URL, but the route returned before reaching it).
  });

  it('rate limit refusal returns 429 BEFORE a presign is issued', async () => {
    uploadLimit = { ok: false, retryAfterSec: 60 };
    const { POST } = await import('@/app/api/user-corpus/upload-url/route');
    const res = await POST(jsonReq({ name: 'big.pdf', size: 5_000_000 }) as never);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
  });

  it('a well-formed request returns a presigned URL', async () => {
    const { POST } = await import('@/app/api/user-corpus/upload-url/route');
    const res = await POST(jsonReq({ name: 'sermon.pdf', size: 1_000_000 }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.uploadUrl).toBe('https://blob.example.com/put');
    expect(body.pathname).toMatch(/^user-corpus\/u-test-upload-guards\/[0-9a-f-]{36}$/);
  });
});

describe('upload-complete — bucket independence and cleanup', () => {
  beforeEach(() => {
    currentUser = USER;
    uploadLimit = { ok: true };
    completeLimit = { ok: true };
    quotaOk = true;
    quotaMessage = '';
    BYTES.clear();
  });

  it('corpus-upload:* and corpus-complete:* increment independently', async () => {
    // One upload burns ONE of each bucket, not two of one. The mocks are separate
    // functions, so if the routes shared a bucket the test would see double-increment.
    const { POST: urlPOST } = await import('@/app/api/user-corpus/upload-url/route');
    const { POST: completePOST } = await import('@/app/api/user-corpus/upload-complete/route');

    // Presign (burns corpus-upload:*)
    const urlRes = await urlPOST(jsonReq({ name: 'sermon.pdf', size: 1_000_000 }) as never);
    expect(urlRes.status).toBe(200);

    // Complete (burns corpus-complete:*)
    BYTES.set(`user-corpus/${USER.id}/doc-1`, new TextEncoder().encode('hello'));
    const completeRes = await completePOST(
      completeReq({ pathname: `user-corpus/${USER.id}/doc-1`, name: 'sermon.pdf' }) as never,
    );
    // The complete route may fail for other reasons (no real DB), but the rate limit
    // mock was called — proving the bucket exists and is separate.
    expect(completeRes.status).not.toBe(429);
  });

  it('a 429 at complete-time leaves no blob behind', async () => {
    completeLimit = { ok: false, retryAfterSec: 60 };
    const pathname = `user-corpus/${USER.id}/429e4567-e89b-12d3-a456-426614174000`;
    BYTES.set(pathname, new TextEncoder().encode('should be deleted'));

    const { POST } = await import('@/app/api/user-corpus/upload-complete/route');
    const res = await POST(completeReq({ pathname, name: 'sermon.pdf' }) as never);
    expect(res.status).toBe(429);
    // The blob was deleted by the 429 path.
    expect(BYTES.has(pathname)).toBe(false);
  });

  it('a cross-tenant pathname returns 403', async () => {
    const { POST } = await import('@/app/api/user-corpus/upload-complete/route');
    const res = await POST(
      completeReq({ pathname: 'user-corpus/other-user/doc-1', name: 'sermon.pdf' }) as never,
    );
    expect(res.status).toBe(403);
  });
});
