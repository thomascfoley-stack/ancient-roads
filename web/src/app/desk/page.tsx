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

import { Suspense, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DeskPane } from '@/components/desk-pane';
import { MAX_PANES, decodeDesk, deskHref, encodePane, withoutPane } from '@/lib/desk';

function DeskInner() {
  const router = useRouter();
  const params = useSearchParams();
  const panes = decodeDesk(params.getAll('p'));

  const close = useCallback(
    (index: number) => {
      // replace(), not push(): closing a pane should not stack history entries that the back
      // button then has to walk through one at a time.
      router.replace(deskHref(withoutPane(panes, index)), { scroll: false });
    },
    [router, panes],
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
          <Link
            href="/desk?p=scripture:jhn/1"
            className="min-h-[44px] rounded-full bg-accent-700 px-5 py-2.5 text-sm font-semibold text-stone-50 hover:bg-accent-800 dark:bg-accent-500 dark:hover:bg-accent-400"
          >
            Start with John 1
          </Link>
          <Link
            href="/library"
            className="min-h-[44px] rounded-full border border-stone-200/70 px-5 py-2.5 text-sm text-stone-600 hover:bg-accent-50/50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-accent-950/20"
          >
            Browse the library
          </Link>
        </div>
      </div>
    );
  }

  return (
    // h-dvh + min-h-0 on the children is what gives each pane its own scroll region on desktop
    // without the page scrolling. On mobile the flex direction flips to column and `lg:h-dvh` is
    // dropped, so the page scrolls normally through stacked panes.
    <div className="flex w-full flex-col gap-3 px-3 py-3 lg:h-dvh lg:flex-row lg:overflow-hidden">
      {panes.map((pane, i) => (
        <div
          key={`${pane.kind}:${pane.kind === 'work' ? pane.slug : `${pane.book}/${pane.chapter}`}`}
          className="flex min-h-[60vh] min-w-0 flex-1 lg:min-h-0"
        >
          <DeskPane pane={pane} onClose={() => close(i)} />
        </div>
      ))}
      {panes.length < MAX_PANES && (
        <div className="flex shrink-0 items-center justify-center lg:w-12">
          <Link
            /* Carry the open desk so the library's "+" APPENDS rather than replacing. */
            href={`/library?desk=${encodeURIComponent(panes.map(encodePane).join(','))}`}
            aria-label="Add another pane from the library"
            title="Add another pane"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-dashed border-stone-300 text-xl text-stone-400 hover:border-accent-400 hover:text-accent-600 dark:border-stone-700 dark:hover:border-accent-500"
          >
            +
          </Link>
        </div>
      )}
    </div>
  );
}

export default function DeskPage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={<div className="px-5 py-16 text-center text-sm text-stone-400">Loading your desk…</div>}>
      <DeskInner />
    </Suspense>
  );
}
