// @vitest-environment jsdom
//
// N3 — THE READER ACTUALLY CALLS THE SHELF ROUTE.
//
// Same argument as the N1 sync test next door: `setShelf` was always correct, `library_items` had
// a table and an RLS policy and passing tenancy tests, and every one of those checks was green for
// the entire life of the defect — because the missing thing was a CALLER. The round-trip test
// (`test/invariants/library-shelf-round-trip.test.ts`) proves the server half and would ALSO have
// stayed green with nothing on the client calling it.
//
// So this drives the real header component and demands that a request leaves for the real route.

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/reader-settings', () => ({ ReaderSettings: () => null }));

import { WorkHeader } from '@/components/work-header';

const SLUG = 'qa-shelf-work';
const SOURCE = {
  slug: SLUG,
  title: 'A work',
  author: 'QA',
  tradition: 'qa',
  era: 'qa',
  license: 'Public Domain',
  source_type: 'sermon',
};

let fetchMock: ReturnType<typeof vi.fn>;
/** Shelf state the fake server reports on GET. */
let serverShelf: string | null = null;

function shelfCalls() {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes('/shelf'))
    .map(([url, init]) => ({ url: String(url), method: (init as RequestInit | undefined)?.method ?? 'GET' }));
}

beforeEach(() => {
  serverShelf = null;
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') return new Response(JSON.stringify({ shelf: serverShelf }), { status: 200 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderHeader = (signedIn: boolean) =>
  render(<WorkHeader source={SOURCE} slug={SLUG} signedIn={signedIn} onOpenToc={() => {}} />);

describe('N3 — the Book Reader can put a work on the reader’s shelf', () => {
  it('asks the shelf route what the state is, and offers Save', async () => {
    renderHeader(true);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy());
    expect(shelfCalls()[0]).toEqual({ url: `/api/work/${SLUG}/shelf`, method: 'GET' });
  });

  it('renders "Saved" for a work already on the shelf', async () => {
    serverShelf = 'saved';
    renderHeader(true);
    const btn = await waitFor(() => screen.getByRole('button', { name: 'Saved' }));
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  // THE WIRING. Without this, the route could exist and never be called — the exact defect.
  it('saving PUTs to the shelf route and flips the label', async () => {
    renderHeader(true);
    const btn = await waitFor(() => screen.getByRole('button', { name: 'Save' }));
    await act(async () => {
      btn.click();
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy());
    expect(shelfCalls().some((c) => c.method === 'PUT')).toBe(true);
  });

  it('un-saving DELETEs and flips back', async () => {
    serverShelf = 'saved';
    renderHeader(true);
    const btn = await waitFor(() => screen.getByRole('button', { name: 'Saved' }));
    await act(async () => {
      btn.click();
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy());
    expect(shelfCalls().some((c) => c.method === 'DELETE')).toBe(true);
  });

  // A signed-out reader is mid-page in a book; the route would 401 them anyway.
  it('shows nothing at all to a signed-out reader, and asks the route nothing', async () => {
    renderHeader(false);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Saved' })).toBeNull();
    expect(shelfCalls()).toHaveLength(0);
  });

  // The optimistic update must not survive a failed write, or the button lies about stored state.
  it('reverts the label when the write fails', async () => {
    renderHeader(true);
    const btn = await waitFor(() => screen.getByRole('button', { name: 'Save' }));
    fetchMock.mockImplementation(async (_u: string, init?: RequestInit) =>
      (init?.method ?? 'GET') === 'GET'
        ? new Response(JSON.stringify({ shelf: null }), { status: 200 })
        : new Response('nope', { status: 500 }),
    );
    await act(async () => {
      btn.click();
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy());
  });

  // A failed READ must not render a control that claims the work is unsaved when it may not be.
  it('renders no control when the state cannot be read', async () => {
    fetchMock.mockImplementation(async () => new Response('boom', { status: 500 }));
    renderHeader(true);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
  });
});
