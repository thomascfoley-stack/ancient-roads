'use client';

// Search-within-a-catalog (design §10.2). Hits GET /api/search/works with the catalog fence
// applied server-side — the fence is NOT a client concern, because a client that forgot it would
// silently widen a fenced search into a cross-corpus one and breach the register wall.
//
// Results are reading UNITS, not chunks (searchSections dedupes), so a hit means "this sermon /
// chapter", and the deep link goes to that unit's first section.

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import type { CatalogId } from '@/lib/catalog';
import type { SectionSearchResult } from '@/lib/search-sections';

export function CatalogSearch({ catalog, label }: { catalog: CatalogId; label: string }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState<{ results: SectionSearchResult[]; total: number; totalCapped: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const run = useCallback(
    async (query: string) => {
      const term = query.trim();
      if (!term) {
        setState(null);
        return;
      }
      const mine = ++seq.current;
      setBusy(true);
      try {
        const res = await fetch(`/api/search/works?q=${encodeURIComponent(term)}&catalog=${catalog}&limit=25`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { results: SectionSearchResult[]; total: number; totalCapped: boolean };
        if (mine === seq.current) setState(data); // ignore out-of-order responses
      } catch {
        if (mine === seq.current) setState({ results: [], total: 0, totalCapped: false });
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    },
    [catalog],
  );

  return (
    <div className="mb-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(q);
        }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="search"
          inputMode="search"
          placeholder={`Search ${label.toLowerCase()}…`}
          aria-label={`Search ${label}`}
          /* text-base (16px) so iOS does not zoom the viewport on focus */
          className="min-h-[44px] flex-1 rounded-full border border-stone-200/70 bg-transparent px-4 text-base text-stone-800 placeholder:text-stone-400 focus:border-accent-400 focus:outline-none dark:border-stone-800 dark:text-stone-100"
        />
        <button
          type="submit"
          className="min-h-[44px] shrink-0 rounded-full bg-accent-700 px-5 text-sm font-semibold text-stone-50 hover:bg-accent-800 dark:bg-accent-500 dark:hover:bg-accent-400"
        >
          Search
        </button>
      </form>

      {busy && <p className="mt-3 text-sm text-stone-400">Searching…</p>}

      {state && !busy && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">
            {state.total === 0
              ? 'No matches.'
              : `${state.total}${state.totalCapped ? '+' : ''} match${state.total === 1 ? '' : 'es'}`}
          </p>
          <ul className="space-y-2">
            {state.results.map((r) => (
              <li key={`${r.slug}#${r.ordinal}`}>
                <Link
                  href={`/work/${r.slug}#s${r.ordinal}`}
                  className="block rounded-xl border border-stone-200/70 px-4 py-3 hover:bg-accent-50/50 dark:border-stone-800 dark:hover:bg-accent-950/20"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-scripture text-stone-800 dark:text-stone-100">{r.title}</span>
                    {/* the register label — the wall requires the reader can always tell what this is */}
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-stone-400">{r.sourceType}</span>
                  </span>
                  {/* WHO SAID IT. The snippet below is a QUOTATION from the corpus, and this
                      product's promise is that quotations are attributed (CLAUDE.md / PRINCIPLES
                      I1–I6). The API has always returned `author`; this card used to drop it, so a
                      hit on "Expositions of Holy Scripture" never revealed it was Maclaren. Search
                      is where attribution matters most — there is no surrounding page to infer the
                      voice from. Null (a psalter, a compiled work) degrades to an explicit marker,
                      never to a blank and never to the slug. */}
                  <span className="mt-0.5 block truncate text-xs text-stone-500 dark:text-stone-400">
                    {r.author ?? 'Unattributed'}
                    {r.heading && <span className="text-stone-400 dark:text-stone-500"> · {r.heading}</span>}
                  </span>
                  <span
                    className="mt-1 block text-sm leading-relaxed text-stone-600 [&_mark]:bg-accent-100 [&_mark]:text-stone-900 dark:text-stone-300 dark:[&_mark]:bg-accent-900/60 dark:[&_mark]:text-stone-100"
                    /* ts_headline output: corpus text with <mark> around the hit. Server-generated
                       from the stored body, never model output. */
                    dangerouslySetInnerHTML={{ __html: r.snippet }}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
