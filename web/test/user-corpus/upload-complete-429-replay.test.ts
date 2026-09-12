// 429 + replay regression on upload-complete (introduced 76c73bef, the commit that moved
// the rate-limit check inside `try` after `pathname` was parsed and added an unconditional
// `deleteUserDocument(pathname)` to the 429 branch).
//
// The two-call direct-to-Blob flow uploads bytes to a presigned `pathname` BEFORE
// upload-complete runs, and the first successful call stores that SAME pathname onto the
// document row as `blob_url` (setBlobPathname). A non-UI client that re-POSTs a prior
// {pathname, name} WITHOUT re-calling upload-url re-enters the route with
// `pathname === existing.blobUrl`. The dedupe branch carries a `deleteOrphanUnless` guard
// for exactly that hazard; the 429 branch runs FIRST and deletes `pathname` unconditionally,
// so a replay that trips the limiter reaches the unguarded delete and destroys the
// surviving row's live blob. The next drain reads getUserDocument(row.blob_url) and throws
// UploadRefused('corrupt'), the row is failed, and re-uploading does not heal it (healPlan
// returns 'requeue' for any non-null blobUrl, never re-homing the dead pointer).
//
// The fix applies deleteOrphanUnless discipline to the 429 branch: getDocumentByBlobPathname
// looks the pathname up, and the delete is skipped when a surviving row claims it as its
// live blob_url.
//
// This suite proves:
// (1) a 429 + replay of a LIVE pathname keeps the blob (bucket-saturation refuse),
// (2) the same holds on a fail-closed limiter-'unavailable' refuse (the reachable-on-a-blip
//     variant described in the report; same precondition — pathname === a surviving row's
//     blob_url — just a different reason the limiter refuses),
// (3) a genuine orphan (no surviving row) is still cleaned up on 429 (no regression), and
// (4) the 429 response carries the documented status, Retry-After header, and body on both
//     the live-replay and the orphan cases.
//
// Mock-level: it replaces blob/documents/route-guard/csrf-floor/rate-limit/queue with
// in-memory fakes and pre-populates BYTES so the replayed pathname has bytes. It does not
// exercise Vercel Blob's real read-after-write or the real Postgres lookup; it proves the
// route's 429 branching logic stops the delete on a same-pathname replay and still fires it
// on a genuine orphan.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DocStatus, DocType, UserDocument } from '@/lib/user-corpus/types';
import type { RateLimitResult } from '@/lib/rate-limit';

// ── A consistent test user + pathnames ───────────────────────────────────────────────────
const USER = { id: '00000000-0000-0000-0000-000000000000', email: 'replay429@example.com' };
const DOC_UUID = '11111111-1111-1111-1111-111111111111';
const PATHNAME = `user-corpus/${USER.id}/${DOC_UUID}`;
const CONTENT = new TextEncoder().encode('hello');

// ── In-memory stores ────────────────────────────────────────────────────────────────────
const BYTES = new Map<string, Uint8Array>();
const docs = new Map<string, UserDocument>();

/** What checkCorpusCompleteRateLimit returns next. Switched per-test to drive the 429 path. */
let completeLimit: RateLimitResult = { ok: true };

/** Build a full UserDocument with defaults so the test typechecks under the strict test tsconfig. */
function makeDoc(partial: Partial<UserDocument> & { id: string }): UserDocument {
  return {
    userId: USER.id,
    title: 'a',
    docType: 'unknown' satisfies DocType,
    sourceFilename: 'a.txt',
    blobUrl: null,
    byteSize: CONTENT.byteLength,
    checksum: null,
    status: 'queued' satisfies DocStatus,
    parseError: null,
    mimeType: 'text/plain',
    pageCount: null,
    extractableChars: null,
    attempts: 0,
    claimedAt: null,
    createdAt: '2026-09-12T00:00:00.000Z',
    updatedAt: '2026-09-12T00:00:00.000Z',
    searchCategories: null,
    readingsStatus: null,
    readingsProgress: 0,
    readingsStep: null,
    readingsError: null,
    readingsDoneAt: null,
    suggestedReference: null,
    suggestedDate: null,
    ...partial,
  };
}

