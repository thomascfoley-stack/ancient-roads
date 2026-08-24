'use client';

// Search-within-a-catalog (design §10.2). Hits GET /api/search/works with the catalog fence
// applied server-side — the fence is NOT a client concern, because a client that forgot it would
// silently widen a fenced search into a cross-corpus one and breach the register wall.
//
// Results are reading UNITS, not chunks (searchSections dedupes), so a hit means "this sermon /
// chapter", and the deep link goes to that unit's first section.
//
// THE TRADITION FILTER (2026-08-01). The API has accepted a tradition filter since it was written;
// this component never sent one, so the filter was unreachable from the search box while the chips
// above it filtered only the work list. The two now read the SAME selection — it lives in the URL,
// owned by the page, and is passed down here. One source of truth, so the list and the search can
// never disagree about what a lit chip means.
//
// A REJECTED REQUEST MUST NOT LOOK LIKE AN EMPTY ONE. The previous version caught every error and
// set `{results: [], total: 0}`, which renders as "No matches." So a 400 from a bad filter — the
// exact failure a filter change would introduce — was indistinguishable from an honest zero. That
// is the "unearned green" shape in UI form: the screen reports a clean result for a query the
// server refused. Errors now render as an error.

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/api-error-message';
import Link from 'next/link';
import type { CatalogId } from '@/lib/catalog';
import { sanitizeSnippet } from '@/lib/snippet';
import type { SectionSearchResult } from '@/lib/search-sections';

// PAGE_SIZE matches the fixed `limit` this component always sent before pagination existed — the
// first page's behavior is unchanged. Load More appends via `offset`, which /api/search/works has
// accepted since it was written (search-sections.ts); only this component never asked for more
// than page one. Same "the API already does this, the UI just never asked" shape as the desk-pane
// slug work.
const PAGE_SIZE = 25;

type Page = { results: SectionSearchResult[]; total: number; totalCapped: boolean };
type State = { kind: 'ok'; page: Page } | { kind: 'error'; message: string };
function resultKey(r: SectionSearchResult): string {
  return `${r.slug}#${r.ordinal}`;
}

