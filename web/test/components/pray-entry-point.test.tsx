// @vitest-environment jsdom
//
// PR1a — THE PRAY ENTRY POINT, AND THE SIGNED-OUT JOURNAL.
//
// Two rendered checks that the browser pass on this machine cannot make. Local sign-in needs Neon
// Auth credentials that are not in this working tree, so a signed-in browser walk is NOT RUN here
// and is recorded as such — these tests cover the two states that walk would have exercised, at
// the level a jsdom render honestly can.
//
// 1. THE PRAY ACTION IS GATED ON BEING SIGNED IN. It links to the prayer space carrying the verse.
//    A signed-out reader must not be offered it, because the POST behind it would 401.
// 2. THE SIGNED-OUT JOURNAL IS AN INVITATION, NOT AN ALARM. The first browser pass showed a
//    signed-out visitor a red "Your prayers could not be loaded" beside a permanent "Loading…" —
//    the app reporting its own auth state as a fault, on the page where that is least fitting.
//    `load()` treats 401 as a state, not a failure. This is the regression guard on that fix.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudyPanel } from '../../src/components/study-panel';
import { PrayerJournal } from '../../src/components/prayer-journal';
import { encodeVerseId } from '../../src/bible/verse-id';

const VERSE_ID = encodeVerseId({ book: 43, chapter: 1, verse: 14 }); // John 1:14

vi.mock('../../src/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: null }) },
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const annotation = (signedIn: boolean) => ({
  color: null,
  note: '',
  signedIn,
  onSetHighlight: () => {},
  onClearHighlight: () => {},
  onSaveNote: () => {},
});

const panelProps = {
  reference: 'John 1:14',
  verseNum: 14,
  verseText: 'And the Word was made flesh...',
  entries: [],
  originalWords: null,
  lang: null,
  // DERIVED, not typed. A hand-typed id here would keep passing after the encoding changed, and
  // the test would then be asserting a number the product no longer produces.
  verseId: VERSE_ID,
  onClose: () => {},
};

describe('PR1a — the Pray entry point', () => {
  it('offers Pray over this verse to a signed-in reader, carrying the verse', () => {
    render(<StudyPanel {...panelProps} annotation={annotation(true)} />);
    const link = screen.getByRole('link', { name: /pray over this verse/i });
    // SEED: drop `?verse=${verseId}` from the href -> RED. The prayer space would open blank and
    // the reader would have to remember which verse sent them there.
    expect(link.getAttribute('href')).toBe(`/prayers?verse=${VERSE_ID}`);
  });

  it('does NOT offer it to a signed-out reader', () => {
    // SEED: remove the `annotation.signedIn &&` guard -> RED. The link would render, and the
    // prayer space behind it 401s — an entry point into a door that does not open.
    render(<StudyPanel {...panelProps} annotation={annotation(false)} />);
    expect(screen.queryByRole('link', { name: /pray over this verse/i })).toBeNull();
  });

  it('does not offer it when there is no verse id to carry', () => {
    render(<StudyPanel {...panelProps} verseId={undefined} annotation={annotation(true)} />);
    expect(screen.queryByRole('link', { name: /pray over this verse/i })).toBeNull();
  });
});

describe('PR1a — the signed-out journal is an invitation, not an alarm', () => {
  it('shows a sign-in invitation and NEITHER an error NOR a stuck spinner on 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    render(<PrayerJournal />);

    await waitFor(() => expect(screen.getByRole('link', { name: /sign in to keep a prayer journal/i })).toBeTruthy());
    // SEED: revert `load()` to the single `!res.ok` branch -> RED on both. That is exactly the
    // state the first browser pass photographed.
    expect(screen.queryByRole('alert'), 'a signed-out reader was shown an error').toBeNull();
    expect(screen.queryByText(/Loading…/), 'the spinner never resolved').toBeNull();
  });

  it('still reports a REAL failure as an error', async () => {
    // The fix must not swallow genuine failures into the friendly path. 500 is still an error.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    render(<PrayerJournal />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.queryByRole('link', { name: /sign in to keep a prayer journal/i })).toBeNull();
  });
});