// ── Mocks — the routed branch under test is the 429 path, so rate-limit is controllable and ─
// getDocumentByBlobPathname reads the in-memory docs map (so a seeded surviving row is found).

vi.mock('@/lib/user-corpus/route-guard', () => ({
  guardUser: async () => ({ user: USER }),
}));

vi.mock('@/lib/csrf-floor', () => ({
  requireJsonContentType: () => null,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkCorpusCompleteRateLimit: async () => completeLimit,
}));

vi.mock('@/lib/user-corpus/blob', async (importOriginal) => ({
  // blobPathname stays real — harmless here, and the dedupe branch (not exercised at 429)
  // would otherwise need it. getUserDocument/deleteUserDocument operate on the in-memory map.
  ...(await importOriginal<typeof import('@/lib/user-corpus/blob')>()),
  getUserDocument: async (pathname: string) => {
    const b = BYTES.get(pathname);
    if (!b) throw new Error(`no bytes for ${pathname}`);
    return b;
  },
  deleteUserDocument: async (pathname: string) => {
    BYTES.delete(pathname);
  },
  putUserDocument: async (userId: string, documentId: string, bytes: Uint8Array) => {
    const pathname = `user-corpus/${userId}/${documentId}`;
    BYTES.set(pathname, bytes);
    return pathname;
  },
}));

vi.mock('@/lib/user-corpus/documents', async (importOriginal) => {
  // isHealable/healPlan stay REAL — the 429 branch does not call them, but keeping them real
  // means a future test that flips completeLimit to ok and reaches dedupe exercises the real
  // predicate, not a copy. getDocumentByBlobPathname is the wiring under test: it reads the
  // in-memory docs map so a seeded surviving row is found.
  const actual = await importOriginal<typeof import('@/lib/user-corpus/documents')>();
  return {
    ...actual,
    getDocumentByBlobPathname: async (_userId: string, pathname: string) => {
      for (const d of docs.values()) if (d.blobUrl === pathname) return d;
      return null;
    },
  };
});

// The drain is not exercised at the 429 path; stub it so kickDrain's after() never reaches a
// real queue. (after() throws outside a real request scope under vitest; kickDrain catches it,
// and the route returns before drain runs — this is belt-and-braces.)
vi.mock('@/lib/user-corpus/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/user-corpus/queue')>()),
  drain: async () => ({ attempted: 0, completed: 0, outcomes: {}, reaped: 0 }),
}));

import { POST as uploadComplete } from '@/app/api/user-corpus/upload-complete/route';

function completeReq(pathname: string, name = 'a.txt'): Request {
  return new Request('http://test/api/user-corpus/upload-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pathname, name }),
  });
}

