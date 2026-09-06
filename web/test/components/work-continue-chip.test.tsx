// @vitest-environment jsdom
//
// THE CONTINUE CHIP AFTER A CLIENT-SIDE DEEP LINK.
//
// This is the test that would have caught the regression introduced in 18277776 (the F-088/F-155
// fix pass): that commit migrated the page's `landing` state from a frozen `useState(() => …)`
// to a post-mount-re-resolved value (hashchange + setTimeout(onHashChange, 0)) so a client-side
// `next/link` navigation — which sets the URL hash AFTER the new page mounts — would land the
// reader at the deep-linked section. But it re-wired only half of the paired contract: `setSeek`
// now re-fires on the post-mount `landing` change, while the Continue chip's `continueTarget`
// stayed frozen in its `useState` initializer. The initializer reads the hash at FIRST render,
// which on a client-side nav is still empty, so `continueTarget` froze at `null` and the chip
// silently never appeared for every in-app deep link that arrives after mount.
//
// So this mounts the real page (the chip is the page's own JSX), seeds a saved position in
// localStorage, then drives the exact post-mount hash arrival the page's listener exists to
// catch, and demands the chip actually renders — labelled with the saved section's unit and
// offering the jump back. The mocks are the reader's DATA SOURCES (the work fetch, the
// session, the WorkReader/WorkToc DOM machinery), never the thing under test: the page's own
// effects, refs and continueTarget logic all run for real.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SLUG = 'qa-continue-work';

// The session. The chip is independent of auth, but the page pulls `useSignedIn`, so the mock
// must return a stable boolean (the default true keeps the account-sync effect quiet).
let signedIn = true;
vi.mock('@/lib/auth/use-signed-in', () => ({ useSignedIn: () => signedIn }));
vi.mock('next/navigation', () => ({ useParams: () => ({ slug: SLUG }) }));

// WorkReader is IntersectionObserver/rAF/scroll machinery jsdom cannot drive. Standing in for
// it with a prop-capturing noop keeps the test about the wiring under test — the page's chip
// logic — rather than jsdom scroll. `onProgress` is captured and called directly, which is
// exactly what the real component does from `updateActive`. `seek` and `landingOrdinal` are
// captured so the click test can assert the chip's onClick seeks back to the saved ordinal.
type SeekLike = { ordinal: number; scrollPct: number; nonce: number } | null;
let report: ((ordinal: number, scrollPct: number) => void) | null = null;
let lastSeek: SeekLike = null;
let lastLandingOrdinal: number | null = null;
vi.mock('@/components/work-reader', () => ({
  WorkReader: (props: {
    onProgress: (ordinal: number, scrollPct: number) => void;
    seek: SeekLike;
    landingOrdinal: number | null;
  }) => {
    report = props.onProgress;
    lastSeek = props.seek;
    lastLandingOrdinal = props.landingOrdinal;
    return null;
  },
}));
vi.mock('@/components/work-toc', () => ({ WorkToc: () => null }));

import WorkPage from '@/app/work/[slug]/page';

