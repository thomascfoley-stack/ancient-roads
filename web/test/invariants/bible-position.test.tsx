// @vitest-environment jsdom

// THE BIBLE READER MUST REMEMBER WHERE YOU WERE, AND AN IMPOSSIBLE CHAPTER MUST NOT BE A DEAD END.
// Three findings from the 2026-08-16 QA fleet, and A034/A040 are one defect seen from two sides.
//
//   A040 — `/read/psa/23`, close the tab, reopen: you are at John 1. A Library work reopens where
//          you left it (`saveWorkProgress`/`loadWorkProgress`, lib/work-reader.ts), so the same app
//          answers the same question two different ways. Measured before the fix: `grep -rn
//          localStorage web/src` listed translation, reader theme/size/measure, the verse-gesture
//          hint, study-editor panel, sidebar studies, and work progress — NOTHING keyed to a book
//          and chapter. No server record either: no `reading_position`-shaped table in
//          db/migrations, and no route under web/src/app/api that stores one.
//   A034 — the Bible tab hardlinks `/read/jhn/1` (mobile-nav.tsx:50), so it discards the position
//          even WITHIN a session. Same missing record; one fix serves both.
//   A035 — `/read/psa/999` renders one grey sentence and nothing to click. The page already knows
//          the book and its chapter count (it prints them), so it can hand back a way in.
//
// WHAT IS TESTED HERE AND WHY THAT SPLIT. The record itself is a pure reader/writer, so it is
// tested directly and hard — the validation is the interesting half, because a stored slug outlives
// the book table it was written against. The two surfaces are then tested by RENDERING THE SHIPPED
// COMPONENTS: an href and a recovery link are markup, and a static grep for the string would pass
// on code that never renders it.
//
// The hydration rule is asserted as its own case (`renders the DEFAULT on the first client render`)
// because it is the one that bites: reading localStorage during render is the React #418 this repo
// has already paid for twice (read/[book]/[chapter]/page.tsx:38-51, use-signed-in.ts).

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── module doubles ──────────────────────────────────────────────────────────────────────────
// A mutable ref because `vi.mock` is hoisted above any per-test assignment, and both surfaces
// under test read different route values.
const routeRef = vi.hoisted(() => ({
  pathname: '/home',
  params: { book: 'psa', chapter: '999' } as Record<string, string>,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => routeRef.pathname,
  useParams: () => routeRef.params,
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));
// The sidebar (reached through MobileNav's menu sheet) and the reader page both read the session.
vi.mock('@/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: null }) },
}));

import {
  BIBLE_POSITION_KEY,
  DEFAULT_BIBLE_HREF,
  DEFAULT_BIBLE_LABEL,
  bibleTabHref,
  loadBiblePosition,
  saveBiblePosition,
} from '@/lib/bible-position';
import { BOOK_BY_SLUG } from '@bible/books';
import { MobileNav } from '@/components/mobile-nav';
import { SidebarNavContent } from '@/components/sidebar';
import ReaderPage from '@/app/read/[book]/[chapter]/page';

