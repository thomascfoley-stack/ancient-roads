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
import { MAX_PANES, decodeDesk, deskHref, encodePane, replacePane, withPane, withoutPane, type Pane } from '@/lib/desk';
import { count } from '@/lib/plural';

/** The picker needs a book to highlight; John is the app's standing default entry point. The
 *  alias fallback is the wiring invariant (book-slug-alias-wiring): EVERY BOOK_BY_BOOK_SLUG.get
 *  consults resolveBookSlug on a miss, even where the argument is a literal canonical slug. */
const DEFAULT_BOOK = BOOK_BY_BOOK_SLUG.get('jhn') ?? resolveBookSlug('jhn') ?? BOOKS[0]!;

function DeskInner() {
  const router = useRouter();
  const params = useSearchParams();
  const panes = decodeDesk(params.getAll('p'));
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
        <h1 className="mb-3 font-scripture text-2xl text-stone-800 dark:text-stone-100">Your desk is empty</h1>
        <p className="mb-6 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
          Open up to {MAX_PANES} things side by side: a chapter of Scripture, a commentary on it, and a
          sermon, hymn, poem or history beside them.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => setPickingBible(true)}
            className="min-h-[44px] rounded-lg bg-accent-700 px-5 py-2.5 text-sm font-semibold text-stone-50 hover:bg-accent-800 dark:bg-accent-500 dark:hover:bg-accent-400"
          >
            Open the Bible
          </button>
          <Link
            href="/library"
 className="min-h-[44px] rounded-lg border edge px-5 py-2.5 text-sm text-stone-600 hover:bg-accent-50/50 dark:text-stone-300 dark:hover:bg-accent-950/20"
          >
            Browse the library
          </Link>
        </div>
        {bookPicker}
      </div>
    );
  }

  return (
    // h-dvh + min-h-0 on the children is what gives each pane its own scroll region on desktop
    // without the page scrolling. On mobile the flex direction flips to column and `lg:h-dvh` is
    // dropped, so the page scrolls normally through stacked panes.
    <div className="flex w-full flex-col gap-3 px-3 py-3 lg:h-dvh lg:flex-row lg:overflow-hidden">
      {/* The POPULATED desk had no h1 at all: the only heading on this route lived in the
          empty state above, so the working screen started at the panes' own h3 and a
          screen reader's heading list was empty. Visually hidden because the panes carry
          their own titles and a banner heading would just take reading space from them. */}
      <h1 className="sr-only">Your desk, {count(panes.length, 'pane')} open</h1>
      {panes.map((pane, i) => (
        <div
          key={`${pane.kind}:${pane.kind === 'work' ? pane.slug : `${pane.book}/${pane.chapter}`}`}
          className="flex min-h-[60vh] min-w-0 flex-1 lg:min-h-0"
        >
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
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-dashed border-stone-300 text-xl text-stone-500 dark:text-stone-400 hover:border-accent-400 hover:text-accent-600 dark:border-stone-700 dark:hover:border-accent-500"
          >
            +
          </Link>
          <button
            type="button"
            onClick={() => setPickingBible(true)}
            aria-label="Add a Bible chapter"
            title="Add a Bible chapter"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-dashed border-stone-300 text-stone-500 dark:text-stone-400 hover:border-accent-400 hover:text-accent-600 dark:border-stone-700 dark:hover:border-accent-500"
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
