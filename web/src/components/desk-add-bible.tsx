'use client';

// UX-1 — THE DESK PICKER'S BIBLE ENTRY POINT. The desk's "+" routes to /library?desk=…, which
// offered catalogs of works only, so Scripture could not be added to a desk from the picker at
// all (MASTER.md UX-1). Nothing new is built here: the pane model already holds Scripture
// (`lib/desk.ts` kind:'scripture'), and this is the same BookPicker-in-pick-mode path the desk's
// own add control uses (app/desk/page.tsx) — the carried-in desk is APPENDED to, never replaced,
// via the same withPane the catalog rows' "+" uses.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookPicker } from '@/components/book-picker';
import { BOOK_BY_BOOK_SLUG, BOOKS } from '@/lib/bible';
import { resolveBookSlug } from '@bible/ref-parse';
import { decodeDesk, deskHref, withPane } from '@/lib/desk';

/** The app's standing default entry point, same as the desk's own add control. The alias
 *  fallback is the wiring invariant (book-slug-alias-wiring): EVERY BOOK_BY_BOOK_SLUG.get
 *  consults resolveBookSlug on a miss, even where the argument is a literal canonical slug. */
const DEFAULT_BOOK = BOOK_BY_BOOK_SLUG.get('jhn') ?? resolveBookSlug('jhn') ?? BOOKS[0]!;

export function DeskAddBible({ desk }: { desk: string }): React.ReactElement {
  const router = useRouter();
  const [picking, setPicking] = useState(false);

  return (
    <section className="mb-9">
      <h2 className="mb-3 text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Adding to your desk</h2>
      {/* The same answer the desk's two add controls give, said once at the top of the picker:
          works come from the catalogs below, Scripture from this control. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="inline-flex min-h-[44px] items-center rounded-lg border edge px-4 text-sm text-stone-700 hover:bg-accent-50/60 dark:text-stone-300 dark:hover:bg-accent-950/25"
        >
          Add a Bible chapter
        </button>
        <span className="text-sm text-stone-500 dark:text-stone-400">or pick a work below — either opens beside what is already on your desk.</span>
      </div>
      {picking && (
        <BookPicker
          currentBook={DEFAULT_BOOK}
          currentChapter={1}
          onClose={() => setPicking(false)}
          onPick={(b, c) => {
            setPicking(false);
            router.push(deskHref(withPane(decodeDesk([desk]), { kind: 'scripture', book: b.slug, chapter: c })));
          }}
        />
      )}
    </section>
  );
}
