// @vitest-environment jsdom
//
// D13 + D14 + D15 (2026-08-20 uploader deep dive) — THE ARRIVAL EXPERIENCE.
//
// D14: the "drop zone" was a dashed-border label with no drag handlers anywhere in web/src —
// dropping a file NAVIGATED THE TAB AWAY, taking the reader's whole session with it. A drop must
// be prevented-default and uploaded.
//
// D15: the 25 MB cap was enforced only server-side, AFTER the whole file transferred. `file.size`
// is in hand before any network; an oversize file must be refused immediately, by name.
//
// D13: multi-file upload was a serial loop with ONE overwritten error string — 40 files with 6
// refusals surfaced one message that never named a file. Now: bounded-concurrency parallel upload
// with a PER-FILE status row, every failure named and preserved, dedupe ("already uploaded")
// shown as its own state rather than as an error, and one summary line when all settle.

import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'u-test' } } }) },
}));

import { MyWorksClient } from '../../src/components/my-works';
import { MAX_UPLOAD_BYTES } from '../../src/lib/user-corpus/sniff';

const DOC = {
  id: 'doc-1',
  title: 'My sermon on John 10',
  status: 'ready',
  createdAt: '2026-08-17T00:00:00.000Z',
};

/** Uploaded filenames, in the order the POSTs arrived. */
let uploads: string[] = [];
/** Per-filename responder; default 201. */
let respond: (name: string) => Response | Promise<Response> = () =>
  Response.json({ document: { id: 'new' } }, { status: 201 });

