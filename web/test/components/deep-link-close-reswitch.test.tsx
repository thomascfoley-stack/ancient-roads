// @vitest-environment jsdom
//
// K-6 — CLOSING A DEEP-LINKED STUDY PANEL MUST STRIP THE `#v<n>:study` HASH, AND A LATER
// TRANSLATION SWITCH MUST NOT RE-OPEN THE DISMISSED PANEL.
//
// Regression introduced by 48f00e69: that commit re-gated `openStudy`'s history push on
// `panelOpenRef.current` (initially `false`) instead of the `:study` hash. On a fresh deep-link
// arrival `panelOpenRef.current` is still `false`, so `openStudy` pushed `window.location.href`
// — which on a deep link CARRIES `#v<n>:study` — and flipped `pushedStudyEntry.current = true`.
// `closeStudy` therefore took its `history.back()` branch and landed on the original deep-link
// entry, whose URL still carries `#v<n>:study`. The hash-strip branch (the contract the
// `closeStudy` comment documents: "a later Back does not re-open a panel the reader has already
// dismissed") was never reached. The leftover hash then re-fired the hash effect on the next
// `data` change — a translation switch here — re-running `openStudy` and `el.scrollIntoView`,
// re-opened the dismissed panel and yanking the reader back to the verse. Exactly the behaviour
// the `openStudy` comment claims its same-URL push design prevents, just deferred to after the
// close. The fix skips the push on a `:study` deep link so `pushedStudyEntry` stays false and
// `closeStudy` reaches its hash-strip `replaceState`.
//
// WHAT THIS FILE CAN AND CANNOT PROVE. jsdom lays out nothing, so `scrollTop` stays 0 and the
// test cannot show the viewport moving in pixels; whether the page visibly scrolls is enforced
// by the browser's own `scrollIntoView`, not by this test. What the recording `scrollIntoView`
// spy DOES prove is that the mechanical yank code path executes on the deep-linked verse element
// after the switch — i.e. the call `el.scrollIntoView({ block: 'center' })` is reached with `el`
// being `[data-verse="2"]`. That is the strongest "yank" claim a jsdom test can make, and it is a
// call, not an inference. The URL-outcome root-cause assertion (`location.hash` after close) is
// spec-mandated, not a jsdom artifact: per HTML §7.4.1.1 each session history entry stores its own
// URL (fragment included), and `back()` restores it — two entries with the same URL are still
// distinct, so the pushed duplicate's pop lands on the original hash-carrying entry.
//
// Harness (route mocks, chapter fetch stub) is study-panel-verse-sequence.test.tsx's, matching
// the comment block in settings-close-on-study.test.tsx.

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

// The same chapter content is served for BOTH translations the switch visits. The bug is about
// history/panel re-open behaviour, not verse text; switching translation still re-runs the chapter
// fetch effect (translation is a dep), which sets a new `data` reference and re-fires the hash
// effect — the `data` change the bug report names as the re-trigger. Serving identical content
// keeps the assertion focused on that re-fire rather than on VerseDisplay swap details.
const BOOK_FILE = {
  translation: 'web',
  book: 43,
  slug: 'jhn',
  chapters: {
    '1': [
      { verse: 1, text: 'In the beginning was the Word.' },
      { verse: 2, text: 'The same was in the beginning with God.' },
      { verse: 3, text: 'All things were made by him.' },
    ],
  },
};

// jsdom does not implement `scrollIntoView` at all (verified: `typeof Element.prototype
// .scrollIntoView === 'undefined'`), so there is nothing to `vi.spyOn`. Install a recording
// no-op on `Element.prototype` directly and delete it in `afterEach` — the same shape the
// study-panel-verse-sequence harness uses for `document.elementsFromPoint`, which jsdom also
// does not implement. Each entry is the `data-verse` attribute of the element the method was
// called on: the hash effect calls `el.scrollIntoView({ block: 'center' })` where `el ===
// [data-verse="2"]` on the deep-link arrival, and a second entry after the switch is the yank
// the fix prevents.
type ScrollIntoViewHost = { scrollIntoView?: (this: Element, opts?: unknown) => void };
let scrollCalls: string[];

