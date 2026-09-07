// B022 — UPLOADS FAIL FOR PDF / WORD / TEXT BECAUSE THE PRESIGNED PUT'S Content-Type MISMATCHES.
//
// The two-call direct-to-Blob flow (commit f6495ddc) presigns with
// `allowedContentTypes: ['application/octet-stream']`, but the client PUTs the file with no
// `Content-Type` header. Per the Fetch standard's body-extraction "type" step, when `fetch` is
// given a `File`/`Blob` body whose `type` is a non-empty string, `Content-Type` is set to that
// value — `application/pdf` for a real `.pdf`, the docx media type for `.docx`, `text/plain` for
// `.txt`. None of those is `application/octet-stream`, so Vercel Blob's `allowedContentTypes`
// enforcement rejects the PUT (a non-2xx the SDK classifies as `content_type_not_allowed` /
// `BlobContentTypeNotAllowedError`), `putRes.ok` is false, and the reader sees the generic
// "The file could not be stored. Please try again." for the very formats the drop zone advertises.
//
// Markdown is out of scope by accident: browsers ship no registered type for `.md`, so
// `file.type === ''`, the Fetch standard OMITS the header, and the CDN defaults the request to
// `application/octet-stream` — which passes. The bug bites exactly the formats whose `.type` the
// browser populates.
//
// This suite runs the REAL `upload-url` route handler (with `@vercel/blob` mocked purely to
// capture the options the route passes to `presignUrl`) and then builds the EXACT `Request` the
// client builds — `new Request(url, { method: 'PUT', body: file })` — to prove (a) the route
// emits only `application/octet-stream` as the allowed type, and (b) a bare File-bodied PUT
// carries the file's real MIME type, NOT the one the URL allows. The final assertion proves the
// fix: pinning `Content-Type: application/octet-stream` lands inside the allowed list.
//
// The Request-constructor assertions are a proxy for browser `fetch`; both implement the Fetch
// standard's body-extraction "type" step. Node 20+ ships `File`/`Request`/`Headers` as globals,
// so this runs in the suite's default node environment with no jsdom.

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────────────────
//
// Only what `upload-url/route.ts` imports: the route guards + `@vercel/blob`. `presignUrl`'s
// 2nd argument is captured so the suite can assert the EXACT `allowedContentTypes` the route
// emits — the load-bearing fact that decides which Content-Type headers the CDN will accept.

