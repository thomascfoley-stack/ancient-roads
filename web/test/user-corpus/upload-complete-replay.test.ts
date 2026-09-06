// Replay-of-upload-complete regression (introduced f6495ddc, the direct-to-Blob two-call flow).
//
// The two-call flow uploads bytes directly to Vercel Blob at a presigned `pathname` BEFORE
// upload-complete runs. The first successful upload-complete stores that SAME `pathname` onto
// the document row as `blob_url`. The dedupe branch inherited an unconditional
// `deleteUserDocument(pathname)` from the legacy single-call /upload route, where it was safe:
// there the incoming blob is `put` AFTER the dedupe check, so the object being deleted is always
// a fresh, attempt-unique one — a genuine orphan. In this flow, a client that replays the exact
// prior {pathname, name} body WITHOUT re-calling upload-url re-enters dedupe with
// `pathname === existing.blobUrl`, and the inherited delete destroys the surviving document's
// live blob. The next drain then re-reads via getUserDocument(row.blob_url) and throws
// UploadRefused('corrupt', '… could not be found'), reporting a healthy upload as corrupt. No
// concurrency and no malformed input are required — only a literal replay.
//
// This suite proves (1) the replay no longer corrupts (the live blob survives), (2) a genuine
// orphan — a DIFFERENT pathname for the same bytes — is still cleaned up, and (3) the same guard
// holds on the in-transaction DuplicateDocument path (the dedupe-race loser).
//
// Mock-level: it replaces blob/documents/route-guard/rate-limit/csrf-floor/queue with in-memory
// fakes and pre-populates BYTES so both calls see the bytes. It does not exercise Vercel Blob's
// real read-after-write semantics or the real pg_advisory_xact_lock; it proves the route's
// branching logic stops the delete on a same-pathname replay.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DocStatus, DocType, UserDocument } from '@/lib/user-corpus/types';

// ── A consistent test user + pathnames ───────────────────────────────────────────────────
const USER = { id: '00000000-0000-0000-0000-000000000000', email: 'replay@example.com' };
const DOC_UUID = '11111111-1111-1111-1111-111111111111';
const PATHNAME = `user-corpus/${USER.id}/${DOC_UUID}`;
const CONTENT = new TextEncoder().encode('hello');

// ── In-memory stores ────────────────────────────────────────────────────────────────────
const BYTES = new Map<string, Uint8Array>();
const docs = new Map<string, UserDocument>();
let createUserCalls = 0;

// What createDocument does on its next call. 'none' inserts a fresh row; 'throw-same' throws
// DuplicateDocument whose existing shares pathname with the request (two completions of one
// presigned session); 'throw-different' throws DuplicateDocument whose existing has a distinct
// blob (winner of two separate sessions, so the request's pathname is a genuine orphan).
let duplicateBehavior: 'none' | 'throw-same' | 'throw-different' = 'none';

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
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
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

// ── Mocks — keep real checksum/sniffType; replace storage, documents, and the route's gates ─

vi.mock('@/lib/user-corpus/route-guard', () => ({
  guardUser: async () => ({ user: USER }),
}));

vi.mock('@/lib/csrf-floor', () => ({
  requireJsonContentType: () => null,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkCorpusCompleteRateLimit: async () => ({ ok: true as const }),
}));

vi.mock('@/lib/user-corpus/blob', () => ({
  getUserDocument: async (pathname: string) => {
    const b = BYTES.get(pathname);
    if (!b) throw new Error(`no bytes for ${pathname}`);
    return b;
  },
  deleteUserDocument: async (pathname: string) => {
    BYTES.delete(pathname);
  },
}));

