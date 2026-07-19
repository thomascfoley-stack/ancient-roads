// The Library hub (docs/LIBRARY_READER_DESIGN.md §10.3): Continue reading · Yours · The corpus.
//
// A SERVER component: it can call requireUser() and the library queries directly, so there is no
// client fetch plumbing and no extra API surface to secure. Signed out, the personal sections are
// simply absent — the corpus half is public and still useful.
//
// NOTE on the auth catch below: it distinguishes "not signed in" from "something broke". The
// existing /api/annotations route wraps its whole body in a bare catch that returns 401 for ANY
// error, which is how a schema error surfaces to a user as "Unauthorized" and misdirects debugging
// (flagged in the Phase 3 audit). Not repeating that here.

import Link from 'next/link';
import { CATALOGS, CATALOG_IDS, catalogTraditions } from '@/lib/catalog';
import { listContinueReading, listLibraryItems, type ContinueReadingRow, type LibraryItem } from '@/lib/library';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Library' };
export const dynamic = 'force-dynamic';

const YOURS = [
  { href: '/library/notes', label: 'Notes' },
  { href: '/library/books', label: 'My library' },
  { href: '/library/word-study', label: 'Word study' },
  { href: '/library/uploads', label: 'Uploads' },
];

async function personal(): Promise<{ reading: ContinueReadingRow[]; shelf: LibraryItem[] } | null> {
  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch {
    return null; // signed out — not an error, just no personal shelf
  }
  const [reading, shelf] = await Promise.all([listContinueReading(userId, { limit: 6 }), listLibraryItems(userId, { limit: 12 })]);
  return { reading, shelf };
}

export default async function LibraryHubPage() {
  const [mine, facets] = await Promise.all([
    personal(),
    Promise.all(CATALOG_IDS.map(async (id) => ({ id, traditions: await catalogTraditions(id) }))),
  ]);
  const worksIn = (id: string) => facets.find((f) => f.id === id)?.traditions.reduce((n, t) => n + t.works, 0) ?? 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-8">
      <h1 className="mb-6 font-scripture text-2xl text-stone-800 dark:text-stone-100">Library</h1>

      {mine && mine.reading.length > 0 && (
        <section className="mb-9">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Continue reading</h2>
          <ul className="space-y-2">
            {mine.reading.map((r) => (
              <li key={r.sourceId}>
                <Link
                  href={`/work/${r.slug}#s${r.lastOrdinal}`}
                  className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-stone-200/70 px-4 py-3 hover:bg-accent-50/50 dark:border-stone-800 dark:hover:bg-accent-950/20"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-scripture text-stone-800 dark:text-stone-100">{r.title}</span>
                    <span className="block truncate text-xs text-stone-500 dark:text-stone-400">{r.author ?? '—'}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-stone-400">
                    {r.percent === null ? '' : `${Math.round(r.percent * 100)}%`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-9">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Yours</h2>
        <div className="flex flex-wrap gap-2">
          {YOURS.map((y) => (
            <Link
              key={y.href}
              href={y.href}
              className="inline-flex min-h-[44px] items-center rounded-full border border-stone-200/70 px-4 text-sm text-stone-700 hover:bg-accent-50/60 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-accent-950/25"
            >
              {y.label}
            </Link>
          ))}
        </div>
        {!mine && (
          <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
            <Link href="/auth/sign-in" className="underline underline-offset-4">
              Sign in
            </Link>{' '}
            to keep notes, highlights, and your place in a work.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400">The corpus</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {CATALOG_IDS.map((id) => (
            <li key={id}>
              <Link
                href={`/library/${id}`}
                className="flex min-h-[88px] flex-col justify-between rounded-xl border border-stone-200/70 p-4 hover:bg-accent-50/50 dark:border-stone-800 dark:hover:bg-accent-950/20"
              >
                <span className="font-scripture text-lg text-stone-800 dark:text-stone-100">{CATALOGS[id].label}</span>
                <span className="text-xs text-stone-500 dark:text-stone-400">{worksIn(id)} works</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
