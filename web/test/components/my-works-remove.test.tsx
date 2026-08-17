// @vitest-environment jsdom
//
// B017 + B018 — REMOVING AN UPLOAD ASKS FIRST, AND DOES NOT LEAVE STALE RESULTS BEHIND.
//
// B017: "Remove" deleted a document instantly, on one click, with no confirmation. An upload is
// the reader's own file and the delete is irreversible from the UI.
//
// B018: after a delete, the document list reloaded but the SEARCH RESULTS did not — so hits
// pointing at the just-deleted document stayed on screen until the reader manually searched again.
// Clicking one of those hits is the failure that matters: a result for a document that no longer
// exists.
//
// The two ship together because they are one gesture. The fix for B018 is to clear the result set
// rather than silently re-run the query: re-running would spend a request the reader did not ask
// for, and the honest state after a delete is "these results are no longer current".

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
  created_at: '2026-08-17T00:00:00.000Z',
  bytes: 130,
};

let deletes: string[] = [];

beforeEach(() => {
  deletes = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string }) => {
    const u = String(url);
    if (init?.method === 'DELETE') { deletes.push(u); return new Response(null, { status: 204 }); }
    if (u.includes('/api/user-corpus/documents')) {
      return Response.json({ documents: [DOC] });
    }
    return Response.json({});
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('B017 — removing an upload asks first', () => {
  it('the first click does not delete; the second does', async () => {
    // SEED: restore `onClick={() => void remove(d.id)}` -> RED. One click destroys the file.
    render(<MyWorksClient />);
    const btn = await screen.findByRole('button', { name: /^Remove$/i });

    fireEvent.click(btn);
    expect(deletes, 'the FIRST click deleted the document').toEqual([]);

    const confirm = await screen.findByRole('button', { name: /remove\?/i });
    fireEvent.click(confirm);
    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0]).toContain(DOC.id);
  });

  it('disarms on blur, so an armed row does not wait to catch a stray click', async () => {
    render(<MyWorksClient />);
    fireEvent.click(await screen.findByRole('button', { name: /^Remove$/i }));
    const confirm = await screen.findByRole('button', { name: /remove\?/i });
    fireEvent.blur(confirm);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Remove$/i })).toBeTruthy());
    expect(deletes).toEqual([]);
  });
});