const TOC = [
  {
    unitOrdinal: 1,
    firstId: 1,
    firstOrdinal: 1,
    lastOrdinal: 100,
    sectionCount: 100,
    heading: 'One',
    verseStart: null,
    verseEnd: null,
  },
];
const WORK = {
  source: {
    slug: SLUG,
    title: 'A work',
    author: 'QA',
    tradition: 'qa',
    era: 'qa',
    license: 'Public Domain',
    source_type: 'sermon',
  },
  toc: TOC,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  signedIn = true;
  report = null;
  lastSeek = null;
  lastLandingOrdinal = null;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  fetchMock = vi.fn(async (url: string) =>
    String(url).includes('/progress')
      ? new Response(JSON.stringify({ ok: true }), { status: 200 })
      : new Response(JSON.stringify(WORK), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  // The hash persists across tests in a single jsdom; reset to a clean URL with NO hash so each
  // case controls its own landing state from a known empty-hash baseline.
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

const SAVED_ORDINAL = 20;
const DEEP_ORDINAL = 50;

/** Seed a saved position at SAVED_ORDINAL inside the single TOC unit (1..100). */
function seedSaved(ordinal: number = SAVED_ORDINAL, scrollPct = 0.25): void {
  window.localStorage.setItem(
    `work-progress:${SLUG}`,
    JSON.stringify({ slug: SLUG, ordinal, scrollPct, savedAt: 0 }),
  );
}

/** Mount the page and wait until the work fetch has resolved and the reader is reporting. */
async function mountReader() {
  const view = render(<WorkPage />);
  await waitFor(() => expect(report).not.toBeNull());
  // Flush the page's mount-time `setTimeout(onHashChange, 0)` (the re-check the page added for
  // client-side nav timing) so the baseline landing has settled before the test drives a change.
  await act(async () => {
    vi.advanceTimersByTime(0);
  });
  return view;
}

/** Simulate the URL hash arriving AFTER mount — the exact `next/link` client-side-nav timing. */
async function arriveAtDeepLink(ordinal: number): Promise<void> {
  await act(async () => {
    window.history.replaceState(null, '', `#s${ordinal}`);
    window.dispatchEvent(new Event('hashchange'));
    vi.advanceTimersByTime(0);
  });
}

/** Drive the rendered reader to report its current section, the way the real component does. */
async function reportAt(ordinal: number, scrollPct = 0): Promise<void> {
  await act(async () => {
    report!(ordinal, scrollPct);
  });
}

describe('Continue chip across an in-app deep link', () => {
  it('appears when a late-arriving deep link lands the reader away from the saved position', async () => {
    seedSaved(SAVED_ORDINAL);
    await mountReader();
    await arriveAtDeepLink(DEEP_ORDINAL);
    await reportAt(DEEP_ORDINAL);

    // The chip is the page's own button; with WorkReader/WorkToc mocked to null it is the only
    // button in the document. Its label is the unit that HOLDS the saved ordinal (the single TOC
    // unit covers 1..100, labelled "One"), so the documented "jump back to where you left off"
    // affordance reads "Continue One".
    const chip = screen.getByRole('button', { name: /Continue/i });
    expect(chip.textContent).toContain('Continue');
    expect(chip.textContent).toContain('One');
    // The landing-glow ordinal is the DEEP-LINKED section, not the saved one.
    expect(lastLandingOrdinal).toBe(DEEP_ORDINAL);
  });

  it('seeks back to the saved ordinal on click and stays dismissed while the reader reads on', async () => {
    seedSaved(SAVED_ORDINAL);
    await mountReader();
    await arriveAtDeepLink(DEEP_ORDINAL);
    await reportAt(DEEP_ORDINAL);
    const chip = screen.getByRole('button', { name: /Continue/i });

    await act(async () => {
      fireEvent.click(chip);
    });

    // The chip is dismissed immediately…
    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull();
    // …and the reader was told to seek the SAVED ordinal (20), not the deep-linked one (50).
    expect(lastSeek?.ordinal).toBe(SAVED_ORDINAL);

    // Scrolling the saved section reports ordinals 20→21 the way the real reader does. The chip
    // must NOT reappear: `landing` cannot change during reading (replaceState fires no
    // hashchange) so the `[landing]` effect does not re-run, and even if it did, the render guard
    // `progress?.ordinal !== continueTarget.ordinal` would mask it (the reader is now AT 20).
    await reportAt(SAVED_ORDINAL);
    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull();
    await reportAt(SAVED_ORDINAL + 1);
    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull();
  });

  it('still appears on a full-page-load deep link (hash present at mount) — no regression', async () => {
    seedSaved(SAVED_ORDINAL);
    // A shared link: the hash is already set BEFORE the page mounts, so the initializer reads it.
    window.history.replaceState(null, '', `#s${DEEP_ORDINAL}`);
    await mountReader();
    await reportAt(DEEP_ORDINAL);

    const chip = screen.getByRole('button', { name: /Continue/i });
    expect(chip.textContent).toContain('Continue');
    expect(chip.textContent).toContain('One');
    expect(lastLandingOrdinal).toBe(DEEP_ORDINAL);
  });

  it('does not appear when there is no saved position (first-time reader)', async () => {
    // No seed — loadWorkProgress returns null; there is nothing to continue TO.
    await mountReader();
    await arriveAtDeepLink(DEEP_ORDINAL);
    await reportAt(DEEP_ORDINAL);

    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull();
  });

  it('does not appear on a plain auto-restore (no deep link, only a saved position)', async () => {
    seedSaved(SAVED_ORDINAL);
    await mountReader();
    // No late hash: the reader resumes at the saved ordinal. After an auto-restore there is
    // nothing to continue TO, so the page's own contract says the chip must stay away.
    await reportAt(SAVED_ORDINAL);

    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull();
  });

  it('does not appear when the deep link lands on the saved section itself', async () => {
    seedSaved(SAVED_ORDINAL);
    await mountReader();
    // The Library hub "Continue reading" row deep-links to the saved ordinal by construction;
    // the chip is correctly absent because saved.ordinal === landing.ordinal.
    await arriveAtDeepLink(SAVED_ORDINAL);
    await reportAt(SAVED_ORDINAL);

    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull();
  });
});
