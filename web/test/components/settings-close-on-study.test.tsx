// @vitest-environment jsdom
//
// A031 — THE READING-SETTINGS POPOVER AND THE VERSE-STUDY DIALOG COULD BOTH BE OPEN AT ONCE.
//
// Filed by the 2026-08-17 QA pass: open the Aa popover, open the study dialog, and the two
// overlap. Verified before fixing: `ReaderSettings` closes itself ONLY on an outside `mousedown`
// (reader-settings.tsx), so every path into the study dialog that fires no mousedown leaves the
// popover standing under the scrim — Enter/Space on a verse handle (the keyboard path this file
// drives), the `#v16:study` deep link, and `?firstrun=1`. A mouse click happens to self-heal via
// the outside-click listener, which is why the defect looks intermittent.
//
// The fix is the invariant the reader page already keeps for the popover's sibling: the selection
// popover cannot co-render with the study drawer (verse-display.tsx, `pending && selectedVerse ===
// null`). Same property here, by the only route available — the page owns `study`, the popover
// owns `open`, so the page THREADS the fact that a dialog is open (page -> ReaderHeader ->
// ReaderSettings) and the popover closes itself when that flips true.
//
// This file drives the SHIPPED READER PAGE, not ReaderSettings alone, because the property most
// likely to rot is the wiring: a `dialogOpen` prop nobody passes is green forever in a unit test.
// Harness (route mocks, chapter fetch stub) is study-panel-verse-sequence.test.tsx's.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeRef = vi.hoisted(() => ({
  params: { book: 'jhn', chapter: '1' } as Record<string, string>,
}));
vi.mock('next/navigation', () => ({
  useParams: () => routeRef.params,
  usePathname: () => '/read/jhn/1',
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));
vi.mock('@/lib/auth/client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

import ReaderPage from '@/app/read/[book]/[chapter]/page';

const BOOK_FILE = {
  translation: 'web',
  book: 43,
  slug: 'jhn',
  chapters: {
    '1': [
      { verse: 1, text: 'In the beginning was the Word.' },
      { verse: 2, text: 'The same was in the beginning with God.' },
    ],
  },
};

beforeEach(() => {
  routeRef.params = { book: 'jhn', chapter: '1' };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/bible/web/jhn.json')
        ? new Response(JSON.stringify(BOOK_FILE), { status: 200 })
        : // Commentary / original-language / annotations are not what these legs are about; 404
          // sends the real code down its own "no data" branches.
          new Response('', { status: 404 }),
    ),
  );
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Opens the Aa popover and returns once its content is visible. */
async function openSettings(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Aa' }));
  expect(screen.getByText('Text size')).toBeTruthy();
}

describe('A031 — opening the study dialog closes the reading-settings popover', () => {
  it('closes on the keyboard path, which fires no mousedown', async () => {
    // SEED (red-proof): before the fix this is the reported overlap exactly — the popover's only
    // exit is an outside mousedown, and Enter on a verse handle dispatches none, so both surfaces
    // end up open and the queryByText below finds the popover still standing -> RED.
    render(<ReaderPage />);
    await openSettings();

    const handle = await screen.findByRole('button', { name: 'Verse 2, read commentary' });
    fireEvent.keyDown(handle, { key: 'Enter' });

    expect(screen.getByRole('dialog')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Text size')).toBeNull());
  });

  it('does not reopen when the dialog closes, and Aa still works afterwards', async () => {
    // "Do not break either control individually": the close must be one-way (no popover popping
    // back up when the sheet is dismissed) and must not wedge the toggle shut.
    render(<ReaderPage />);
    await openSettings();
    const handle = await screen.findByRole('button', { name: 'Verse 2, read commentary' });
    fireEvent.keyDown(handle, { key: 'Enter' });
    await waitFor(() => expect(screen.queryByText('Text size')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('Text size')).toBeNull();

    await openSettings(); // asserts the popover content internally
  });

  it('the popover still closes on an outside mousedown, as before', async () => {
    // The pre-existing exit is not traded away for the new one.
    render(<ReaderPage />);
    await openSettings();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByText('Text size')).toBeNull());
  });
});
