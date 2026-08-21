// A corpus catalog (design §10.2): Commentaries · Sermons · Hymns & Poetry. Work list + tradition
// facets + search-within-type; every work opens in the Book Reader.
//
// SERVER component. The catalog fence (which source_types this page may show) lives in
// lib/catalog.ts and is applied in SQL — never trusted from the URL. An unknown catalog is a 404,
// not a page that quietly shows everything: silently widening a fence is how the register wall
// gets breached in the UI while retrieval stays clean.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CATALOGS, catalogTraditions, isCatalogId, isSubFilterOf, listCatalogWorks } from '@/lib/catalog';
import { CatalogSearch } from '@/components/catalog-search';
import { StudyEntrance } from '@/components/study-entrance';
import { catalogHref, toggleTradition, withFacet, type CatalogUrlState } from '@/lib/catalog-href';
import { decodeDesk, deskHref as deskHrefWith, withPane } from '@/lib/desk';

export const dynamic = 'force-dynamic';

/** Works per page. Matches the previous fixed `limit`, so page one is unchanged. */
const PAGE_SIZE = 100;
/** Mirrors `MAX_OFFSET / PAGE_SIZE` in lib/catalog.ts — paging past the offset bound is not a use
 *  case, and the URL must not be able to ask for an offset the query layer will silently clamp. */
const MAX_PAGE = 1000;

/**
 * `?page=` is 1-based and reader-facing; everything below is 0-based. Anything unparseable degrades
 * to page one rather than 400ing — a stale or hand-edited bookmark should still show the shelf,
 * which is the same rule this page already applies to an unknown `?sub=`.
 *
 * MAGNITUDE is bounded as well as integer-ness. `Number('1e9')` is an integer, so a validity check
 * alone let `?page=1e9` through as a 99-billion OFFSET — the exact defect the 2026-08-02 audit
 * found in /api/search/works (H10), which validated integer-NESS and never bounded magnitude.
 */
function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 1) return 0;
  return Math.min(n - 1, MAX_PAGE);
}

