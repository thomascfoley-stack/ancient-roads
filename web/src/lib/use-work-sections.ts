'use client';

// The Book Reader's section-page store (design §2): a windowed, keyset-paginated walk over
// GET /api/work/[slug]/sections. Two invariants live here and are tested in
// test/invariants/work-reader-paging.test.tsx:
//   * RESUME — the initial fetch requests `after = pageAfterContaining(savedOrdinal)`, i.e.
//     the page that CONTAINS the saved ordinal (never an offset page number).
//   * KEYSET — every subsequent forward fetch requests `after = last rendered ordinal`;
//     backward fetches prepend the page ending just before the first loaded ordinal.
// A 3,448-section work is therefore never one response and never offset-paginated.

import { useCallback, useEffect, useRef, useState } from 'react';
import { WORK_READER_PAGE_LIMIT, pageAfterContaining } from './work-reader';
import type { WorkSectionRow, WorkSectionsPage } from './work';

export type BusyDirection = 'initial' | 'prev' | 'next' | null;

export interface WorkSectionPagesState {
  /** All loaded sections, ordinal-ascending (the union of fetched pages). */
  sections: WorkSectionRow[];
  firstOrdinal: number | null;
  lastOrdinal: number | null;
  /** A page exists before the first loaded ordinal (ordinals are 1-based). */
  hasPrev: boolean;
  /** The work continues past the last loaded ordinal (the route's nextAfter was non-null). */
  hasNext: boolean;
  busy: BusyDirection;
  error: string | null;
}

const INITIAL_STATE: WorkSectionPagesState = {
  sections: [],
  firstOrdinal: null,
  lastOrdinal: null,
  hasPrev: false,
  hasNext: false,
  busy: null,
  error: null,
};

async function fetchPage(slug: string, after: number): Promise<WorkSectionsPage> {
  const res = await fetch(
    `/api/work/${encodeURIComponent(slug)}/sections?after=${after}&limit=${WORK_READER_PAGE_LIMIT}`,
  );
  if (!res.ok) {
    throw new Error(`GET /api/work/${slug}/sections?after=${after} failed with ${res.status}`);
  }
  return (await res.json()) as WorkSectionsPage;
}

export function useWorkSectionPages(slug: string) {
  const [state, setState] = useState<WorkSectionPagesState>(INITIAL_STATE);
  // A render-fresh mirror so the load callbacks read current state from stable closures.
  const stateRef = useRef(state);
  stateRef.current = state;
  // One fetch in flight at a time — scroll-driven prefetch must never pile up requests.
  const inflight = useRef<Promise<WorkSectionsPage> | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** (Re)start the walk at the page containing `ordinal` (null → the work's first page). */
  const loadInitial = useCallback(
    async (containingOrdinal: number | null): Promise<WorkSectionsPage | null> => {
      if (inflight.current) return null;
      const after = containingOrdinal !== null ? pageAfterContaining(containingOrdinal) : 0;
      setState((s) => ({ ...s, busy: 'initial', error: null }));
      const p = fetchPage(slug, after);
      inflight.current = p;
      try {
        const page = await p;
        if (alive.current) {
          setState({
            sections: page.sections,
            firstOrdinal: page.sections[0]?.ordinal ?? null,
            lastOrdinal: page.sections[page.sections.length - 1]?.ordinal ?? null,
            hasPrev: (page.sections[0]?.ordinal ?? 1) > 1,
            hasNext: page.nextAfter !== null,
            busy: null,
            error: null,
          });
        }
        return page;
      } catch (e) {
        if (alive.current) {
          setState((s) => ({
            ...s,
            busy: null,
            error: e instanceof Error ? e.message : 'Failed to load sections.',
          }));
        }
        return null;
      } finally {
        if (inflight.current === p) inflight.current = null;
      }
    },
    [slug],
  );

  /** Append the next page — KEYSET: requested `after = last rendered ordinal`. */
  const loadNext = useCallback(async (): Promise<WorkSectionsPage | null> => {
    const s = stateRef.current;
    if (inflight.current || !s.hasNext || s.lastOrdinal === null) return null;
    const after = s.lastOrdinal;
    setState((prev) => ({ ...prev, busy: 'next', error: null }));
    const p = fetchPage(slug, after);
    inflight.current = p;
    try {
      const page = await p;
      if (alive.current) {
        setState((prev) => {
          // Keyset guarantees non-overlap; the filter is a belt-and-suspenders against a
          // route regression duplicating the boundary ordinal into both pages.
          const fresh = page.sections.filter((n) => prev.lastOrdinal === null || n.ordinal > prev.lastOrdinal);
          const merged = [...prev.sections, ...fresh];
          return {
            ...prev,
            sections: merged,
            lastOrdinal: merged[merged.length - 1]?.ordinal ?? prev.lastOrdinal,
            hasNext: page.nextAfter !== null,
            busy: null,
            error: null,
          };
        });
      }
      return page;
    } catch (e) {
      if (alive.current) {
        setState((prev) => ({
          ...prev,
          busy: null,
          error: e instanceof Error ? e.message : 'Failed to load sections.',
        }));
      }
      return null;
    } finally {
      if (inflight.current === p) inflight.current = null;
    }
  }, [slug]);

  /** Prepend the page immediately before the first loaded ordinal (resume lands mid-work;
   *  scrolling up must be able to reach what came before). Still keyset: the request is
   *  `after = firstOrdinal - 1 - PAGE`, then we keep only rows strictly before firstOrdinal
   *  (ordinal gaps could otherwise duplicate the boundary row). */
  const loadPrev = useCallback(async (): Promise<WorkSectionsPage | null> => {
    const s = stateRef.current;
    if (inflight.current || !s.hasPrev || s.firstOrdinal === null) return null;
    const after = Math.max(0, s.firstOrdinal - 1 - WORK_READER_PAGE_LIMIT);
    setState((prev) => ({ ...prev, busy: 'prev', error: null }));
    const p = fetchPage(slug, after);
    inflight.current = p;
    try {
      const page = await p;
      if (alive.current) {
        setState((prev) => {
          const fresh = page.sections.filter((n) => prev.firstOrdinal === null || n.ordinal < prev.firstOrdinal);
          const merged = [...fresh, ...prev.sections];
          return {
            ...prev,
            sections: merged,
            firstOrdinal: merged[0]?.ordinal ?? prev.firstOrdinal,
            hasPrev: (merged[0]?.ordinal ?? 1) > 1,
            busy: null,
            error: null,
          };
        });
      }
      return page;
    } catch (e) {
      if (alive.current) {
        setState((prev) => ({
          ...prev,
          busy: null,
          error: e instanceof Error ? e.message : 'Failed to load sections.',
        }));
      }
      return null;
    } finally {
      if (inflight.current === p) inflight.current = null;
    }
  }, [slug]);

  return { ...state, loadInitial, loadNext, loadPrev };
}
