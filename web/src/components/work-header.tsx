'use client';

// The Book Reader's sticky chrome (design §2): title · author · tradition · era · license.
// Attribution discipline (§8.6): these fields come from the whitelisted /api/work response —
// `provenance` (host URLs) is never selected server-side, so no host URL can render here.

import { useCallback, useEffect, useState } from 'react';
import { ReaderSettings } from './reader-settings';
import type { WorkSource } from '@/lib/work';

/**
 * SAVE THIS WORK TO MY BOOKS (ledger N3).
 *
 * The only caller of the `library_items` write path. Before this, `setShelf` and
 * `removeFromLibrary` had zero call sites: the table, its RLS policy and its tenancy tests all
 * existed and nothing in the product could put a work on a shelf.
 *
 * Signed-out readers get NOTHING here rather than a disabled control or a sign-in prompt — the
 * route 401s them, and the reader is mid-page in a book, which is the wrong moment to advertise an
 * account. `/library/books` makes the offer where it is relevant.
 *
 * Optimistic with revert: shelving is a one-bit convenience and waiting on a round trip to
 * repaint a button is worse than briefly showing a state the server has not confirmed. On failure
 * the previous state comes back, so the button never ends up lying about what was stored.
 */
function SaveToShelf({ slug, signedIn }: { slug: string; signedIn: boolean }) {
  // `undefined` = not asked yet, which is NOT the same as `null` = asked, not shelved. The
  // distinction is what keeps the control from flashing "Save" at a reader whose work is saved.
  const [shelf, setShelf] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // A revert nobody is told about reads as a UI glitch: the reader pressed Save, saw "Saved",
  // and watched it flip back on its own. Reverting was right; reverting SILENTLY was the lie.
  const [failed, setFailed] = useState(false);
  const url = `/api/work/${encodeURIComponent(slug)}/shelf`;

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { shelf: string | null }) => {
        if (!cancelled) setShelf(d.shelf);
      })
      // A failed read leaves the control absent rather than guessing. Rendering "Save" on a work
      // that IS saved would be a lie about stored state; showing nothing is merely unhelpful.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [url, signedIn]);

  const toggle = useCallback(async () => {
    if (busy || shelf === undefined) return;
    const previous = shelf;
    const next = shelf ? null : 'saved';
    setBusy(true);
    setFailed(false); // this attempt's verdict, not the last one's
    setShelf(next);
    try {
      const res = await (next
        ? fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shelf: next }) })
        : fetch(url, { method: 'DELETE' }));
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setShelf(previous);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [busy, shelf, url]);

  if (!signedIn || shelf === undefined) return null;
  const saved = shelf !== null;
  return (
    <span className="flex shrink-0 items-center gap-2">
      {failed && (
        // `role="status"` (polite), not an alert: the reader is mid-page in a book and the shelf
        // is a one-bit convenience — worth saying, not worth interrupting for. It disappears the
        // moment the next attempt starts, so it always describes the attempt just made.
        <span role="status" className="font-sans text-xs text-red-700 dark:text-red-400">
          Not saved
        </span>
      )}
      <button
        onClick={toggle}
        aria-pressed={saved}
        title={saved ? 'Remove from My books' : 'Save to My books'}
        className="min-h-[44px] shrink-0 border edge bg-transparent px-3 font-sans text-sm font-semibold text-stone-800 transition-colors ease-gentle hover:bg-stone-100 active:bg-stone-200 sm:min-h-0 sm:py-1.5 dark:text-stone-100 dark:hover:bg-stone-800"
      >
        {saved ? 'Saved' : 'Save'}
      </button>
    </span>
  );
}

export function WorkHeader({
  source,
  slug,
  signedIn = false,
  onOpenToc,
  ref,
}: {
  source: WorkSource;
  slug: string;
  signedIn?: boolean;
  onOpenToc: () => void;
  /** The reader measures the header's live bottom edge for scroll/progress math (React 19
   *  ref-as-prop). */
  ref?: React.Ref<HTMLElement>;
}) {
  const meta = [source.author, source.tradition, source.era, source.license].filter(Boolean).join(' · ');
  return (
    <header
      ref={ref}
      /* Opaque parchment, no backdrop blur (PRD §3: no blur anywhere); the .edge hairline
         below is the whole separation from the text. */
 className="sticky top-0 z-40 border-b edge bg-stone-50 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] dark:bg-stone-950"
    >
      {/* The header row spans the reading measure so it tracks the text column below it
          (was max-w-2xl, left behind when the column became the reader's preference). */}
      <div className="reading-measure mx-auto flex items-center gap-2 px-3 sm:px-4">
        <button
          onClick={onOpenToc}
          title="Table of contents"
          className="min-h-[44px] shrink-0 border edge bg-transparent px-4 font-sans text-sm font-semibold text-stone-800 transition-colors ease-gentle hover:bg-stone-100 active:bg-stone-200 sm:min-h-0 sm:py-1.5 dark:text-stone-100 dark:hover:bg-stone-800"
        >
          Contents
        </button>
        {/* An h1, not a <p>. /work/[slug] is the deepest content surface in the app and
            had NO heading element at all: the work you are reading was 14px body text,
            visually outranked by the "Contents" button beside it, and a screen reader's
            heading list for the page was empty. Size is unchanged, this is a header bar
            and the body below is the reading surface; the change is what it IS. */}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-sm font-medium text-stone-800 dark:text-stone-100">
            {source.title}
          </h1>
          {meta && (
            <p className="truncate text-micro font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
              {meta}
            </p>
          )}
        </div>
        <SaveToShelf slug={slug} signedIn={signedIn} />
        <ReaderSettings />
      </div>
    </header>
  );
}
