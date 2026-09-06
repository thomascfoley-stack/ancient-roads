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
  // A one-deep queue for a `loadInitial` intent that arrived while `inflight` was held by
  // another load (loadNext/loadPrev/loadInitial). `loadInitial` is the JUMP primitive — the
  // reader's seek effect (TOC/Continue/hash-nav) and the desk pane's `jumpTo` both fire it and
  // both STAMP their caller-side state (a seek nonce / a window reset) before the dispatch and
  // trust that a fetch actually happens. The hook's old `return null`-on-collision was
  // indistinguishable from "ran and returned nothing", so a seek landing mid-prefetch was
  // silently dropped: the nonce was consumed, no fetch issued, no retry scheduled (the seek
  // effect re-runs on the next `sections` change but exits on the stamped nonce). The queue
  // makes the deferred dispatch INEVITABLE: when the in-flight settles, the pending intent
  // fires before `busy` clears and before any rAF can re-open the prefetch window. `loadNext`/
  // `loadPrev` collisions stay silent by design — their callers either retry on their own clock
  // (the chase rAF re-issues `loadNext` once `inflight` clears) or by a re-click (the manual
  // "Read more"/"Earlier" buttons), neither of which trusts a single dispatch the way a seek does.
  const pendingInitial = useRef<{ containingOrdinal: number | null } | null>(null);
  // `drainInitial` is stable but reads the LATEST `loadInitial` through this ref, so it stays
  // correct across slug changes (which recreate `loadInitial`) without a dep cycle.
  const loadInitialRef = useRef<((containingOrdinal: number | null) => Promise<WorkSectionsPage | null>) | null>(null);
  const drainInitial = useCallback(() => {
    const pending = pendingInitial.current;
    if (pending === null) return;
    pendingInitial.current = null;
    void loadInitialRef.current?.(pending.containingOrdinal);
  }, []);
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
      if (inflight.current) {
        // A seek/Continue/TOC-jump arriving mid-prefetch: the caller (the reader's seek effect,
        // the desk pane's jumpTo) has already stamped its nonce / reset its window and trusts a
        // fetch happened. Queue the intent and drain it the moment the in-flight settles — do
        // NOT silently swallow it (the old `return null` was indistinguishable from "ran and
        // returned nothing", which dropped the seek with no fetch and no retry).
        pendingInitial.current = { containingOrdinal };
        return null;
      }
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
        drainInitial();
      }
    },
    [slug, drainInitial],
  );
  // Keep the drain's dispatch pointing at the latest `loadInitial` (it changes on `slug`).
  loadInitialRef.current = loadInitial;

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
      drainInitial();
    }
  }, [slug, drainInitial]);

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
      drainInitial();
    }
  }, [slug, drainInitial]);

  return { ...state, loadInitial, loadNext, loadPrev };
}