// The real DuplicateDocument class is redeclared inside the factory so the route's `instanceof`
// (in the .catch and in the `created instanceof DuplicateDocument` check) and the class thrown
// by createDocument are the SAME class — the route imports DuplicateDocument from this module.
vi.mock('@/lib/user-corpus/documents', () => {
  class DuplicateDocument extends Error {
    readonly existing: UserDocument;
    constructor(existing: UserDocument) {
      super('document with this checksum already exists');
      this.name = 'DuplicateDocument';
      this.existing = existing;
    }
  }
  return {
    DuplicateDocument,
    findByChecksum: async (_userId: string, sum: string) => {
      for (const d of docs.values()) if (d.checksum === sum) return d;
      return null;
    },
    createDocument: async (
      _userId: string,
      meta: { title: string; filename: string; byteSize: number; checksum: string; mimeType: string },
    ) => {
      createUserCalls += 1;
      if (duplicateBehavior === 'throw-same') {
        // The winner of one presigned session already set blob_url = PATHNAME.
        const twin = makeDoc({ id: 'doc-winner', checksum: meta.checksum, blobUrl: PATHNAME, status: 'queued' });
        docs.set(twin.id, twin);
        throw new DuplicateDocument(twin);
      }
      if (duplicateBehavior === 'throw-different') {
        // The winner of a SEPARATE session already has its own distinct blob.
        const twin = makeDoc({
          id: 'doc-winner',
          checksum: meta.checksum,
          blobUrl: `user-corpus/${USER.id}/99999999-9999-9999-9999-999999999999`,
          status: 'queued',
        });
        docs.set(twin.id, twin);
        throw new DuplicateDocument(twin);
      }
      const id = 'doc_1';
      const doc = makeDoc({
        id,
        checksum: meta.checksum,
        blobUrl: null,
        title: meta.title,
        sourceFilename: meta.filename,
        mimeType: meta.mimeType,
      });
      docs.set(id, doc);
      return doc;
    },
    setBlobPathname: async (_userId: string, id: string, pathname: string) => {
      const d = docs.get(id);
      if (d) docs.set(id, { ...d, blobUrl: pathname, updatedAt: '2026-09-06T00:00:01.000Z' });
    },
  };
});

vi.mock('@/lib/user-corpus/queue', () => ({
  drain: async () => undefined,
}));

import { POST as uploadComplete } from '@/app/api/user-corpus/upload-complete/route';

function completeReq(pathname: string, name = 'a.txt'): Request {
  return new Request('http://test/api/user-corpus/upload-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pathname, name }),
  });
}

