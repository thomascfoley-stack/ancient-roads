// My books — the works a reader has shelved (ledger N3).
//
// This was a `ComingSoon` stub whose copy said the shelf "will live here", sitting behind a
// first-class nav entry, while `library_items` had a table, an RLS policy, tenancy tests and two
// writers with ZERO call sites. Nothing was coming: the feature was complete except for a caller.
//
// A SERVER component, like the Library hub it sits under: it can call `requireUser()` and the
// library query directly, so there is no client fetch plumbing and no extra API surface to secure.
// Signed out, it makes the offer — which is why the reader's Save control does NOT, being mid-page
// in a book at the time.
//
// PUBLISHED-ONLY comes from `listLibraryItems` itself (see lib/library.ts's header): a work
// withdrawn after being shelved vanishes from here while its row survives, so re-publishing
// restores it. That is the licensing boundary, and it is why this page does not filter for itself.

import Link from 'next/link';
import { listLibraryItems, type LibraryItem } from '@/lib/library';
import { libraryLabel } from '@/lib/library-nav';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'My books' };
export const dynamic = 'force-dynamic';

async function shelved(): Promise<LibraryItem[] | null> {
  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch {
    return null; // signed out — not an error
  }
  return listLibraryItems(userId);
}

export default async function MyBooksPage() {
  const items = await shelved();

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
      <header className="mb-6">
        {/* The heading is the ONE name for this route, read from lib/library-nav.ts rather than
            typed here — the same derivation that stopped "Saved" naming two destinations. */}
        <h1 className="font-display text-3xl font-medium tracking-tight text-stone-900 dark:text-stone-100">
          {libraryLabel('/library/books')}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500 dark:text-stone-400">
          Works you have saved while reading. Open a work and press Save to keep it here.
        </p>
      </header>

      {items === null ? (
        <div className="py-16 text-center">
          <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
            Sign in to keep a shelf of your own.
          </p>
          <Link
            href="/auth/sign-in"
            className="inline-flex min-h-[44px] items-center border border-stone-900 px-5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
          >
            Sign in
          </Link>
        </div>
      ) : items.length === 0 ? (
        // An empty shelf says how to fill it. "No items" would be true and useless.
        <div className="py-16 text-center">
          <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
            Nothing saved yet. Open any work and press <span className="font-semibold">Save</span> in
            its header to keep it here.
          </p>
          <Link
            href="/library/commentaries"
            className="inline-flex min-h-[44px] items-center border border-stone-900 px-5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
          >
            Browse commentaries →
          </Link>
        </div>
      ) : (
        // Hairline-separated rows, no cards — the same list idiom as the hub's Continue reading.
        <ul className="border-y edge">
          {items.map((it) => (
            <li key={it.sourceId} className="border-b edge last:border-b-0">
              <Link
                href={`/work/${it.slug}`}
                className="group flex min-h-[44px] items-center justify-between gap-3 py-3 transition-colors ease-gentle hover:bg-accent-50/40 dark:hover:bg-accent-950/20"
              >
                <span className="min-w-0">
                  <span className="block truncate font-scripture text-[17px] text-stone-900 group-hover:text-accent-800 dark:text-stone-100 dark:group-hover:text-accent-300">
                    {it.title}
                  </span>
                  <span className="block truncate text-micro uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    {it.author ?? 'Unattributed'}
                  </span>
                </span>
                {it.tradition && (
                  <span className="shrink-0 text-micro uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    {it.tradition}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
