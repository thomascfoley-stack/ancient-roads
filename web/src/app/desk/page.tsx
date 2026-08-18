'use client';

// THE STUDY DESK — up to three panes side by side: Scripture, a commentary, and a third voice.
//
// State lives entirely in the URL (`/desk?p=scripture:john/3&p=work:calvin-institutes`), so a desk
// is shareable and the back button works. See lib/desk.ts for the parser and why the cap is
// enforced there rather than here.
//
// LAYOUT. Columns on a wide screen, stacked on a narrow one. Panes scroll independently — the page
// itself does not scroll, which is what makes side-by-side reading work: losing your place in the
// commentary because the Scripture column was taller is the exact frustration this replaces.
// On mobile three columns cannot be read, so panes stack and the page scrolls normally.
//
// ADDING. Two kinds of pane, two affordances (UX-1 named the gap: the + routed to /library, which
// offers works only, so Scripture could not be ADDED to a desk at all — only arrived at by URL).
// "+" still goes to the library for a work; the book button opens the BookPicker in pick mode and
// appends a Scripture pane in place, no navigation.

import { Suspense, useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookPicker } from '@/components/book-picker';
import { DeskPane } from '@/components/desk-pane';
import { BOOK_BY_BOOK_SLUG, BOOKS } from '@/lib/bible';
import { resolveBookSlug } from '@bible/ref-parse';
import { MAX_PANES, decodeDeskReport, deskHref, encodePane, replacePane, withPane, withoutPane, type Pane } from '@/lib/desk';
import { count } from '@/lib/plural';

/** The picker needs a book to highlight; John is the app's standing default entry point. The
 *  alias fallback is the wiring invariant (book-slug-alias-wiring): EVERY BOOK_BY_BOOK_SLUG.get
 *  consults resolveBookSlug on a miss, even where the argument is a literal canonical slug. */
const DEFAULT_BOOK = BOOK_BY_BOOK_SLUG.get('jhn') ?? resolveBookSlug('jhn') ?? BOOKS[0]!;

// A080 — THE DESK NEVER SAID ITS STATE WAS SESSION-ONLY.
//
// Everything above this line is true and NONE of it was on the screen: the desk lives entirely in
// the URL, and signing in changes nothing about that (B007 checked it signed in and found the same
// URL-only behaviour). Meanwhile the Library, one route over, states its anon/account boundary
// inline wherever it applies. So the surface where a reader assembles three works and walks away
// was the one surface that said nothing about what it keeps.
//
// R1 (docs/pm/orders/2026-08-17-three-ux-rulings.md) rules persistence in — per-account signed in,
// localStorage signed out — and sequences it AFTER the nav entry, because it is a data change.
// Until it lands, "the Desk must SAY its state is session-only rather than implying otherwise —
// an honest limitation beats a silent one." This is that sentence, and it is DELIBERATELY the
// cheap half: no state, no dismiss, no storage. When persistence ships, this constant and its two
// call sites are what get deleted.
//
// IT NAMES THE REMEDY, not just the limitation. A rule with no way out reads as a bug — the same
// reasoning as the cap notice's "Close one to make room" below. The URL genuinely IS the save
// here, so saying so turns a limitation into an instruction the reader can act on today.
const SESSION_ONLY_NOTE =
  'This desk is not saved to your account. It lives in the page address — bookmark or share the link to keep it.';

/**
 * The session-only line, in the one form both desk states render.
 *
 * NOT `role="status"`, and that is a decision rather than an omission. `role="status"` is a LIVE
 * REGION: it exists to announce a change the reader did not see happen, which is exactly what the
 * A078 cap notice is (a link overflowed, or the desk just filled). This line reports no change —
 * it is a standing property of the surface, true on first paint and true forever. Announcing it
 * politely on every desk render would be a screen reader repeating a fixed caption as news.
 *
 * There is a mechanical consequence too, and it is the reason this comment is here rather than in
 * the test: `desk-cap-notice.test.tsx` reads `getByRole('status')` as THE cap notice, and asserts
 * a desk under the cap has none at all. A second status role would break that file while passing
 * every assertion about this one — a change that looks like a feature and lands as a regression.
 */