beforeEach(() => {
  routeRef.params = { book: 'jhn', chapter: '1' };
  // `handleTranslationChange` writes `localStorage['translation']`. Without a clear, a previous
  // test's switch would make a later render mount on that translation instead of WEB, silently
  // invalidating the "switch WEB -> KJV" premise.
  window.localStorage.clear();
  scrollCalls = [];
  (Element.prototype as unknown as ScrollIntoViewHost).scrollIntoView = function (
    this: Element,
  ): void {
    scrollCalls.push(this.getAttribute('data-verse') ?? '');
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      // Both `web` and `kjv` serve the same chapter shape — see BOOK_FILE's comment.
      if (url.endsWith('/bible/web/jhn.json') || url.endsWith('/bible/kjv/jhn.json')) {
        return new Response(JSON.stringify(BOOK_FILE), { status: 200 });
      }
      // Commentary / original-language / annotations are not what these legs are about; 404 sends
      // the real code down its own "no data" branches.
      return new Response('', { status: 404 });
    }),
  );
  // SEED: land on the deep link BEFORE render so the hash effect's first run sees it. The page's
  // own canonical-slug redirect does not fire (`jhn` is canonical), and nothing else rewrites the
  // URL during a `useState` transition, so the hash survives until `closeStudy` strips it.
  window.history.replaceState(null, '', '/read/jhn/1#v2:study');
});

afterEach(() => {
  delete (Element.prototype as unknown as ScrollIntoViewHost).scrollIntoView;
  cleanup();
  vi.unstubAllGlobals();
});

/** Wait for the deep-linked panel to auto-open, then click Close. The panel appears after the
 *  chapter fetch lands and the hash effect fires; closing drives either the `history.back()` path
 *  (buggy, `pushedStudyEntry.current === true`) or the hash-strip `replaceState` path (fixed). */
async function closeDeepLinkedPanel(): Promise<void> {
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

describe('K-6 deep-link → close → translation-switch', () => {
  it('root cause: closing a deep-linked panel leaves the :study hash in the URL', async () => {
    // SEED (red-proof): revert the `/:study$/` skip in `openStudy` -> the push branch fires on
    // deep-link arrival, `pushedStudyEntry.current` flips true, `closeStudy` calls `history.back()`
    // and pops to the original deep-link entry whose URL still carries `#v2:study` ->
    // `expect(window.location.hash).toBe('')` is RED.
    render(<ReaderPage />);
    await closeDeepLinkedPanel();
    expect(window.location.hash).toBe('');
  });

  it('consequence: switching translation after closing a deep-linked panel re-opens it', async () => {
    // SEED (red-proof): with the hash left in place by the buggy close, switching translation
    // re-runs the chapter fetch (translation dep) -> `data` is re-set -> the hash effect re-fires
    // -> `m` matches the leftover `#v2:study` -> `openStudy(2, 'commentaries')` re-opens the dialog
    // and `el.scrollIntoView` fires a SECOND time on `[data-verse="2"]`. The assertions below are
    // RED on the buggy code: `scrollCalls` is `['2', '2']` not `['2']`, and the dialog is non-null.
    render(<ReaderPage />);
    await closeDeepLinkedPanel();
    // The root-cause test above pins that the close stripped the hash. This test depends on that
    // as its precondition and asserts the CONSEQUENCE: with the hash gone, the translation
    // switch's `data` re-fire finds nothing for the hash effect to match, so the dismissed panel
    // stays dismissed. (On the buggy code the hash survives, the re-fire matches, and the
    // assertions below fail with the three signatures the bug report records.)

    // Switch translation WEB -> KJV via the header's version dropdown, exactly as the bug report
    // demonstrates. `onTranslationChange` is a `useState` setter, so the Next.js router is not on
    // this path; nothing in the framework rewrites the URL for the transition. The dropdown's
    // translation buttons each render `<span>{name}</span><span>{abbr}</span>`; the KJV NAME span
    // ("King James Version") is exact-matched, then its enclosing button is clicked — the only
    // other translation whose name contains "King James Version" is AKJV, whose name span's full
    // text is "American King James Version", so an exact `getByText` rules it out.
    fireEvent.click(screen.getByRole('button', { name: 'WEB' }));
    fireEvent.click(screen.getByText('King James Version').closest('button')!);

    // Wait for the KJV chapter to land: its verse text reappearing means `data` was re-set, which
    // is the render the hash effect re-fires on. RTL's `waitFor` flushes that render's passive
    // effects, so by the time this resolves a re-open (if it were going to) has.
    await waitFor(() => {
      expect(screen.getByText('In the beginning was the Word.')).toBeTruthy();
    });
    // One more macrotask flush so any microtask-scheduled effect work is settled.
    await new Promise((r) => setTimeout(r, 0));

    // The yank never happened: the spy recorded exactly the single deep-link-arrival call, on the
    // verse-2 element — no second call after the switch. Both the count and the contents are
    // asserted: length 1 proves no re-scroll happened at all, and the contents prove the one call
    // that DID fire targeted the deep-linked verse (not, say, a different element on a different
    // path).
    expect(scrollCalls).toHaveLength(1);
    expect(scrollCalls).toEqual(['2']);
    // And the dismissed panel stayed dismissed: no dialog re-rendered.
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
