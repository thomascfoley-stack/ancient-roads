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
import { catalogHref, toggleTradition, type CatalogUrlState } from '@/lib/catalog-href';
import { decodeDesk, deskHref as deskHrefWith, withPane } from '@/lib/desk';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ catalog: string }> }) {
  const { catalog } = await params;
  return { title: isCatalogId(catalog) ? CATALOGS[catalog].label : 'Library' };
}

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ catalog: string }>;
  searchParams: Promise<{ sub?: string; tradition?: string | string[]; desk?: string }>;
}) {
  const { catalog } = await params;
  if (!isCatalogId(catalog)) notFound();
  const { sub, tradition, desk } = await searchParams;
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

  const [works, traditions] = await Promise.all([
    listCatalogWorks({ catalog, subFilter, traditions: selected, limit: 100 }),
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
  const urlState: CatalogUrlState = { sub: subFilter, traditions: selected, desk };
  const hrefWith = (over: Partial<CatalogUrlState>): string => catalogHref(catalog, { ...urlState, ...over });
  const hrefToggling = (t: string): string => catalogHref(catalog, toggleTradition(urlState, t));

  const chip =
    'inline-flex min-h-[36px] items-center rounded-full border px-3 text-xs transition-colors';
  const on = 'border-accent-400 bg-accent-50 text-accent-800 dark:bg-accent-950/40 dark:text-accent-200';
  const off = 'border-stone-200/70 text-stone-600 hover:bg-accent-50/50 dark:border-stone-800 dark:text-stone-400';

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-8">
      <nav className="mb-2 text-xs text-stone-400">
        <Link href="/library" className="hover:underline">Library</Link> · {def.label}
      </nav>
      <h1 className="mb-5 font-scripture text-2xl text-stone-800 dark:text-stone-100">{def.label}</h1>

      {/* The SAME selection drives the search and the work list below. One source of truth (the
          URL), so a lit chip can never mean two different things on one screen. */}
      <CatalogSearch catalog={catalog} label={def.label} traditions={selected} />

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
              {t.tradition} <span className="ml-1 tabular-nums text-stone-400">{t.works}</span>
            </Link>
          ))}
        </div>
      )}

      {works.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">No works here yet.</p>
      ) : (
        <ul className="space-y-2">
          {works.map((w) => (
            <li key={w.slug} className="flex items-stretch gap-2">
              <Link
                href={`/work/${w.slug}`}
                // min-w-0: without it this flex item's automatic minimum is the UNWRAPPED title
                // width (truncate sets nowrap), so long-titled rows grew past the container and
                // every + landed at a different x. One class is the whole uniformity fix.
                className="flex min-h-[44px] min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-stone-200/70 px-4 py-3 hover:bg-accent-50/50 dark:border-stone-800 dark:hover:bg-accent-950/20"
              >
                <span className="min-w-0">
                  <span className="block truncate font-scripture text-stone-800 dark:text-stone-100">{w.title}</span>
                  <span className="block truncate text-xs text-stone-500 dark:text-stone-400">
                    {w.author ?? '—'}
                    {w.tradition ? ` · ${w.tradition}` : ''}
                    {/* the register label: a reader must always be able to tell what kind of work this is */}
                    {` · ${w.sourceType}`}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-stone-400">{w.units}</span>
              </Link>
              {/* Open this work beside what is already on the desk. */}
              <Link
                href={deskHrefFor(w.slug)}
                aria-label={`Add ${w.title} to your desk`}
                title="Add to desk"
                className="flex min-h-[44px] w-11 shrink-0 items-center justify-center rounded-xl border border-dashed border-stone-300 text-stone-400 hover:border-accent-400 hover:text-accent-600 dark:border-stone-700 dark:hover:border-accent-500"
              >
                +
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