function SessionOnlyNote({ className = '' }: { className?: string }) {
  return (
    <p className={`font-sans text-xs text-stone-500 dark:text-stone-400 ${className}`}>
      {SESSION_ONLY_NOTE}
    </p>
  );
}

function DeskInner() {
  const router = useRouter();
  const params = useSearchParams();
  // A078: `overflow` is how many valid panes the URL asked for and the cap refused. Taking it here
  // rather than calling decodeDesk means the number reaches the render — it used to be computed
  // and thrown away inside the parser, which is precisely why the drop was silent.
  const { panes, overflow } = decodeDeskReport(params.getAll('p'));
  const [pickingBible, setPickingBible] = useState(false);

  const close = useCallback(
    (index: number) => {
      // replace(), not push(): closing a pane should not stack history entries that the back
      // button then has to walk through one at a time.
      router.replace(deskHref(withoutPane(panes, index)), { scroll: false });
    },
    [router, panes],
  );

  const replace = useCallback(
    (index: number, pane: Pane) => {
      router.replace(deskHref(replacePane(panes, index, pane)), { scroll: false });
    },
    [router, panes],
  );

  const addScripture = useCallback(
    (bookSlug: string, chapter: number) => {
      setPickingBible(false);
      router.replace(deskHref(withPane(panes, { kind: 'scripture', book: bookSlug, chapter })), { scroll: false });
    },
    [router, panes],
  );

  const bookPicker = pickingBible && (
    <BookPicker
      currentBook={DEFAULT_BOOK}
      currentChapter={1}
      onClose={() => setPickingBible(false)}
      onPick={(b, c) => addScripture(b.slug, c)}
    />
  );

  if (panes.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-16 text-center">
        <h1 className="mb-3 font-display text-3xl font-medium tracking-[-0.01em] text-stone-900 dark:text-stone-100">Your desk is empty</h1>
        <p className="mb-6 font-scripture text-base leading-relaxed text-stone-600 dark:text-stone-400">
          Open up to {MAX_PANES} things side by side: a chapter of Scripture, a commentary on it, and a
          sermon, hymn, poem or history beside them.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {/* PRD §6 CTAs: 1px hairline, transparent, fill on hover — primary in ink,
              secondary in ink-wash. */}
          {/* A075 — REPORTED as "navigates away to the plain reader instead of putting a Scripture
              pane on the desk". Measured FALSE (2026-08-17, driven at 390px): this is a button, it
              opens the picker in pick mode, and `addScripture` writes the pane into `?p=` without
              leaving /desk. It has been a button since 5760eec (2026-08-02). Kept a button
              DELIBERATELY — the empty state's copy promises panes, and a link to /read/... is the
              obvious-looking rewrite that would make the copy a lie. Welded by
              test/components/desk-empty-cta-adds-scripture.test.tsx. */}
          <button
            type="button"
            onClick={() => setPickingBible(true)}
            className="min-h-[44px] rounded-lg border border-stone-900 px-5 py-2.5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
          >
            Open the Bible
          </button>
          <Link
            href="/library"
 className="inline-flex min-h-[44px] items-center rounded-lg border border-stone-500 px-5 py-2.5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-600 hover:bg-stone-500 hover:text-stone-50 dark:border-stone-400 dark:text-stone-300 dark:hover:bg-stone-400 dark:hover:text-stone-900"
          >
            Browse the library
          </Link>
        </div>
        {/* A080, first of two call sites. On the EMPTY desk the note sits under the calls to
            action, because this is the moment before the reader invests: every desk starts here,
            and a limitation is worth knowing before you assemble three panes, not after. Below the
            buttons rather than above them, so the invitation still leads. */}
        <SessionOnlyNote className="mt-6" />
        {bookPicker}
      </div>
    );
  }

  // A078 — THE CAP HAS TO SAY SOMETHING. Two silences, one line.
  //
  // (1) A URL carrying more panes than the desk holds rendered three and never mentioned the rest.
  // (2) At the cap BOTH add controls simply disappear (`panes.length < MAX_PANES` below): the
  //     reader is left looking for a "+" that is no longer there, with nothing on screen saying
  //     the desk is full or what to do about it. A control that vanishes is a rule stated in
  //     invisible ink.
  //
  // Overflow wins when both apply, because it is the one that reports a LOSS rather than a state,
  // and it carries the same remedy sentence. Derived from the URL, not held in state, so it clears
  // itself the moment the desk changes — closing a pane rewrites `?p=` from the decoded panes, so
  // the overflow entries are gone and the notice goes with them. No dismiss button to maintain,
  // and no stale toast outliving the thing it described.
  const capNotice =
    overflow > 0
      ? `Your desk holds ${MAX_PANES} at a time — ${count(overflow, 'pane')} from this link did not open. Close one to make room.`
      : panes.length >= MAX_PANES
        ? `Your desk is full at ${MAX_PANES} panes. Close one to add another.`
        : null;

  return (
    // h-dvh + overflow-hidden on the OUTER column is what gives each pane its own scroll region on
    // desktop without the page scrolling; the panes row below takes the remaining height. On mobile
    // `lg:h-dvh` is dropped, so the page scrolls normally through stacked panes.
    //
    // The row became two levels for the notice above: a full-width line has nowhere honest to sit
    // inside a row of columns — as a flex child it becomes a fourth column, and wrapping it would
    // put the panes on a second line. So the height contract moved up one div and the row keeps it
    // via flex-1/min-h-0, which is the same contract expressed one level further in.
    <div className="flex w-full flex-col gap-2 px-3 py-3 lg:h-dvh lg:overflow-hidden">
      {/* The POPULATED desk had no h1 at all: the only heading on this route lived in the
          empty state above, so the working screen started at the panes' own h3 and a
          screen reader's heading list was empty. Visually hidden because the panes carry
          their own titles and a banner heading would just take reading space from them. */}
      <h1 className="sr-only">Your desk, {count(panes.length, 'pane')} open</h1>
      {capNotice && (
        // role="status" (polite), so a screen reader hears it when the desk fills or a link
        // overflows, without interrupting whatever is being read. Deliberately quiet type: this
        // line costs the panes a few pixels of height on every full desk, so it earns them by
        // being small and by only existing while it is true.
        <p role="status" className="shrink-0 text-center font-sans text-xs text-stone-500 dark:text-stone-400">
          {capNotice}
        </p>
      )}
      <div className="flex w-full flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {panes.map((pane, i) => (
          <div
            key={`${pane.kind}:${pane.kind === 'work' ? pane.slug : `${pane.book}/${pane.chapter}`}`}
            // flex-col (was a bare `flex` row holding one child) so the A079 line below can sit
            // above the pane. The pane keeps `flex-1`, so it still takes the whole remaining box on
            // both axes and the desktop layout is unchanged — verified in a browser at 1280px.
            className="flex min-h-[60vh] min-w-0 flex-1 flex-col gap-1.5 lg:min-h-0"
          >
            {/* A079 — A STACKED DESK GAVE NO SIGN THE OTHER PANES EXISTED.
                MEASURED FIRST, because the finding offered three treatments and two of them
                describe a layout this desk does not have. At 390x844 with two panes open:
                `scrollWidth === clientWidth` (nothing scrolls sideways), pane 1 was 3165px tall at
                y=12, pane 2 began at y=3189. The panes STACK below `lg:` — so a swipe hint or a
                dot-pager would advertise a horizontal gesture that does nothing, which is worse
                than the silence it replaced. A counter is the treatment that matches the layout.

                WHY PER PANE RATHER THAN ONE LINE AT THE TOP. The same measurement decides it: the
                first pane alone is 3.8 screens tall, so a single top-of-page line is off-screen for
                most of the scroll, and a reader who lands mid-stack (after closing a pane, or on a
                shared link) never sees it at all. Attached to each pane it is present at the top of
                whichever pane you are on, and it doubles as "where am I".

                `lg:hidden` because above that breakpoint the panes ARE side by side and visibly
                co-present — there the line would be a caption stating what the reader can see.

                Not a `role="status"`: nothing changed, this is a standing property of the layout.
                The same reasoning as SessionOnlyNote above, and the same mechanical consequence —
                `desk-cap-notice.test.tsx` reads the one status role on this page as the A078 cap
                notice. */}
            {panes.length > 1 && (
              <p className="shrink-0 font-sans text-xs text-stone-500 dark:text-stone-400 lg:hidden">
                {/* The last pane gets the number without the invitation: there is nothing below it,
                    and pointing a reader at a pane that is not there is the failure mode the A078
                    overflow count was careful to avoid. */}
                {i + 1 < panes.length
                  ? `Pane ${i + 1} of ${panes.length} — scroll down for the next`
                  : `Pane ${panes.length} of ${panes.length}`}
              </p>
            )}
            <DeskPane pane={pane} onClose={() => close(i)} onReplace={(p) => replace(i, p)} />
          </div>
        ))}
        {panes.length < MAX_PANES && (
          <div className="flex shrink-0 items-center justify-center gap-2 lg:w-12 lg:flex-col">
            <Link
              /* Carry the open desk so the library's "+" APPENDS rather than replacing. */
              href={`/library?desk=${encodeURIComponent(panes.map(encodePane).join(','))}`}
              aria-label="Add a work from the library"
              title="Add a work from the library"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center border border-dashed border-stone-300 text-xl text-stone-500 dark:text-stone-400 hover:border-accent-400 hover:text-accent-600 dark:border-stone-700 dark:hover:border-accent-500"
            >
              +
            </Link>
            <button
              type="button"
              onClick={() => setPickingBible(true)}
              aria-label="Add a Bible chapter"
              title="Add a Bible chapter"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center border border-dashed border-stone-300 text-stone-500 dark:text-stone-400 hover:border-accent-400 hover:text-accent-600 dark:border-stone-700 dark:hover:border-accent-500"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                <path
                  d="M9 3.5c-1.6-1-3.9-1.3-6-1v11.3c2.1-.3 4.4 0 6 1 1.6-1 3.9-1.3 6-1V2.5c-2.1-.3-4.4 0-6 1Zm0 0v11.3"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
      {/* A080, second call site — AT THE FOOT, and the position is the whole answer to "how do
          these two lines not fight each other".
          They are different KINDS of message and they are separated by kind, not by styling:

            * the cap notice (above the panes) reports SOMETHING THAT JUST HAPPENED — a link
              overflowed, or the desk filled on the pane you just added. It is transient, it is
              conditional, and it belongs where the reader looks after acting.
            * this line reports a STANDING PROPERTY of the surface. It is true on every desk, at
              every pane count, forever — until persistence ships and deletes it.

          Stacking them would have put two quiet grey lines in a row at the top and made the
          transient one easy to read past, which is the failure the cap notice exists to fix. Here
          the top line answers "what just happened" and the foot answers "what is this thing", and
          neither has to be read to find the other.

          `shrink-0` because the desk's outer column is height-constrained on desktop
          (`lg:h-dvh lg:overflow-hidden`); the panes row takes the remaining height via
          flex-1/min-h-0, so this line must not be squeezed out of it. Same contract the cap
          notice above uses, one level down. */}
      <SessionOnlyNote className="shrink-0 text-center" />
      {bookPicker}
    </div>
  );
}

export default function DeskPage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={<div className="px-5 py-16 text-center text-sm text-stone-500 dark:text-stone-400">Loading your desk…</div>}>
      <DeskInner />
    </Suspense>
  );
}
