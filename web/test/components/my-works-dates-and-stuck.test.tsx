// @vitest-environment jsdom
//
// D17 + the Tier-0 reclaim leftover (2026-08-20 uploader deep dive).
//
// D17: `UserHit.createdAt` has been on the wire the whole time and the client type simply omitted
// it — search results carried no date, though §7 requires user results "labelled as theirs
// (doc + date)".
//
// Reclaim: a document stuck in a non-terminal state (H2's stranded `chunking`/`embedding` rows —
// one was observed 3.66 days old on dev) had NO retry control, because the button rendered only
// for `failed`. A row in flight for more than five minutes now says "Taking longer than
// expected" and offers Retry; the server's claim-reclaim does the rest when the retry drains.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'u-test' } } }) },
}));

import { MyWorksClient } from '../../src/components/my-works';

let posts: string[] = [];
let documents: unknown[] = [];
let searchHits: unknown[] = [];

beforeEach(() => {
  posts = [];
  documents = [];
  searchHits = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string }) => {
    const u = String(url);
    if (init?.method === 'POST') { posts.push(u); return Response.json({ document: {} }); }
    if (u.includes('/api/user-corpus/search')) {
      return Response.json({ mode: 'fused', q: 'grace', hits: searchHits });
    }
    if (u.includes('/api/user-corpus/documents')) return Response.json({ documents });
    return Response.json({});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('D17 — search results carry the document date', () => {
  it('a hit row renders its document\'s date', async () => {
    documents = [{ id: 'doc-1', title: 'On John 10', status: 'ready', createdAt: '2026-08-17T00:00:00.000Z' }];
    searchHits = [{
      documentId: 'doc-1',
      sectionId: 's-1',
      title: 'On John 10',
      heading: null,
      ordinal: 0,
      text: 'The good shepherd giveth his life for the sheep.',
      score: 0.9,
      createdAt: '2026-08-17T00:00:00.000Z',
    }];

    render(<MyWorksClient />);
    await screen.findByText('On John 10');
    fireEvent.change(screen.getByLabelText('Search your works'), { target: { value: 'grace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await screen.findByText(/good shepherd/i);
    // DISPLAY_LOCALE en-US, { day: 'numeric', month: 'long', year: 'numeric' } — the same
    // format the merged search surface's when() uses. Computed here through Intl (not copied
    // from the component) because toLocaleDateString renders in the MACHINE's timezone — a
    // hard-coded "August 17" is a different day east of Greenwich.
    const expected = new Date('2026-08-17T00:00:00.000Z').toLocaleDateString('en-US', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    // Twice: the hit row (D17's target) AND the document wall row both carry the date now.
    const dates = await screen.findAllByText(new RegExp(expected));
    expect(dates.length).toBeGreaterThanOrEqual(2);
  });
});

describe('reclaim — a stuck non-terminal document gets a Retry', () => {
  it('a document in `embedding` for >5 minutes says so and offers Retry', async () => {
    documents = [{
      id: 'doc-stuck',
      title: 'The long one',
      status: 'embedding',
      // First sight of an already-old in-flight row: stuck NOW, not five minutes from now.
      createdAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    }];

    render(<MyWorksClient />);
    await screen.findByText('The long one');
    await screen.findByText(/taking longer than expected/i);

    fireEvent.click(screen.getByRole('button', { name: /^Retry$/i }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toContain('doc-stuck');
  });

  it('a fresh in-flight document is NOT flagged', async () => {
    documents = [{
      id: 'doc-fresh',
      title: 'Just uploaded',
      status: 'embedding',
      createdAt: new Date().toISOString(),
    }];

    render(<MyWorksClient />);
    await screen.findByText('Just uploaded');
    expect(screen.queryByText(/taking longer than expected/i)).toBeNull();
  });

  it('the status wall is an aria-live region', async () => {
    documents = [{ id: 'doc-1', title: 'On John 10', status: 'ready', createdAt: '2026-08-17T00:00:00.000Z' }];
    const { container } = render(<MyWorksClient />);
    await screen.findByText('On John 10');
    const region = container.querySelector('[aria-live="polite"]');
    expect(region, 'the status wall needs aria-live so 2.5 s state transitions announce').toBeTruthy();
    expect(region!.textContent).toContain('On John 10');
  });
});