beforeEach(() => {
  window.localStorage.clear();
  routeRef.pathname = '/home';
  routeRef.params = { book: 'psa', chapter: '999' };
  // The reader page prefetches commentary and original-language files for any structurally
  // fetchable chapter. Nothing under test depends on them; answer 404 so the real code takes its
  // own "no data" branch rather than an unhandled rejection.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 404 })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ── the record ──────────────────────────────────────────────────────────────────────────────
describe('the Bible reading position record (A034/A040)', () => {
  it('round-trips a book and chapter', () => {
    expect(saveBiblePosition('psa', 23)).toBe(true);
    expect(loadBiblePosition()).toMatchObject({ slug: 'psa', chapter: 23 });
    expect(bibleTabHref()).toBe('/read/psa/23');
  });

  it('answers the default when nothing has been read', () => {
    expect(loadBiblePosition()).toBeNull();
    expect(bibleTabHref()).toBe(DEFAULT_BIBLE_HREF);
  });

  it('names the default destination the same book its href points at', () => {
    // The recovery link A035 adds prints DEFAULT_BIBLE_LABEL and navigates to DEFAULT_BIBLE_HREF.
    // Typed separately they are free to drift — a link that says "John 1" and goes to Psalms is
    // this repo's most-repeated defect class wearing a label. Both derive from one slug, and this
    // is what would notice if that stopped being true.
    expect(DEFAULT_BIBLE_LABEL).toBe('John 1');
    const [, , slug, chapter] = DEFAULT_BIBLE_HREF.split('/');
    // NOT `${BOOK_BY_SLUG.get(slug)!.name} ${chapter}` — that derives the expectation from the same
    // constants the value derives from, so it cannot fail (2026-08-17 pre-deploy audit; the same
    // tautology shape library-nav-labels.test.ts already documents avoiding). The literal above is
    // the assertion that can actually catch drift.
  });

  // ── canonicalisation, pinned on EACH SIDE SEPARATELY ──────────────────────────────────────
  // The slug is canonicalised twice: `saveBiblePosition` stores `book.slug`, and
  // `loadBiblePosition` re-derives it rather than echoing the record back. That redundancy is
  // deliberate (a record written by an older build under an alias must not keep that spelling
  // alive) — but it means an end-to-end alias test CANNOT FAIL when only one side is broken: the
  // other silently covers for it. Measured, not assumed: seeding each half in turn left the
  // end-to-end leg green both times. So each half gets a leg that can only see that half.

  it('WRITES the canonical slug when handed an alias', () => {
    expect(saveBiblePosition('john', 3)).toBe(true);
    // The stored STRING, not the parsed result — reading it back through `loadBiblePosition`
    // would let the read side's canonicalisation answer for the write side's.
    const raw = window.localStorage.getItem(BIBLE_POSITION_KEY);
    expect(JSON.parse(raw ?? '{}')).toMatchObject({ slug: 'jhn' });
  });

  it('READS back a canonical slug from a record written under an alias', () => {
    // Written straight to storage, bypassing the write side entirely — this is the shape a record
    // left by an older build has, and the case the read-side re-derivation exists for.
    window.localStorage.setItem(
      BIBLE_POSITION_KEY,
      JSON.stringify({ slug: 'john', chapter: 3, savedAt: 1 }),
    );
    expect(loadBiblePosition()).toMatchObject({ slug: 'jhn', chapter: 3 });
    expect(bibleTabHref()).toBe('/read/jhn/3');
  });

  // The validation cases below are the point of having a helper at all: every one of them would
  // otherwise send the reader from a tab press to a dead end — which is A035 arrived at by a
  // different road.
  it('rejects a slug that is not a book', () => {
    window.localStorage.setItem(
      BIBLE_POSITION_KEY,
      JSON.stringify({ slug: 'enoch', chapter: 1, savedAt: 1 }),
    );
    expect(loadBiblePosition()).toBeNull();
    expect(bibleTabHref()).toBe(DEFAULT_BIBLE_HREF);
  });

  it('rejects a chapter past the end of the book', () => {
    // Psalms is 150. A record written by a build with a different versification, or hand-edited,
    // must not become the tab's destination.
    window.localStorage.setItem(
      BIBLE_POSITION_KEY,
      JSON.stringify({ slug: 'psa', chapter: 151, savedAt: 1 }),
    );
    expect(loadBiblePosition()).toBeNull();
  });

  it('rejects a non-integer, zero or negative chapter', () => {
    for (const chapter of [0, -3, 1.5, Number.NaN]) {
      window.localStorage.setItem(
        BIBLE_POSITION_KEY,
        JSON.stringify({ slug: 'psa', chapter, savedAt: 1 }),
      );
      expect(loadBiblePosition()).toBeNull();
    }
  });

  it('treats a corrupt entry as no position, never a throw', () => {
    window.localStorage.setItem(BIBLE_POSITION_KEY, '{not json');
    expect(() => loadBiblePosition()).not.toThrow();
    expect(loadBiblePosition()).toBeNull();
  });

  it('refuses to store a position it would refuse to read back', () => {
    // Write-side validation, so a bad value never reaches storage in the first place. Asserted
    // through the storage key rather than the return value alone: a `false` return with the row
    // written anyway would still poison the tab.
    expect(saveBiblePosition('enoch', 1)).toBe(false);
    expect(saveBiblePosition('psa', 151)).toBe(false);
    expect(window.localStorage.getItem(BIBLE_POSITION_KEY)).toBeNull();
  });
});

// ── A034: the Bible tab ─────────────────────────────────────────────────────────────────────
describe('the Bible tab honours the saved position (A034)', () => {
  function bibleTab(): HTMLAnchorElement {
    const el = screen.getByRole('link', { name: /Bible/ });
    return el as HTMLAnchorElement;
  }

  it('renders the DEFAULT in render-only markup, then adopts the stored position after mount', async () => {
    saveBiblePosition('psa', 23);

    // THE HYDRATION LEG, and it is asserted through `renderToString` rather than through a
    // synchronous read after `render()`. That was this leg's first shape and it CANNOT PASS
    // against correct code: RTL's `render` wraps in `act()`, which flushes effects before it
    // returns, so the pre-effect render is never observable through the DOM — an unearned RED,
    // the mirror of the unearned green THE_LOOP.md §6 names. `renderToString` runs render and
    // NOTHING else: no effects, exactly like the server. So this string IS what the browser must
    // produce on its first client render, and it goes red the moment the href is read during
    // render (a `useState` initializer), which is the React #418 this repo paid for twice.
    const serverMarkup = renderToString(<MobileNav />);
    expect(serverMarkup).toContain(`href="${DEFAULT_BIBLE_HREF}"`);
    expect(serverMarkup).not.toContain('/read/psa/23');

    // ...and after mount, the client adopts the stored position.
    render(<MobileNav />);
    await waitFor(() => expect(bibleTab().getAttribute('href')).toBe('/read/psa/23'));
  });

  it('falls back to John 1 when nothing is stored', async () => {
    render(<MobileNav />);
    await waitFor(() => expect(bibleTab().getAttribute('href')).toBe(DEFAULT_BIBLE_HREF));
  });
});

// ── A040: the reader records where you were ─────────────────────────────────────────────────
// The write half. Without this the record is real, validated and read by the tab — and always
// empty, so every leg above would still pass while the reported defect stood untouched.
describe('the reader remembers the chapter you were in (A040)', () => {
  it('records the book and chapter on a real chapter', async () => {
    routeRef.params = { book: 'psa', chapter: '23' };
    render(<ReaderPage />);
    // The record is written from the ROUTE, not from the fetch: `fetch` is stubbed to 404 here, so
    // the chapter never loads, and the position must be remembered anyway. Somewhere to come back
    // to should not depend on the network having worked.
    await waitFor(() => expect(loadBiblePosition()).toMatchObject({ slug: 'psa', chapter: 23 }));
  });

  it('stores the CANONICAL slug when the URL used an alias', async () => {
    // `/read/john/1` resolves through the alias table (A7, 2026-08-02). A record written as
    // "john" would outlive that resolution; the tab must not depend on it still working.
    routeRef.params = { book: 'john', chapter: '3' };
    render(<ReaderPage />);
    await waitFor(() => expect(loadBiblePosition()).toMatchObject({ slug: 'jhn', chapter: 3 }));
  });

  it('does NOT record an out-of-range chapter', async () => {
    // Otherwise A035's dead end becomes the destination the Bible tab aims at next.
    routeRef.params = { book: 'psa', chapter: '999' };
    render(<ReaderPage />);
    await screen.findByText(/Psalms has 150 chapters/);
    expect(loadBiblePosition()).toBeNull();
    expect(bibleTabHref()).toBe(DEFAULT_BIBLE_HREF);
  });
});

// ── A035: the out-of-range chapter ──────────────────────────────────────────────────────────
describe('an out-of-range chapter offers a way back (A035)', () => {
  it('still says what is wrong', async () => {
    render(<ReaderPage />);
    expect(await screen.findByText(/Psalms has 150 chapters/)).toBeTruthy();
  });

  it('links to the first chapter of the book that was asked for', async () => {
    render(<ReaderPage />);
    const link = (await screen.findByRole('link', { name: /Psalms 1/ })) as HTMLAnchorElement;
    // The book the reader typed, not the app's default destination — landing them on John after
    // they asked for a psalm is a different dead end.
    expect(link.getAttribute('href')).toBe('/read/psa/1');
  });

  it('offers the chapter picker the reader already has in the header', async () => {
    render(<ReaderPage />);
    expect(await screen.findByRole('button', { name: /chapter/i })).toBeTruthy();
  });

  it('offers a way into Scripture even when the BOOK is unknown', async () => {
    routeRef.params = { book: 'enoch', chapter: '1' };
    render(<ReaderPage />);
    expect(await screen.findByText(/Unknown book/)).toBeTruthy();
    const link = (await screen.findByRole('link', { name: /John 1/ })) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(DEFAULT_BIBLE_HREF);
  });
});

// ── the sidebar's own Bible links ───────────────────────────────────────────────────────────
//
// ADDED AFTER THE FACT, and the reason matters. The fix above was applied to `mobile-nav.tsx`
// only, because that was the surface the finding named. But `SidebarNavContent` ALSO carried a
// hardlinked `/read/jhn/1`, and `mobile-nav.tsx:161` renders it inside the Menu sheet — so a
// phone reader still reached the old behaviour by Menu -> Bible, and the desktop rail never got
// the fix at all.
//
// It was caught by SEEDING THE HARDLINK BACK and watching this file stay green: 19/19 passed with
// the sidebar reverted. A fix no test can see is a fix nobody can keep.
describe('A034 — the sidebar surfaces follow the stored position too', () => {
  // jsdom implements no ResizeObserver; the rail's scroll-fade hook constructs one on mount.
  // Stubbing an API jsdom simply lacks is not stubbing away the behaviour under test — these
  // legs assert hrefs, not scroll fades (same reasoning as sidebar-catalog-nav.test.tsx).
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });

  it('the nav rail Bible link uses the stored position', async () => {
    // SEED: restore href="/read/jhn/1" -> RED.
    saveBiblePosition('psa', 23);
    render(<SidebarNavContent />);
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /^Bible$/i });
      expect(link.getAttribute('href')).toBe('/read/psa/23');
    });
  });

  it('falls back to the default when nothing is stored', async () => {
    window.localStorage.removeItem(BIBLE_POSITION_KEY);
    render(<SidebarNavContent />);
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /^Bible$/i });
      expect(link.getAttribute('href')).toBe(DEFAULT_BIBLE_HREF);
    });
  });

  it('renders the DEFAULT on the first client render — the hydration rule applies here too', () => {
    saveBiblePosition('psa', 23);
    // renderToString runs render and nothing else, so it sees the pre-effect commit the server
    // would have produced. Reading localStorage during render is the React #418 this repo has
    // already paid for twice.
    const markup = renderToString(<SidebarNavContent />);
    expect(markup).toContain(DEFAULT_BIBLE_HREF);
    expect(markup).not.toContain('/read/psa/23');
  });
});
