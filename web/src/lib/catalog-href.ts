// THE CATALOG PAGE'S URL, BUILT IN ONE PLACE.
//
// Why this is a module and not four template literals inside the page.
//
// The catalog page's URL carries three independent facets: the sub-filter (`?sub=`), the tradition
// multi-select (`?tradition=` repeated), and the OPEN DESK (`?desk=`, so that the + button on a
// work appends to the panes already open instead of replacing them). Each was added by a different
// change, and each new facet was added to the builders its author was looking at.
//
// The result, found by the 2026-08-02 audit: the desk carry was added to the page and to the +
// button, but not to the tradition toggle, not to the two sub-filter links and not to "All
// traditions". So the carry worked until the reader touched any filter, at which point a
// three-pane desk silently became a one-pane desk — recoverable only with the back button, and
// invisible until it had already happened. The toggle's own comment claimed it was "preserving
// everything else in the URL"; that had been true when it was written and nothing made it stay
// true.
//
// A hand-maintained list of facets that nothing enforces is this repo's most-repeated defect. The
// structural answer is not "remember to update all four" — it is that there is one function, it
// takes the WHOLE state, and adding a facet is a change to a single line that every link inherits.
// `catalogHrefTest` pins that: it fails if any facet stops round-tripping.

import type { CatalogId } from './catalog-defs';

export interface CatalogUrlState {
  /** The active sub-filter, or undefined for the whole catalog. */
  sub?: string;
  /** The tradition multi-select. Empty means unfiltered. */
  traditions?: readonly string[];
  /** The encoded desk, carried verbatim so `+` appends rather than replacing. */
  desk?: string;
  /**
   * The 0-based page of the work list. Undefined/0 is the first page and is never serialised.
   *
   * UNLIKE the other facets, this one is deliberately DROPPED by every FILTER link — see
   * `withFacet`. A filter narrows the result set, so carrying "page 4" through a chip click lands
   * the reader on an empty page of a shorter list, which reads as "this filter has no works". The
   * search box resets to offset 0 on a filter change for the same reason; the two surfaces on this
   * page now agree. Paging links carry every OTHER facet, so a page change never drops a filter.
   */
  page?: number;
}

/**
 * The canonical catalog-page URL for a complete facet state.
 *
 * Traditions are sorted so that the same selection always yields the same URL — two chips clicked
 * in a different order must not produce two different history entries or two cache keys.
 */
export function catalogHref(catalog: CatalogId, state: CatalogUrlState = {}): string {
  const qs = new URLSearchParams();
  if (state.sub) qs.set('sub', state.sub);
  for (const t of [...(state.traditions ?? [])].sort()) qs.append('tradition', t);
  if (state.desk) qs.set('desk', state.desk);
  if (state.page && state.page > 0) qs.set('page', String(state.page + 1)); // 1-based in the URL
  const q = qs.toString();
  return `/library/${catalog}${q ? `?${q}` : ''}`;
}

/**
 * Change one FILTER facet, resetting the page. Every filter link on the page goes through this, so
 * "narrowing the list sends you back to its first page" is a property of the builder rather than
 * something each of four call sites has to remember — the failure mode this module exists to stop.
 */
export function withFacet(state: CatalogUrlState, over: Partial<CatalogUrlState>): CatalogUrlState {
  return { ...state, ...over, page: 0 };
}

/**
 * Toggle one tradition on or off within an existing state, leaving every other facet alone.
 * Returns the next STATE, not a URL, so the caller decides what to do with it.
 */
export function toggleTradition(state: CatalogUrlState, tradition: string): CatalogUrlState {
  const next = new Set(state.traditions ?? []);
  if (next.has(tradition)) next.delete(tradition);
  else next.add(tradition);
  return withFacet(state, { traditions: [...next] });
}