export function CatalogSearch({
  catalog,
  label,
  traditions = [],
}: {
  catalog: CatalogId;
  label: string;
  /** The active tradition selection, owned by the page URL. Empty means unfiltered. */
  traditions?: readonly string[];
}) {
  const [q, setQ] = useState('');
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const seq = useRef(0);

  // Stable key for the selection, so the re-run effect below depends on the VALUES rather than on
  // the array identity a server component hands us fresh on every render (which would loop).
  const tradKey = [...traditions].sort().join(',');

  // `offset` drives BOTH a fresh search (0, replaces `state`) and Load More (results.length so
  // far, appends). One function for both, distinguished by the offset, keeps "what a page looks
  // like" defined in exactly one place.
  const run = useCallback(
    async (query: string, offset: number) => {
      const term = query.trim();
      if (!term) {
        setState(null);
        return;
      }
      const mine = ++seq.current;
      if (offset === 0) setBusy(true);
      else setLoadingMore(true);
      try {
        const params = new URLSearchParams({ q: term, catalog, limit: String(PAGE_SIZE), offset: String(offset) });
        // One repeated param per value. `multiParam` on the route also accepts a comma-joined
        // form; repeating is used here because a tradition containing a comma would corrupt the
        // joined form and silently drop a filter.
        for (const t of tradKey ? tradKey.split(',') : []) params.append('tradition', t);

        const res = await fetch(`/api/search/works?${params.toString()}`);
        if (!res.ok) {
          // Surface it. Do NOT fall through to an empty result set.
          // D28: this route answers its OWN 400s as { error: "string" }, but the shared
          // publicReadThrottle at the top of the same route answers 429 with the apiError
          // envelope { error: { code, message } }. Reading `body.error` blindly coerced the
          // object and showed the reader "[object Object]" in place of the throttle copy.
          // Dual-shape read, same as my-works.tsx:147.
          const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
          throw new Error(errorMessage(body, `search failed (${res.status})`));
        }
        const page = (await res.json()) as Page;
        if (mine !== seq.current) return;
        setState((prev) => {
          const prior = offset > 0 && prev?.kind === 'ok' ? prev.page.results : [];
          const seen = new Set(prior.map(resultKey));
          const results = [...prior, ...page.results.filter((r) => !seen.has(resultKey(r)))];
          return { kind: 'ok', page: { results, total: page.total, totalCapped: page.totalCapped } };
        });
      } catch (err) {
        if (mine === seq.current) {
          setState({ kind: 'error', message: err instanceof Error ? err.message : 'search failed' });
        }
      } finally {
        if (mine === seq.current) {
          setBusy(false);
          setLoadingMore(false);
        }
      }
    },
    [catalog, tradKey],
  );

  // Re-run from the top when the filter changes, so results can never be stale against the lit
  // chips — a filter change always replaces (offset 0), never appends. Guarded on a non-empty
  // query: toggling chips with an empty box must not fire a search.
  const submitted = useRef('');
  useEffect(() => {
    if (submitted.current) void run(submitted.current, 0);
  }, [tradKey, run]);

  const loadMore = useCallback(() => {
    if (state?.kind !== 'ok' || busy || loadingMore) return;
    void run(submitted.current, state.page.results.length);
  }, [run, state, busy, loadingMore]);

  return (
    <div className="mb-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitted.current = q.trim();
          void run(q, 0);
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
          /* text-base (16px) so iOS does not zoom the viewport on focus.
             No focus:outline-none — the global gold :focus-visible ring is the focus state
             (a `focus:border-*` utility would lose to the unlayered .edge hairline anyway). */
 className="min-h-[44px] flex-1 border edge bg-transparent px-4 text-base text-stone-800 placeholder:text-stone-500 dark:placeholder:text-stone-400 dark:text-stone-100"
        />
        <button
          type="submit"
          /* PRD §6 primary CTA: 1px ink hairline, transparent, fills to ink on hover. */
          className="min-h-[44px] shrink-0 border border-stone-900 px-5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
        >
          Search
        </button>
      </form>

      {/* Tell the reader what the search is scoped to, so a zero-result page is legible. */}
      {traditions.length > 0 && (
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
          Filtered to <b className="font-semibold text-stone-700 dark:text-stone-200">{[...traditions].sort().join(', ')}</b>
        </p>
      )}

      {busy && <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">Searching…</p>}

      {state?.kind === 'error' && !busy && (
        <p role="alert" className="mt-3 rounded-xl border border-red-300/60 bg-red-50/60 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          Search failed: {state.message}
        </p>
      )}

      {state?.kind === 'ok' && !busy && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">
            {state.page.total === 0
              ? 'No matches.'
              : `${state.page.total}${state.page.totalCapped ? '+' : ''} match${state.page.total === 1 ? '' : 'es'}`}
          </p>
          <ul className="border-y edge">
            {state.page.results.map((r) => (
              <li key={`${r.slug}#${r.ordinal}`} className="border-b edge last:border-b-0">
                <Link
                  href={`/work/${r.slug}#s${r.ordinal}`}
 className="group block py-4 transition-colors ease-gentle hover:bg-accent-50/40 dark:hover:bg-accent-950/20"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-scripture text-[17px] text-stone-900 group-hover:text-accent-800 dark:text-stone-100 dark:group-hover:text-accent-300">{r.title}</span>
                    {/* the register label — the wall requires the reader can always tell what this is */}
                    <span className="shrink-0 text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">{r.sourceType}</span>
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
                    {r.tradition && <span className="text-stone-500 dark:text-stone-400"> · {r.tradition}</span>}
                    {r.heading && <span className="text-stone-500 dark:text-stone-400"> · {r.heading}</span>}
                  </span>
                  <span
                    className="mt-1 block text-sm leading-relaxed text-stone-600 [&_mark]:bg-accent-100 [&_mark]:text-stone-900 dark:text-stone-300 dark:[&_mark]:bg-accent-900/60 dark:[&_mark]:text-stone-100"
                    /* ts_headline output: corpus text with <mark> around the hit. Server-generated
                       from the stored body, never model output — but ts_headline does NOT escape the
                       body, so sanitize (escape all, restore only <mark>) before rendering. */
                    dangerouslySetInnerHTML={{ __html: sanitizeSnippet(r.snippet) }}
                  />
                </Link>
              </li>
            ))}
          </ul>

          {state.page.results.length < state.page.total && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                /* PRD §6 secondary: ink-wash hairline + label, fills on hover. No shadow. */
                className="min-h-[44px] border border-stone-500 bg-transparent px-6 font-sans text-sm font-medium text-stone-600 transition-colors ease-gentle hover:bg-stone-500 hover:text-stone-50 disabled:opacity-40 dark:border-stone-400 dark:text-stone-300 dark:hover:bg-stone-400 dark:hover:text-stone-950"
              >
                {loadingMore
                  ? 'Loading…'
                  : `Load more (${state.page.results.length} of ${state.page.total}${state.page.totalCapped ? '+' : ''})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
