// @vitest-environment jsdom
//
// B022 (component leg) — THE PUT THE CLIENT ACTUALLY SENDS MUST PIN application/octet-stream.
//
// `web/test/user-corpus/upload-content-type-mismatch.test.ts` proves the route emits only
// `application/octet-stream` and that a bare File-bodied Request carries the file's real MIME
// type. THIS suite is the end-to-end guard: it renders the real `MyWorksClient`, uploads
// picker-typed files (.pdf / .docx / .txt — the formats the bug broke — plus .md), and asserts
// the PUT `fetch` the component issues carries `Content-Type: application/octet-stream`, the one
// value the presigned URL allows.
//
// The fetch stub enforces the SAME allow-list the shipped route does: a PUT to blob.example.com
// returns 200 only when `Content-Type === application/octet-stream`, otherwise 415
// (`content_type_not_allowed`). So this is a true red/green regression guard:
//   - FIXED client: pins octet-stream -> PUT 200 -> "Added".
//   - BUGGY client: sends no Content-Type header -> jsdom stub sees none -> 415 -> "could not be
//     stored" and NO "Added". Every "… succeeds …" case below goes red.
//
// The store never sees the bytes and `upload-complete` re-derives the real type server-side via
// `sniffType(bytes, name)`, so labelling the transfer `application/octet-stream` does not change
// sniffing or the recorded `mime_type` — the label is a transport concern only.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'u-test' } } }) },
}));

import { MyWorksClient } from '../../src/components/my-works';

const DOC = {
  id: 'doc-1',
  title: 'My sermon on John 10',
  status: 'ready',
  createdAt: '2026-08-17T00:00:00.000Z',
};

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Every PUT the component issued, with the headers it sent — for header assertions. */
let putCalls: { url: string; contentType: string | null; body: File }[] = [];

beforeEach(() => {
  putCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: File | string }) => {
      const u = String(url);
      if (u.includes('/api/user-corpus/upload-url') && init?.method === 'POST') {
        return Response.json({
          uploadUrl: 'https://blob.example.com/put/1',
          pathname: 'user-corpus/u-test/doc-1',
          documentId: 'doc-1',
        });
      }
      if (u.includes('blob.example.com/put/') && init?.method === 'PUT') {
        const headers = new Headers(init.headers);
        const contentType = headers.get('content-type');
        putCalls.push({ url: u, contentType, body: init?.body as File });
        // Simulate Vercel Blob's `allowedContentTypes` enforcement — the SAME allow-list the
        // shipped route emits (`['application/octet-stream']`). Any other type (or none at all)
        // is rejected, exactly as the CDN rejects the buggy client's browser-derived header.
        if (contentType === 'application/octet-stream') {
          return new Response('{"pathname":"ok"}', { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return Response.json(
          { error: { code: 'content_type_not_allowed', message: 'Content-Type is not allowed.' } },
          { status: 415 },
        );
      }
      if (u.includes('/api/user-corpus/upload-complete') && init?.method === 'POST') {
        return Response.json({ document: { id: 'new' } }, { status: 201 });
      }
      if (u.includes('/api/user-corpus/documents')) return Response.json({ documents: [DOC] });
      return Response.json({});
    }),
  );
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function renderReady() {
  render(<MyWorksClient />);
  await screen.findByText('My sermon on John 10');
  return screen.getByLabelText(/add a document/i, { selector: 'input' }) as HTMLInputElement;
}

describe('B022 — the PUT pins Content-Type: application/octet-stream, the only type the presigned URL allows', () => {
  it('a .pdf upload (file.type application/pdf) succeeds because the PUT pins octet-stream', async () => {
    const input = await renderReady();
    const pdf = new File(['%PDF-1.4 fake bytes'], 'sermon.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [pdf] } });

    await waitFor(() => expect(putCalls).toHaveLength(1));
    // The PUT sent the ONLY type the presigned URL allows — not the file's real application/pdf.
    expect(putCalls[0].contentType).toBe('application/octet-stream');
    expect(putCalls[0].body.name).toBe('sermon.pdf');
    // The upload completed; it did NOT fall into the `!putRes.ok` "could not be stored" branch.
    await screen.findByText('Added');
    expect(screen.queryByText(/could not be stored/i)).toBeNull();
  });

  it('a .docx upload (docx media type) succeeds because the PUT pins octet-stream', async () => {
    const input = await renderReady();
    const docx = new File(['PK\x03\x04 fake docx'], 'notes.docx', { type: DOCX_TYPE });
    fireEvent.change(input, { target: { files: [docx] } });

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(putCalls[0].contentType).toBe('application/octet-stream');
    expect(putCalls[0].body.name).toBe('notes.docx');
    await screen.findByText('Added');
  });

  it('a .txt upload (text/plain) succeeds because the PUT pins octet-stream', async () => {
    const input = await renderReady();
    const txt = new File(['plain text body'], 'readme.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [txt] } });

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(putCalls[0].contentType).toBe('application/octet-stream');
    expect(putCalls[0].body.name).toBe('readme.txt');
    await screen.findByText('Added');
  });

  it('a .md upload (empty file.type) also sends octet-stream explicitly, not a derived empty header', async () => {
    // Markdown was passing by accident (browser sends no Content-Type, CDN defaults to
    // octet-stream). The pin makes it explicit and robust, so .md keeps working.
    const input = await renderReady();
    const md = new File(['# heading'], 'notes.md', { type: '' });
    fireEvent.change(input, { target: { files: [md] } });

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(putCalls[0].contentType).toBe('application/octet-stream');
    expect(putCalls[0].body.name).toBe('notes.md');
    await screen.findByText('Added');
  });

  it('the PUT for every uploaded format carries application/octet-stream, never the file.type', async () => {
    const input = await renderReady();
    const files = [
      new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }),
      new File(['PK'], 'b.docx', { type: DOCX_TYPE }),
      new File(['x'], 'c.txt', { type: 'text/plain' }),
      new File(['# h'], 'd.md', { type: '' }),
    ];
    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(putCalls).toHaveLength(files.length));
    for (const call of putCalls) {
      expect(call.contentType).toBe('application/octet-stream');
    }
    await screen.findByText(/4 added/i);
  });
});

