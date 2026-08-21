// @vitest-environment jsdom
//
// D16 (2026-08-20 uploader deep dive) — retry() and remove() must READ THE RESPONSE.
//
// Both calls discarded the server's answer entirely. The 409s on the retry route are written to
// be shown ("The original file was not stored, so it cannot be re-parsed. Please upload it
// again.") and could never reach the screen; a failed DELETE silently kept the row with nothing
// said, which reads as "remove is broken" or worse, "remove worked" — until the next reload.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'u-test' } } }) },
}));

import { MyWorksClient } from '../../src/components/my-works';

const FAILED_DOC = {
  id: 'doc-1',
  title: 'A sermon that failed to parse',
  status: 'failed',
  createdAt: '2026-08-17T00:00:00.000Z',
};
const READY_DOC = {
  id: 'doc-2',
  title: 'A ready sermon',
  status: 'ready',
  createdAt: '2026-08-17T00:00:00.000Z',
};

let posts: string[] = [];
let deletes: string[] = [];
let retryResponse: () => Response = () => Response.json({ document: FAILED_DOC });
let deleteResponse: () => Response = () => Response.json({ deleted: true });

beforeEach(() => {
  posts = [];
  deletes = [];
  retryResponse = () => Response.json({ document: FAILED_DOC });
  deleteResponse = () => Response.json({ deleted: true });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string }) => {
    const u = String(url);
    if (init?.method === 'POST') { posts.push(u); return retryResponse(); }
    if (init?.method === 'DELETE') { deletes.push(u); return deleteResponse(); }
    if (u.includes('/api/user-corpus/documents')) {
      return Response.json({ documents: [FAILED_DOC, READY_DOC] });
    }
    return Response.json({});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('D16 — the server\'s sentences reach the screen', () => {
  it('a 409 on retry surfaces the server\'s own message', async () => {
    retryResponse = () =>
      Response.json(
        { error: 'The original file was not stored, so it cannot be re-parsed. Please upload it again.' },
        { status: 409 },
      );

    render(<MyWorksClient />);
    fireEvent.click(await screen.findByRole('button', { name: /try again/i }));

    // SEED: restore `await fetch(...); await load();` with no response read -> RED.
    await screen.findByText(/was not stored, so it cannot be re-parsed/i);
    expect(posts).toHaveLength(1);
  });

  it('a failed remove says so instead of silently keeping the row', async () => {
    deleteResponse = () => Response.json({ error: 'Not found' }, { status: 404 });

    render(<MyWorksClient />);
    const row = await screen.findByText('A ready sermon');
    const removeBtn = screen.getAllByRole('button', { name: /^Remove$/i })[1]!;
    fireEvent.click(removeBtn);
    fireEvent.click(await screen.findByRole('button', { name: /remove\?/i }));

    await waitFor(() => expect(deletes).toHaveLength(1));
    await screen.findByText(/could not be removed|Not found/i);
    // The row is still there — and the page SAID so rather than pretending.
    expect(row.isConnected).toBe(true);
  });

  it('a network failure on remove is reported', async () => {
    deleteResponse = () => { throw new TypeError('network down'); };

    render(<MyWorksClient />);
    await screen.findByText('A ready sermon');
    fireEvent.click(screen.getAllByRole('button', { name: /^Remove$/i })[1]!);
    fireEvent.click(await screen.findByRole('button', { name: /remove\?/i }));

    await screen.findByText(/could not be removed/i);
  });
});