describe('upload-complete — replay and the dedupe-delete guard', () => {
  beforeEach(() => {
    BYTES.clear();
    docs.clear();
    createUserCalls = 0;
    duplicateBehavior = 'none';
    BYTES.set(PATHNAME, CONTENT);
  });

  it('replaying upload-complete with the SAME pathname keeps the live blob (no corruption)', async () => {
    // First call: create the row, set blob_url = PATHNAME.
    const res1 = await uploadComplete(completeReq(PATHNAME) as never);
    expect(res1.status).toBe(201);

    // Replay the exact same body — same pathname, no re-presign.
    const res2 = await uploadComplete(completeReq(PATHNAME) as never);
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { document: UserDocument; duplicateOf: string; message: string };
    expect(body2.duplicateOf).toBe('doc_1');
    expect(body2.message).toMatch(/already/i);

    // THE BUG, fixed: the live blob survives (was deleted before the fix)…
    expect(BYTES.has(PATHNAME)).toBe(true);
    // …and the row still names the same, still-readable pathname, still queued.
    const doc = docs.get('doc_1')!;
    expect(doc.blobUrl).toBe(PATHNAME);
    expect(doc.status).toBe('queued');
    // And no spurious second row was created — the replay is a no-op hit, not a new document.
    expect(createUserCalls).toBe(1);
    expect(docs.size).toBe(1);
  });

  it('a DIFFERENT pathname for the same bytes is a genuine orphan and IS deleted', async () => {
    // First upload at PATHNAME.
    const res1 = await uploadComplete(completeReq(PATHNAME) as never);
    expect(res1.status).toBe(201);

    // A separate presigned session with fresh bytes for the SAME content.
    const OTHER = `user-corpus/${USER.id}/22222222-2222-2222-2222-222222222222`;
    BYTES.set(OTHER, CONTENT);
    const res2 = await uploadComplete(completeReq(OTHER) as never);
    expect(res2.status).toBe(200);

    // The duplicate's orphaned blob is cleaned up…
    expect(BYTES.has(OTHER)).toBe(false);
    // …while the original document's live blob is untouched.
    expect(BYTES.has(PATHNAME)).toBe(true);
    expect(docs.get('doc_1')!.blobUrl).toBe(PATHNAME);
    expect(docs.size).toBe(1);
  });

  it('an existing row whose blobUrl is null still deletes the incoming orphan', async () => {
    // A document with no stored blob (a prior putUserDocument failure) has blobUrl null. The
    // incoming pathname is then a genuine orphan distinct from null, so the cleanup must fire —
    // that is the legitimate case the inherited delete served, and the guard must not regress it.
    const orphan = `user-corpus/${USER.id}/33333333-3333-3333-3333-333333333333`;
    BYTES.set(orphan, CONTENT);
    docs.set(
      'doc-null-blob',
      makeDoc({ id: 'doc-null-blob', checksum: 'irrelevant', blobUrl: null, status: 'queued' }),
    );
    // Patch findByChecksum's match to the real checksum of CONTENT by setting it on the seeded row.
    const sum = await realChecksumOf(CONTENT);
    docs.set('doc-null-blob', { ...docs.get('doc-null-blob')!, checksum: sum });

    const res = await uploadComplete(completeReq(orphan) as never);
    expect(res.status).toBe(200);
    // null blobUrl !== orphan pathname → the orphan is cleaned up.
    expect(BYTES.has(orphan)).toBe(false);
    // The existing row keeps its (null) blob_url unchanged.
    expect(docs.get('doc-null-blob')!.blobUrl).toBe(null);
  });
});

describe('upload-complete — the DuplicateDocument in-transaction loser', () => {
  beforeEach(() => {
    BYTES.clear();
    docs.clear();
    createUserCalls = 0;
    duplicateBehavior = 'none';
    BYTES.set(PATHNAME, CONTENT);
  });

  it('loser whose pathname IS the winner’s blob_url does NOT delete the winner’s live blob', async () => {
    // Two concurrent completions of ONE presigned session share pathname. The pre-flight
    // findByChecksum misses (docs empty), then createDocument loses the in-transaction dedupe
    // race and throws DuplicateDocument whose existing (the winner) has blobUrl === PATHNAME.
    duplicateBehavior = 'throw-same';

    const res = await uploadComplete(completeReq(PATHNAME) as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { duplicateOf: string };
    expect(body.duplicateOf).toBe('doc-winner');

    // THE FIX: the winner's live blob is NOT deleted out from under it.
    expect(BYTES.has(PATHNAME)).toBe(true);
    expect(docs.get('doc-winner')!.blobUrl).toBe(PATHNAME);
  });

  it('loser whose pathname is a DIFFERENT orphan deletes that orphan (cleanup still fires)', async () => {
    // Two separate presigned sessions race; the loser's pathname is a genuine orphan distinct
    // from the winner's own blob. The catch path's delete must still clean it up.
    duplicateBehavior = 'throw-different';

    const res = await uploadComplete(completeReq(PATHNAME) as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { duplicateOf: string };
    expect(body.duplicateOf).toBe('doc-winner');

    // The loser's orphan blob is cleaned up…
    expect(BYTES.has(PATHNAME)).toBe(false);
    // …while the winner's own (different) blob survives.
    const winner = docs.get('doc-winner')!;
    expect(winner.blobUrl).not.toBe(PATHNAME);
    expect(winner.blobUrl).toBe(`user-corpus/${USER.id}/99999999-9999-9999-9999-999999999999`);
  });
});

// Compute the real sha256 checksum the route will derive for CONTENT, so a seeded row matches
// findByChecksum without re-implementing the digest.
async function realChecksumOf(bytes: Uint8Array): Promise<string> {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