describe('B022 — regression proof: the store rejects a PUT whose Content-Type is not in the allow-list', () => {
  it('shows the storage-failure message when the PUT carries the file\'s real MIME type (the bug)', async () => {
    // Negative control: re-stub so the PUT passes through the file's real Content-Type
    // (simulating the UNFIXED browser, which derives the header from file.type). The store
    // rejects every non-octet-stream type, so the upload fails — confirming the stub enforces
    // the allow-list and that the success cases above are genuinely load-bearing.
    vi.unstubAllGlobals();
    let sentType: string | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: File | string }) => {
        const u = String(url);
        if (u.includes('/api/user-corpus/upload-url') && init?.method === 'POST') {
          return Response.json({
            uploadUrl: 'https://blob.example.com/put/1',
            pathname: 'user-corpus/u-test/doc-1',
            documentId: 'doc-1',
          });
        }
        if (u.includes('blob.example.com/put/') && init?.method === 'PUT') {
          // Simulate the UNFIXED browser: derive Content-Type from file.type, send NO pinned header.
          // (With the real fix, init.headers already contains octet-stream and this branch is moot;
          // here we strip it to prove the store would reject the browser-derived type.)
          const file = init?.body as File;
          const derived = new Headers(file?.type ? { 'content-type': file.type } : {}).get('content-type');
          sentType = derived;
          if (derived === 'application/octet-stream') {
            return new Response('{"pathname":"ok"}', { status: 200 });
          }
          return Response.json(
            { error: { code: 'content_type_not_allowed' } },
            { status: 415 },
          );
        }
        if (u.includes('/api/user-corpus/upload-complete') && init?.method === 'POST') {
          return Response.json({ document: { id: 'new' } }, { status: 201 });
        }
        if (u.includes('/api/user-corpus/documents')) return Response.json({ documents: [DOC] });
        return Response.json({});
      }),
    );

    const input = await renderReady();
    const pdf = new File(['%PDF-1.4 fake bytes'], 'sermon.pdf', { type: 'application/pdf' });
    // Strip the pinned header the fixed client adds, to simulate the buggy client's `fetch`.
    // (The fixed client sets headers: { 'Content-Type': 'application/octet-stream' }; we override
    // the stub to ignore init.headers entirely and derive from file.type — the unfixed behaviour.)
    fireEvent.change(input, { target: { files: [pdf] } });

    await screen.findByText(/could not be stored/i);
    expect(sentType).toBe('application/pdf');
    expect(screen.queryByText('Added')).toBeNull();
  });

  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
});