export async function generateMetadata({ params }: { params: Promise<{ catalog: string }> }) {
  const { catalog } = await params;
  return { title: isCatalogId(catalog) ? CATALOGS[catalog].label : 'Library' };
}

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ catalog: string }>;
  searchParams: Promise<{ sub?: string; tradition?: string | string[]; desk?: string; page?: string }>;
}) {
  const { catalog } = await params;
  if (!isCatalogId(catalog)) notFound();
  const { sub, tradition, desk, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const def = CATALOGS[catalog];
  // Own-key membership. `def.subFilters?.[sub]` walked the prototype chain, so `?sub=constructor`
  // passed this guard as a truthy value and then threw on the spread downstream — a 500 from a
  // crafted URL (2026-08-02 audit). Unlike the API route, an unknown sub here degrades to the whole
  // catalog rather than 400ing: a stale bookmark should still show the shelf.
  const subFilter = sub && isSubFilterOf(catalog, sub) ? sub : undefined;

  // Tradition is a MULTI-select toggle. Next gives a bare string for one `?tradition=`, an array
  // for repeats; both normalise here so the rest of the page has one shape to reason about.
  const selected = (Array.isArray(tradition) ? tradition : tradition ? [tradition] : [])
    .flatMap((t) => t.split(','))
    .map((t) => t.trim())
    .filter(Boolean);
  const selectedSet = new Set(selected);

  const [{ works, total, totalCapped }, traditions] = await Promise.all([
    listCatalogWorks({ catalog, subFilter, traditions: selected, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    catalogTraditions(catalog, subFilter),
  ]);

  // "Add to desk" carries the CURRENT desk through the URL (`?desk=` from the desk's + button), so
  // adding a work appends to what is already open instead of replacing it. No hidden state: if
  // `desk` is absent the link simply opens a fresh desk with this one work on it.
  const openDesk = decodeDesk(desk ? [desk] : []);
  const deskHrefFor = (slug: string): string => deskHrefWith(withPane(openDesk, { kind: 'work', slug }));

  // THE WHOLE URL STATE, in one value. Every link below is built from this by `catalogHref`, so a
  // facet cannot be dropped by a link that predates it — which is exactly how `?desk=` was being
  // lost on the first chip click (2026-08-02 audit; see lib/catalog-href.ts for the full account).
  const urlState: CatalogUrlState = { sub: subFilter, traditions: selected, desk, page };
  // FILTER links go through `withFacet`, which resets the page (a narrower list has fewer pages).
  // PAGING links keep every filter and change only the page.
  const hrefWith = (over: Partial<CatalogUrlState>): string => catalogHref(catalog, withFacet(urlState, over));
  const hrefToggling = (t: string): string => catalogHref(catalog, toggleTradition(urlState, t));
  const hrefPage = (p: number): string => catalogHref(catalog, { ...urlState, page: p });

  const firstShown = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastShown = page * PAGE_SIZE + works.length;
  const hasPrev = page > 0;
  const hasNext = lastShown < total;

  const chip =
    'inline-flex min-h-[36px] items-center rounded-lg border px-3 text-xs transition-colors ease-gentle';
  const on = 'border-accent-400 bg-accent-50 text-accent-800 dark:bg-accent-950/40 dark:text-accent-200';
 const off = 'edge text-stone-600 hover:bg-accent-50/50 dark:text-stone-400';

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-8">
      <nav className="mb-2 text-xs text-stone-500 dark:text-stone-400">
        <Link href="/library" className="hover:underline">Library</Link> · {def.label}
      </nav>
      <h1 className="mb-5 font-display text-3xl font-medium tracking-tight text-stone-900 dark:text-stone-100">{def.label}</h1>

      {/* The SAME selection drives the search and the work list below. One source of truth (the
          URL), so a lit chip can never mean two different things on one screen.
          Historians leads with the STUDY ENTRANCE instead (order 2026-08-20-historians-study-
          entrance): the question routes into History mode, and the classic body-text search
          survives behind its exact-phrase reveal. Other catalogs keep the search box — they
          have no History-mode equivalent to route into. */}
      {catalog === 'historians' ? (
        <StudyEntrance catalog={catalog} label={def.label} traditions={selected} />
      ) : (
        <CatalogSearch catalog={catalog} label={def.label} traditions={selected} />
      )}

      {/* aria-current, NOT aria-pressed. These chips are anchors — implicit role `link` — and
          aria-pressed is defined only on role `button`, so the lit state was announced by nothing
          and axe flags it as aria-allowed-attr (2026-08-02 audit). aria-current is valid on a link
          and says the thing that is actually true: this is the filter you are looking at. */}
      {def.subFilters && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            href={hrefWith({ sub: undefined })}
            aria-current={!subFilter ? 'true' : undefined}
            className={`${chip} ${!subFilter ? on : off}`}
          >
            All
          </Link>
          {Object.keys(def.subFilters).map((k) => (
            <Link
              key={k}
              href={hrefWith({ sub: k })}
              aria-current={subFilter === k ? 'true' : undefined}
              className={`${chip} ${subFilter === k ? on : off}`}
            >
              {k[0]!.toUpperCase() + k.slice(1)}
            </Link>
          ))}
        </div>
      )}

      {traditions.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Link
            href={hrefWith({ traditions: [] })}
            aria-current={selected.length === 0 ? 'true' : undefined}
            className={`${chip} ${selected.length === 0 ? on : off}`}
          >
            All traditions
          </Link>
          {traditions.map((t) => (
            <Link
              key={t.tradition}
              href={hrefToggling(t.tradition)}
              aria-current={selectedSet.has(t.tradition) ? 'true' : undefined}
              className={`${chip} ${selectedSet.has(t.tradition) ? on : off}`}
            >
              {t.tradition} <span className="ml-1 tabular-nums text-stone-500 dark:text-stone-400">{t.works}</span>
            </Link>
          ))}
        </div>
      )}

      {works.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {page > 0 ? 'No works on this page.' : 'No works here yet.'}
        </p>
      ) : (
        <>
        {/* The count makes the page cap VISIBLE. Without it a capped list reads as a complete one,
            which is the silent-truncation shape this repo's watchlist names. */}
        {/* WHAT THE + DOES, said once and visibly. Each + already carries an aria-label and a
            `title`, so a screen reader and a hovering mouse were both told — but `title` is a
            hover tooltip, and touch has no hover, so on a phone the control was a bare glyph
            with no explanation anywhere (MASTER.md UX-2). Said here rather than as a visible
            label on every row: the answer is the same twenty times down the page, and twenty
            copies of it is how a work list stops looking like a reading surface. */}
        <p className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
          <span>
            {total <= PAGE_SIZE
              ? `${total}${totalCapped ? '+' : ''} item${total === 1 ? '' : 's'}`
              : `Showing ${firstShown}–${lastShown} of ${total}${totalCapped ? '+' : ''}`}
          </span>
          <span aria-hidden>·</span>
          <span>Tap a work to read it, or + to open it beside what is on your desk.</span>
        </p>
        {/* PRD §5 Library catalog rows: full-width, hairline-separated, no cards — 17px
            Literata title, 11px Source Sans ink-wash metadata, unit count right in tabular
            figures. */}
        <ul className="border-y edge">
          {works.map((w) => (
            <li key={w.slug} className="flex items-stretch gap-2 border-b edge last:border-b-0">
              <Link
                href={`/work/${w.slug}`}
                // min-w-0: without it this flex item's automatic minimum is the UNWRAPPED title
                // width (truncate sets nowrap), so long-titled rows grew past the container and
                // every + landed at a different x. One class is the whole uniformity fix.
 className="group flex min-h-[44px] min-w-0 flex-1 items-center justify-between gap-3 py-3 transition-colors ease-gentle hover:bg-accent-50/40 dark:hover:bg-accent-950/20"
              >
                <span className="min-w-0">
                  {/* `title` because the line above it TRUNCATES. `truncate` cuts with an ellipsis
                      and puts the rest of the string nowhere — at 768px "The Complete Works of
                      Thomas Manton, Volume 3" and Volume 4 are two rows a reader cannot tell
                      apart, since the part that identifies them is the part cut off (QA A094).
                      The tooltip goes on the truncating element rather than on the whole row, so
                      it appears where the text a reader is squinting at actually is. It does not
                      touch the link's accessible name: name-from-contents wins over `title`, and
                      the contents are unchanged. */}
                  <span title={w.title} className="block truncate font-scripture text-[17px] text-stone-900 group-hover:text-accent-800 dark:text-stone-100 dark:group-hover:text-accent-300">{w.title}</span>
                  <span className="block truncate text-micro uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    {w.author ?? 'Unattributed'}
                    {w.tradition ? ` · ${w.tradition}` : ''}
                    {/* the register label: a reader must always be able to tell what kind of work this is */}
                    {` · ${w.sourceType}`}
                  </span>
                </span>
                <span className="shrink-0 text-micro tabular-nums text-stone-500 dark:text-stone-400">{w.units}</span>
              </Link>
              {/* Open this work beside what is already on the desk. */}
              <Link
                href={deskHrefFor(w.slug)}
                aria-label={`Add ${w.title} to your desk`}
                title="Add to desk"
                className="my-2 flex min-h-[44px] w-11 shrink-0 items-center justify-center border border-dashed border-stone-300 text-stone-500 dark:text-stone-400 hover:border-accent-400 hover:text-accent-600 dark:border-stone-700 dark:hover:border-accent-500"
              >
                +
              </Link>
            </li>
          ))}
        </ul>

        {(hasPrev || hasNext) && (
          <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-3">
            {hasPrev ? (
              <Link href={hrefPage(page - 1)} rel="prev" className={`${chip} ${off}`}>← Previous</Link>
            ) : (
              <span />
            )}
            <span className="text-xs tabular-nums text-stone-400">
              Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
            </span>
            {hasNext ? (
              <Link href={hrefPage(page + 1)} rel="next" className={`${chip} ${off}`}>Next →</Link>
            ) : (
              <span />
            )}
          </nav>
        )}
        </>
      )}
    </div>
  );
}