describe('upload-complete — 429 + replay of a live pathname (the guard)', () => {
  beforeEach(() => {
    BYTES.clear();
    docs.clear();
    completeLimit = { ok: true };
    BYTES.set(PATHNAME, CONTENT);
  });

  it('a 429 (bucket saturation) on a replayed LIVE pathname keeps the blob and the row', async () => {
    // Seed a surviving row whose blob_url IS the pathname being replayed, with bytes present.
    docs.set('doc_1', makeDoc({ id: 'doc_1', blobUrl: PATHNAME, status: 'queued', checksum: 'irrelevant' }));
    // The limiter refuses — minute bucket exhausted.
    completeLimit = { ok: false, limited: 'min', retryAfterSec: 60 };

    const res = await uploadComplete(completeReq(PATHNAME) as never);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');

    // THE FIX: the surviving row's live blob is NOT deleted (was deleted before the fix).
    expect(BYTES.has(PATHNAME), 'the live blob survives a 429 on a replayed pathname').toBe(true);
    // The row still names the same, still-readable pathname, still queued.
    const doc = docs.get('doc_1')!;
    expect(doc.blobUrl).toBe(PATHNAME);
    expect(doc.status).toBe('queued');
  });

  it('a 429 (limiter UNAVAILABLE, fail-closed) on a replayed LIVE pathname also keeps the blob', async () => {
    // The fail-closed refuse path (rate-limit.ts:311-314) is reachable on a limiter-DB blip,
    // not only on bucket saturation. Same destructive precondition — pathname === a surviving
    // row's blob_url — so the same guard must hold. This proves the bug code path fires on a
    // fail-closed refuse too, and the fix covers it.
    docs.set('doc_1', makeDoc({ id: 'doc_1', blobUrl: PATHNAME, status: 'queued', checksum: 'irrelevant' }));
    completeLimit = { ok: false, limited: 'unavailable', retryAfterSec: 30 };

    const res = await uploadComplete(completeReq(PATHNAME) as never);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('30');

    expect(BYTES.has(PATHNAME), 'the live blob survives a fail-closed 429 too').toBe(true);
    expect(docs.get('doc_1')!.blobUrl).toBe(PATHNAME);
  });

  it('a 429 on a FRESH orphan (no surviving row) still deletes the blob (no regression)', async () => {
    // No row points at this pathname — a genuine attempt-unique orphan, the case the 429
    // delete was written for (commit 76c73bef). The lookup returns null and the cleanup delete
    // still fires; the guard must not leak genuine orphans.
    const freshPathname = `user-corpus/${USER.id}/22222222-2222-2222-2222-222222222222`;
    BYTES.set(freshPathname, CONTENT);
    completeLimit = { ok: false, limited: 'min', retryAfterSec: 60 };

    const res = await uploadComplete(completeReq(freshPathname) as never);
    expect(res.status).toBe(429);
    // The genuine orphan IS deleted.
    expect(BYTES.has(freshPathname), 'a genuine orphan with no surviving row is still cleaned up').toBe(false);
  });

  it('the 429 response carries the documented body and Retry-After on both paths', async () => {
    // Live replay: status 429, JSON body with error + retryAfterSec.
    docs.set('doc_1', makeDoc({ id: 'doc_1', blobUrl: PATHNAME, status: 'queued' }));
    completeLimit = { ok: false, limited: 'min', retryAfterSec: 77 };

    const res = await uploadComplete(completeReq(PATHNAME) as never);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('77');
    const body = (await res.json()) as { error: string; retryAfterSec: number };
    expect(body.error).toMatch(/too many uploads/i);
    expect(body.retryAfterSec).toBe(77);
  });
});

describe('upload-complete — the 429 replay guard is wired', () => {
  // A source-level guard so a future port cannot drop the lookup (the same discipline the heal
  // wiring test in upload-complete-heal.test.ts uses). The route's two structurally-identical
  // deletes must BOTH carry the replay guard; this pins the 429 one.
  it('the 429 branch looks the pathname up before deleting', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(
        new URL('../../src/app/api/user-corpus/upload-complete/route.ts', import.meta.url),
        'utf8',
      ),
    );
    expect(src, 'imports the lookup helper').toMatch(/getDocumentByBlobPathname/);
    // The 429 branch's delete is conditional on the lookup result — a `const live = await
    // getDocumentByBlobPathname(...)` followed by `if (!live) { await deleteUserDocument(...) }`.
    expect(src, 'the 429 lookup binds the result').toMatch(/const live = await getDocumentByBlobPathname\(user\.id, pathname\)/);
    expect(src, 'the 429 delete is gated on the lookup').toMatch(/if \(!live\)\s*\{[\s\S]*?deleteUserDocument\(pathname\)/);
    // The dedupe branch's guard is still in place too (the two branches share the discipline).
    expect(src, 'the dedupe guard remains').toMatch(/deleteOrphanUnless/);
  });
});