let currentUser: { id: string; email: string } | null = null;
vi.mock('@/lib/user-corpus/route-guard', () => ({
  guardUser: async () => {
    if (!currentUser) return { denied: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
    return { user: currentUser };
  },
}));

let uploadLimit: { ok: boolean; retryAfterSec?: number } = { ok: true };
vi.mock('@/lib/rate-limit', () => ({
  checkCorpusUploadRateLimit: async () => uploadLimit,
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

/** The options object the route handed to `presignUrl` — captured for assertions. */
let capturedPresignOptions: {
  operation?: string;
  pathname?: string;
  access?: string;
  maximumSizeInBytes?: number;
  allowedContentTypes?: string[];
  addRandomSuffix?: boolean;
} = {};
vi.mock('@vercel/blob', () => ({
  issueSignedToken: async () => ({ delegationToken: 'dt', clientSigningToken: 'cst' }),
  presignUrl: async (_token: unknown, options: typeof capturedPresignOptions) => {
    capturedPresignOptions = options;
    return { presignedUrl: 'https://blob.example.com/put' };
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────────────────

const USER = { id: 'u-test-content-type', email: 'ct@example.com' };

function jsonReq(body: unknown): Request {
  return new Request('http://localhost/api/user-corpus/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * The exact Request `my-works.tsx` builds for the PUT leg — a File body, with the headers the
 * client passes. Pass `pinOctetStream: true` to mirror the fixed client; omit it to mirror the
 * buggy client (no Content-Type header, so the Fetch standard derives it from `file.type`).
 */
function putRequest(file: File, pinOctetStream = false): Request {
  return new Request('https://blob.example.com/put', {
    method: 'PUT',
    ...(pinOctetStream ? { headers: { 'Content-Type': 'application/octet-stream' } } : {}),
    body: file,
  });
}

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ── Tests ────────────────────────────────────────────────────────────────────────────────

describe('B022 — the presigned PUT Content-Type mismatch (upload-url ↔ my-works.tsx)', () => {
  beforeEach(() => {
    currentUser = USER;
    uploadLimit = { ok: true };
    quotaOk = true;
    quotaMessage = '';
    capturedPresignOptions = {};
  });

  it('the route presigns with allowedContentTypes = [application/octet-stream] only', async () => {
    const { POST } = await import('@/app/api/user-corpus/upload-url/route');
    const res = await POST(jsonReq({ name: 'sermon.pdf', size: 1_000_000 }) as never);
    expect(res.status).toBe(200);
    // The ONLY value the CDN will match the PUT's Content-Type against is application/octet-stream.
    // This is the load-bearing fact: if the client sends anything else, the PUT is rejected.
    expect(capturedPresignOptions.allowedContentTypes).toEqual(['application/octet-stream']);
    expect(capturedPresignOptions.allowedContentTypes).not.toContain('application/pdf');
    expect(capturedPresignOptions.allowedContentTypes).not.toContain(DOCX_TYPE);
    expect(capturedPresignOptions.allowedContentTypes).not.toContain('text/plain');
  });

  it('a PDF File PUT (as the buggy my-works.tsx sends it) carries Content-Type application/pdf', () => {
    // `new Request(url, { method: 'PUT', body: file })` with no headers — exactly what the
    // buggy client does. The Fetch standard sets Content-Type from `file.type`.
    const pdf = new File(['%PDF-1.4 fake bytes'], 'sermon.pdf', { type: 'application/pdf' });
    const req = putRequest(pdf, /* pinOctetStream */ false);
    expect(req.headers.get('content-type')).toBe('application/pdf');
    // …which is NOT in the allowed list the route emits — so the CDN would reject it.
    expect(capturedPresignOptions.allowedContentTypes ?? []).not.toContain(
      req.headers.get('content-type'),
    );
    // Sanity: this is a real media type the browser populates for a picker-selected .pdf, not ''.
    expect(pdf.type).toBe('application/pdf');
  });

  it('a docx File PUT carries the docx MIME type, not octet-stream', () => {
    const docx = new File(['PK\x03\x04 fake docx'], 'notes.docx', { type: DOCX_TYPE });
    const req = putRequest(docx, false);
    expect(req.headers.get('content-type')).toBe(DOCX_TYPE);
    expect(req.headers.get('content-type')).not.toBe('application/octet-stream');
  });

  it('a .txt File PUT carries text/plain, not octet-stream', () => {
    const txt = new File(['plain text body'], 'readme.txt', { type: 'text/plain' });
    const req = putRequest(txt, false);
    expect(req.headers.get('content-type')).toBe('text/plain');
    expect(req.headers.get('content-type')).not.toBe('application/octet-stream');
  });

  it('the fix — pinning Content-Type: application/octet-stream — matches the allowed list', async () => {
    // Mirror the fixed client: `fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type':
    // 'application/octet-stream' }, body: file })`. Whatever the file's real type, the pinned
    // header is what the CDN sees, and it is in the route's allow-list.
    const { POST } = await import('@/app/api/user-corpus/upload-url/route');
    await POST(jsonReq({ name: 'sermon.pdf', size: 1_000_000 }) as never);
    const allowed = capturedPresignOptions.allowedContentTypes ?? [];

    for (const file of [
      new File(['%PDF-1.4 fake'], 'sermon.pdf', { type: 'application/pdf' }),
      new File(['PK fake'], 'notes.docx', { type: DOCX_TYPE }),
      new File(['text'], 'readme.txt', { type: 'text/plain' }),
    ]) {
      const req = putRequest(file, /* pinOctetStream */ true);
      expect(req.headers.get('content-type')).toBe('application/octet-stream');
      expect(allowed).toContain('application/octet-stream');
    }
  });
});
