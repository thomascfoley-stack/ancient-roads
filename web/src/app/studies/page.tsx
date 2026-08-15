import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { listStudies, STUDIES_PAGE_LIMIT, type Study } from '@/lib/studies';
import { DISPLAY_LOCALE } from '@/lib/locale';
import { NewStudyButton } from '@/components/study-editor';

// `/studies` — the My Studies list (design §7.1/§7.4; E1: the user-facing name is "My Studies";
// E3: many studies, not one master doc).
//
// `force-dynamic` because the list is per-reader and must never be prerendered or cached —
// the prayers page's rule, for the same reason.
//
// ORDER IS PINNED FIRST, THEN updated_at RECENTS (design §7.1). The P1 list cursor is
// recency-only — `(updated_at, id)` (lib/studies.ts) — so a pinned study can sit pages deep in
// recency order. Completing the pinned rail therefore means sweeping forward from the top until
// the list runs short; the sweep is bounded at PIN_SWEEP_PAGES pages. Past that bound an old
// pinned study appears in recency order instead of the rail — a cosmetic miss, never a wrong
// row. Recorded as P1 gap F-W3-1: a pinned-aware list belongs in the data layer, not in a page
// working around a recency-only cursor.
//
// Pagination is the P1 route's before-cursor (beforeUpdatedAt + beforeId, travelling together),
// carried in the URL so Back restores by construction. The next cursor is the LAST ROW OF THE
// RECENCY PAGE, pinned or not — the cursor walks the underlying ordering, not the rendered one.

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My Studies' };

const PIN_SWEEP_PAGES = 10;

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });

export default async function StudiesPage({
  searchParams,
}: {
  searchParams: Promise<{ beforeUpdatedAt?: string; beforeId?: string }>;
}) {
  const sp = await searchParams;
  const user = await currentUser();
  if (!user) redirect('/auth/sign-in');

  // Both cursor params together or neither (the route's own rule), and both well-formed —
  // anything else starts at the top rather than erroring on a hand-edited URL.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const before =
    sp.beforeUpdatedAt && sp.beforeId && !Number.isNaN(Date.parse(sp.beforeUpdatedAt)) && UUID_RE.test(sp.beforeId)
      ? { updatedAt: sp.beforeUpdatedAt, id: sp.beforeId }
      : undefined;

  const firstPage = await listStudies(user.id, { before });

  // The pinned sweep always starts at the top of the recency ordering. When this is the first
  // page overall, its first sweep page IS `firstPage` — don't fetch it twice.
  const pinned: Study[] = [];
  let sweepBefore: { updatedAt: string; id: string } | undefined;
  for (let n = 0; n < PIN_SWEEP_PAGES; n++) {
    const page = n === 0 && before === undefined ? firstPage : await listStudies(user.id, { before: sweepBefore });
    for (const s of page) if (s.pinned_at !== null) pinned.push(s);
    if (page.length < STUDIES_PAGE_LIMIT) break;
    const lastRow = page[page.length - 1]!;
    sweepBefore = { updatedAt: lastRow.updated_at, id: lastRow.id };
  }

  const pinnedIds = new Set(pinned.map((s) => s.id));
  const recents = firstPage.filter((s) => !pinnedIds.has(s.id));
  const lastOfPage = firstPage[firstPage.length - 1];
  const nextHref =
    firstPage.length >= STUDIES_PAGE_LIMIT && lastOfPage
      ? `/studies?beforeUpdatedAt=${encodeURIComponent(lastOfPage.updated_at)}&beforeId=${encodeURIComponent(lastOfPage.id)}`
      : null;

  const row = (s: Study) => (
    <li key={s.id} className="border-t edge">
      <Link
        href={`/studies/${s.id}`}
        className="group block px-1 py-6 transition-colors ease-gentle hover:bg-stone-200/10 dark:hover:bg-stone-800/20"
      >
        <span className="mb-2 flex items-center gap-3 font-sans text-sm small-caps tracking-[0.08em] text-stone-500 dark:text-stone-400">
          {when(s.updated_at)}
        </span>
        <span className="line-clamp-1 font-serif text-lg leading-[1.9] text-stone-900 transition-colors ease-gentle group-hover:text-accent-600 dark:text-stone-200 dark:group-hover:text-accent-400">
          {s.title}
        </span>
      </Link>
    </li>
  );

  return (
    <div className="mx-auto max-w-[80ch] px-6 py-12 md:py-20">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-[-0.01em] text-stone-900 dark:text-stone-200">
            My Studies
          </h1>
          <p className="mt-2 font-serif leading-relaxed text-stone-500 dark:text-stone-400">
            Your own writing beside attributed passages from the library — durable bodies of work,
            kept to your account.
          </p>
        </div>
        <NewStudyButton />
      </header>

      {firstPage.length === 0 && pinned.length === 0 ? (
        <p className="mt-12 font-serif text-stone-500 dark:text-stone-400">
          Nothing here yet. Start a new study, or save a passage from the library with
          Save to study.
        </p>
      ) : (
        <>
          {pinned.length > 0 && (
            <section aria-label="Pinned studies" className="mt-12">
              <h2 className="font-sans text-xs font-semibold small-caps tracking-[0.08em] text-stone-500 dark:text-stone-400">
                Pinned
              </h2>
              <ol>{pinned.map((s) => row(s))}</ol>
            </section>
          )}
          {recents.length > 0 && (
            <section aria-label="Recent studies" className="mt-12">
              <h2 className="font-sans text-xs font-semibold small-caps tracking-[0.08em] text-stone-500 dark:text-stone-400">
                Recent
              </h2>
              <ol>{recents.map((s) => row(s))}</ol>
            </section>
          )}
          {nextHref && (
            <div className="mt-10 flex justify-center">
              <Link
                href={nextHref}
                className="inline-flex min-h-[44px] items-center font-sans text-xs font-semibold small-caps tracking-[0.08em] text-accent-600 hover:underline dark:text-accent-400"
              >
                Older studies
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
