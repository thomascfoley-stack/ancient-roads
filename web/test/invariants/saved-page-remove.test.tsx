// @vitest-environment jsdom

// THE ONE PAGE THAT SHOWS EVERYTHING YOU SAVED COULD NOT UNSAVE ANY OF IT.
//
// /library/notes lists every note, highlight and bookmark the reader owns, and every row was a
// bare <Link>. A verse highlighted by a mis-tap, a bookmark dropped on the wrong chapter, a note
// written twice — all of it permanent from the surface built to show it. The reader's only exit
// was to navigate back into the chapter and find the verse again, which is the same
// "the affordance exists somewhere else" bug the sidebar's research-history delete was filed for.
//
// The remove is a TWO-STEP ARM, copied from the research-history rows in components/sidebar.tsx
// (~line 860): first tap arms the row, second tap removes it. Always visible, never hover-only —
// this repo has already shipped an affordance that existed on a pointer and not on touch (UX-2).
//
// Asserted against the REAL page component with a mocked `fetch`, never a stand-in, so the test
// drives the shipped request shape (`/api/annotations` DELETE requires a JSON content type —
// api/annotations/route.ts calls requireJsonContentType, so a body without the header is a 415
// and the row would come back for a reason no assertion here would have caught).

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyLibraryPage from '@/app/library/notes/page';

const JOHN_3_16 = 43_003_016; // "John 3:16"
const PSALM_23_1 = 19_023_001; // "Psalms 23:1"
const JOHN_1_1 = 43_001_001; // "John 1:1"

const NOTE = { id: 'note-1', verse_id: JOHN_3_16, body: 'God so loved.', updated_at: '2026-01-02T00:00:00.000Z' };
const HIGHLIGHT = { id: 'hl-1', verse_id: PSALM_23_1, color: 'yellow' };
const BOOKMARK = { id: 'bm-1', verse_id: JOHN_1_1, label: null };

interface RecordedCall {
  url: string;
  method: string;
  headers?: HeadersInit;
  body?: { kind?: string; id?: string; verseId?: number };
}

/** The page's own /api/annotations/all GET, plus a DELETE whose outcome the test chooses. */
function stubFetch(opts: { deleteOk?: boolean } = {}) {
  const { deleteOk = true } = opts;
  const calls: RecordedCall[] = [];
  const mock = vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as RecordedCall['body']) : undefined;
    calls.push({ url, method, headers: init?.headers, body });
    if (method === 'GET') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ notes: [NOTE], highlights: [HIGHLIGHT], bookmarks: [BOOKMARK] }),
      } as Response);
    }
    return Promise.resolve({
      ok: deleteOk,
      status: deleteOk ? 200 : 500,
      json: () => Promise.resolve({}),
    } as Response);
  });
  vi.stubGlobal('fetch', mock);
  return { calls };
}

/** Mounts the page and flushes its load effect. */
async function renderLoaded() {
  const view = render(<MyLibraryPage />);
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
  return view;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('/library/notes — every saved row can be removed', () => {
  it('gives each note, highlight and bookmark its own remove control, labelled with WHICH item', async () => {
    stubFetch();
    await renderLoaded();

    // A screen-reader user hears which item each button removes — three buttons, three subjects.
    expect(screen.getByRole('button', { name: 'Remove note on John 3:16' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove highlight on Psalms 23:1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove bookmark on John 1:1' })).toBeTruthy();
  });

  it('is a two-step arm: the first tap sends nothing and relabels to a confirm', async () => {
    const { calls } = stubFetch();
    await renderLoaded();

    const remove = screen.getByRole('button', { name: 'Remove note on John 3:16' });
    await act(async () => {
      remove.click();
    });

    // Nothing left the browser on the arming tap.
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
    // ...and the button now says what a second tap will do.
    expect(screen.getByRole('button', { name: 'Confirm remove: note on John 3:16' })).toBeTruthy();
    // The row is still on screen; arming is not removing.
    expect(screen.getByText('God so loved.')).toBeTruthy();
  });

  it('the second tap DELETEs through the shipped annotations route, with its JSON content type', async () => {
    const { calls } = stubFetch();
    await renderLoaded();

    const arm = screen.getByRole('button', { name: 'Remove note on John 3:16' });
    await act(async () => {
      arm.click();
    });
    const confirm = screen.getByRole('button', { name: 'Confirm remove: note on John 3:16' });
    await act(async () => {
      confirm.click();
    });

    const deletes = calls.filter((c) => c.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0]!.url).toBe('/api/annotations');
    expect(deletes[0]!.body).toEqual({ kind: 'note', verseId: JOHN_3_16 });
    // requireJsonContentType() in api/annotations/route.ts refuses a DELETE without this.
    expect(new Headers(deletes[0]!.headers).get('content-type')).toBe('application/json');

    await waitFor(() => expect(screen.queryByText('God so loved.')).toBeNull());
  });

  it('removes a highlight by its span id, not by clearing the whole verse', async () => {
    const { calls } = stubFetch();
    await renderLoaded();

    await act(async () => {
      screen.getByRole('button', { name: 'Remove highlight on Psalms 23:1' }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Confirm remove: highlight on Psalms 23:1' }).click();
    });

    const deletes = calls.filter((c) => c.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    // removeHighlightById vs removeHighlight: a verse can carry several sub-verse spans, and
    // this page lists them one row each. Deleting by verseId would take the neighbours too.
    expect(deletes[0]!.body).toEqual({ kind: 'highlight', id: 'hl-1' });
  });

  it('a failed remove says so and puts the row back — never a silent revert', async () => {
    stubFetch({ deleteOk: false });
    await renderLoaded();

    await act(async () => {
      screen.getByRole('button', { name: 'Remove note on John 3:16' }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Confirm remove: note on John 3:16' }).click();
    });

    // The row is back...
    await waitFor(() => expect(screen.getByText('God so loved.')).toBeTruthy());
    // ...and the reader is TOLD, in a live region, rather than watching it silently reappear.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent ?? '').toMatch(/could not be removed/i);
  });

  it('the remove control clears the 44px tap-target floor', async () => {
    stubFetch();
    await renderLoaded();

    for (const name of [
      'Remove note on John 3:16',
      'Remove highlight on Psalms 23:1',
      'Remove bookmark on John 1:1',
    ]) {
      const cls = screen.getByRole('button', { name }).className;
      expect(cls, `${name} must be at least 44px tall`).toMatch(/min-h-\[44px\]/);
      expect(cls, `${name} must be at least 44px wide`).toMatch(/min-w-\[44px\]/);
    }
  });
});

describe('/library/notes — the loading state', () => {
  it('shows the skeleton idiom, not the literal word "Loading"', async () => {
    // Never resolves: the page stays in its loading state for the length of this assertion.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    render(<MyLibraryPage />);

    // The app has 25 hand-written "Loading…" strings; library/loading.tsx replaced this one's
    // neighbour with a shaped skeleton and an sr-only announcement. Same vocabulary here.
    expect(screen.queryByText(/Loading…/)).toBeNull();
    const busy = document.querySelector('[aria-busy]');
    expect(busy, 'the loading state must mark itself aria-busy').toBeTruthy();
    expect(busy!.querySelector('.animate-pulse'), 'skeleton, not a spinner').toBeTruthy();
    expect(document.body.textContent ?? '').toMatch(/Loading your saved/i);
  });
});
