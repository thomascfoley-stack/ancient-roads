// A corpus catalog (design §10.2): Commentaries · Sermons · Hymns & Poetry. Work list + tradition
// facets + search-within-type; every work opens in the Book Reader.
//
// SERVER component. The catalog fence (which source_types this page may show) lives in
// lib/catalog.ts and is applied in SQL — never trusted from the URL. An unknown catalog is a 404,
// not a page that quietly shows everything: silently widening a fence is how the register wall
// gets breached in the UI while retrieval stays clean.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CATALOGS, catalogTraditions, isCatalogId, listCatalogWorks } from '@/lib/catalog';
import { CatalogSearch } from '@/components/catalog-search';
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
  const subFilter = sub && def.subFilters?.[sub] ? sub : undefined;

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

  /** The href that toggles one chip on or off, preserving everything else in the URL. */
  const hrefToggling = (t: string): string => {
    const next = new Set(selectedSet);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    const qs = new URLSearchParams();
    if (subFilter) qs.set('sub', subFilter);
    for (const v of [...next].sort()) qs.append('tradition', v);
    const s = qs.toString();
    return `/library/${catalog}${s ? `?${s}` : ''}`;
  };

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

      {def.subFilters && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Link href={`/library/${catalog}`} className={`${chip} ${!subFilter ? on : off}`}>All</Link>
          {Object.keys(def.subFilters).map((k) => (
            <Link key={k} href={`/library/${catalog}?sub=${k}`} className={`${chip} ${subFilter === k ? on : off}`}>
              {k[0]!.toUpperCase() + k.slice(1)}
            </Link>
          ))}
        </div>
      )}

      {traditions.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Link
            href={`/library/${catalog}${subFilter ? `?sub=${subFilter}` : ''}`}
            aria-pressed={selected.length === 0}
            className={`${chip} ${selected.length === 0 ? on : off}`}
          >
            All traditions
          </Link>
          {traditions.map((t) => (
            <Link
              key={t.tradition}
              href={hrefToggling(t.tradition)}
              aria-pressed={selectedSet.has(t.tradition)}
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
                className="flex min-h-[44px] flex-1 items-center justify-between gap-3 rounded-xl border border-stone-200/70 px-4 py-3 hover:bg-accent-50/50 dark:border-stone-800 dark:hover:bg-accent-950/20"
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