beforeEach(() => {
  uploads = [];
  respond = () => Response.json({ document: { id: 'new' } }, { status: 201 });
  let docCounter = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string; body?: FormData | string }) => {
    const u = String(url);
    // Two-call direct-to-Blob flow: upload-url → PUT → upload-complete
    if (u.includes('/api/user-corpus/upload-url') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { name: string };
      docCounter++;
      return Response.json({
        uploadUrl: `https://blob.example.com/put/${docCounter}`,
        pathname: `user-corpus/u-test/doc-${docCounter}`,
        documentId: `doc-${docCounter}`,
      });
    }
    if (u.includes('blob.example.com/put/') && init?.method === 'PUT') {
      return Response.json({ pathname: 'ok' }, { status: 200 });
    }
    if (u.includes('/api/user-corpus/upload-complete') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { name: string };
      uploads.push(body.name);
      return respond(body.name);
    }
    if (u.includes('/api/user-corpus/documents')) return Response.json({ documents: [DOC] });
    return Response.json({});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function renderReady() {
  render(<MyWorksClient />);
  await screen.findByText('My sermon on John 10');
  return screen.getByLabelText(/add a document/i, { selector: 'input' }) as HTMLInputElement;
}

const label = () => document.querySelector('label[for="my-works-file"]') as HTMLLabelElement;

describe('D14 — the drop zone is a real drop zone', () => {
  it('dragover is prevented-default, so the tab does not navigate', async () => {
    await renderReady();
    const ev = createEvent.dragOver(label());
    fireEvent(label(), ev);
    // SEED: remove onDragOver from the label -> RED. The browser default for an unhandled
    // dragover is "this is not a drop target", and the eventual drop navigates the tab.
    expect(ev.defaultPrevented).toBe(true);
  });

  it('dropping a file uploads it instead of navigating', async () => {
    await renderReady();
    const file = new File(['a sermon'], 'dropped.txt', { type: 'text/plain' });
    const ev = createEvent.drop(label());
    Object.defineProperty(ev, 'dataTransfer', { value: { files: [file] } });
    fireEvent(label(), ev);
    expect(ev.defaultPrevented, 'drop must be prevented-default').toBe(true);
    await waitFor(() => expect(uploads).toEqual(['dropped.txt']));
  });

  it('dragenter arms a visible state; dragleave disarms it', async () => {
    await renderReady();
    const before = label().className;
    fireEvent.dragEnter(label());
    expect(label().className).not.toBe(before);
    expect(label().className).toMatch(/accent/);
    fireEvent.dragLeave(label());
    expect(label().className).toBe(before);
  });
});

describe('D15 — client-side pre-checks, before any transfer', () => {
  it('an oversize file is refused by name with no network call', async () => {
    const input = await renderReady();
    const big = new File(['x'], 'enormous.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 });
    fireEvent.change(input, { target: { files: [big] } });

    await screen.findByText('enormous.pdf');
    await screen.findByText(/25 MB limit/i);
    expect(uploads, 'the oversize file must never be transferred').toEqual([]);
  });

  it('an obviously-unaccepted extension is refused immediately, no network', async () => {
    const input = await renderReady();
    const png = new File(['not text'], 'photo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [png] } });

    await screen.findByText('photo.png');
    await screen.findByText(/\.png .*(cannot|not) be read/i);
    expect(uploads).toEqual([]);
  });

  it('the picker copy states the cap', async () => {
    await renderReady();
    expect(screen.getByText(/up to 25 MB/i)).toBeTruthy();
  });
});

describe('D13 — parallel uploads with per-file status', () => {
  it('two files where one fails: both statuses visible, the failure named per file', async () => {
    respond = (name) =>
      name === 'bad.txt'
        ? Response.json({ error: 'That file is not a PDF, Word document, or text file.', code: 'unsupported_type' }, { status: 415 })
        : Response.json({ document: { id: 'new' } }, { status: 201 });

    const input = await renderReady();
    fireEvent.change(input, {
      target: { files: [new File(['good'], 'good.txt'), new File(['bad'], 'bad.txt')] },
    });

    // Both rows exist, each with its own verdict — the old client kept ONE string and the last
    // write won.
    await screen.findByText('good.txt');
    await screen.findByText('bad.txt');
    await screen.findByText(/is not a PDF, Word document/i);
    await screen.findByText('Added');
    await screen.findByText('Refused');
    // The settle summary counts both.
    await screen.findByText(/1 added · 1 refused/i);
  });

  it('the dedupe 200 shows as "already in your library", not as an error', async () => {
    respond = (name) =>
      name === 'dup.txt'
        ? Response.json({ document: DOC, duplicateOf: DOC.id, message: 'You have already uploaded this file.' })
        : Response.json({ document: { id: 'new' } }, { status: 201 });

    const input = await renderReady();
    fireEvent.change(input, {
      target: { files: [new File(['dup'], 'dup.txt'), new File(['new'], 'new.txt')] },
    });

    // Exact string: the row label. (A regex would also match the settle summary below.)
    await screen.findByText('Already in your library');
    await screen.findByText(/1 added · 1 already in your library/i);
    expect(screen.queryByText('Refused')).toBeNull();
  });

  it('runs at most 3 uploads at once, and drains the rest as slots free', async () => {
    const pending: Array<() => void> = [];
    respond = () =>
      new Promise<Response>((resolve) => {
        pending.push(() => resolve(Response.json({ document: { id: 'new' } }, { status: 201 })));
      });

    const input = await renderReady();
    const files = Array.from({ length: 5 }, (_, i) => new File(['x'], `f${i}.txt`));
    fireEvent.change(input, { target: { files } });

    // The first wave is exactly the concurrency bound — not all five.
    await waitFor(() => expect(uploads).toHaveLength(3));
    expect(pending).toHaveLength(3);

    // Each freed slot admits exactly one more file.
    pending.shift()!();
    await waitFor(() => expect(uploads).toHaveLength(4));
    pending.shift()!();
    await waitFor(() => expect(uploads).toHaveLength(5));

    while (pending.length) pending.shift()!();
    await screen.findByText(/5 added/i);
  });

  it('the per-file list is a status region', async () => {
    const input = await renderReady();
    fireEvent.change(input, { target: { files: [new File(['x'], 'one.txt')] } });
    await screen.findByText('one.txt');
    const region = screen.getByRole('status', { name: /upload/i });
    expect(region.textContent).toContain('one.txt');
  });
});
