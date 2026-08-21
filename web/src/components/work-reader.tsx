'use client';

// The Book Reader body (design §2/§10.1): a WINDOWED, keyset-paginated reading column over
// GET /api/work/[slug]/sections. A 3,448-section work never mounts all its sections — the
// active section renders with overscan (WINDOW_BEHIND/WINDOW_AHEAD); everything else
// collapses into two spacer divs sized from measured section heights. The next page fetches
// as the reader approaches the loaded tail (PREFETCH_AHEAD), always keyset
// (`after = last rendered ordinal` — see useWorkSectionPages).
//
// The Phase-1 selection popover mounts here: resolveTarget walks a selection up to the
// section's data-section-text container, exactly as VerseDisplay walks to data-verse-text.
// Highlight swatches paint a LOCAL color wash (Phase 2 has no section persistence — that is
// Phase 3's MIG-A); copy and Ask paths are fully live. onAddNote/onBookmark stay unwired, as
// they were for bookmarks in Phase 1 — the popover renders those buttons only when a handler
// exists.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { type HighlightRange } from '@/lib/highlight-range';
import { useTextAnnotation, type AnnotationTarget } from '@/lib/use-text-annotation';
import { useWorkSectionPages } from '@/lib/use-work-sections';
import { WORK_READER_PAGE_LIMIT, sectionLabel } from '@/lib/work-reader';
import type { WorkSource, WorkSectionRow } from '@/lib/work';
import { SelectionPopover } from './selection-popover';
import { WorkHeader } from './work-header';
import { WorkSection } from './work-section';

// Render window around the active section: 12 behind / 28 ahead ≈ 40 mounted sections max.
const WINDOW_BEHIND = 12;
const WINDOW_AHEAD = 28;
// Fetch the next page when the active section comes within this many of the loaded tail.
const PREFETCH_AHEAD = 15;
// First-paint spacer estimate, replaced by measured averages as sections render.
const EST_SECTION_HEIGHT = 320;

/** A navigation request from outside the reader (TOC drawer / Continue chip). `nonce`
 *  distinguishes repeated seeks to the same ordinal. */
export interface WorkReaderSeek {
  ordinal: number;
  scrollPct: number;
  nonce: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function WorkReader({
  slug,
  source,
  initialOrdinal,
  initialScrollPct,
  seek,
  signedIn,
  onOpenToc,
  onProgress,
  landingOrdinal = null,
}: {
  slug: string;
  source: WorkSource;
  /** Deep-link/resume target: the initial page fetch contains this ordinal. */
  initialOrdinal: number | null;
  /** Fraction of the initial section already read (resume restores mid-section). */
  initialScrollPct: number;
  seek: WorkReaderSeek | null;
  signedIn: boolean;
  onOpenToc: () => void;
  onProgress: (ordinal: number, scrollPct: number) => void;
  /** The section a DEEP LINK landed on — gets the gold landing marker (WorkSection `landed`).
   *  Null for saved-position restores and plain opens: resuming your own place needs no glow. */
  landingOrdinal?: number | null;
}) {
  const {
    sections,
    firstOrdinal,
    hasPrev,
    hasNext,
    busy,
    error,
    loadInitial,
    loadNext,
    loadPrev,
  } = useWorkSectionPages(slug);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  // Rendered section elements + their measured heights (for spacer sizing and window math).
  const sectionEls = useRef(new Map<number, HTMLElement>());
  const heights = useRef(new Map<number, number>());
  const avgHeight = useRef(EST_SECTION_HEIGHT);
  const [win, setWin] = useState({ start: 0, end: WINDOW_BEHIND + WINDOW_AHEAD });
  // Render-fresh mirrors so scroll/seek callbacks stay referentially stable.
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const winRef = useRef(win);
  winRef.current = win;
  const hasNextRef = useRef(hasNext);
  hasNextRef.current = hasNext;
  const errorRef = useRef(error);
  errorRef.current = error;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  // One-shot scroll restore: applied when the target ordinal is actually rendered.
  const pendingScroll = useRef<{ ordinal: number; scrollPct: number } | null>(
    initialOrdinal !== null ? { ordinal: initialOrdinal, scrollPct: initialScrollPct } : null,
  );
  // Prepend anchor: keeps the viewport glued to the same section across a loadPrev prepend.
  const prependAnchor = useRef<{ ordinal: number; top: number } | null>(null);
  const handledSeek = useRef(0);
  const frame = useRef(0);
  const lastReport = useRef({ ordinal: -1, t: 0 });

  // Local (unpersisted) highlight preview washes, keyed by section id.
  const [washes, setWashes] = useState<Map<string, HighlightRange[]>>(new Map());
  const router = useRouter();

  useEffect(() => {
    loadInitial(initialOrdinal);
  }, [loadInitial, initialOrdinal]);

  // ---- scrolling ---------------------------------------------------------------

  const getScroller = useCallback((): HTMLElement | Window => {
    // The app shell's <main> is the overflow container; plain-window scroll is the fallback
    // (tests, future chrome-free layouts).
    return rootRef.current?.closest('main') ?? window;
  }, []);

  const reportProgress = useCallback((ordinal: number, pct: number) => {
    const now = Date.now();
    if (ordinal !== lastReport.current.ordinal || now - lastReport.current.t > 120) {
      lastReport.current = { ordinal, t: now };
      onProgressRef.current(ordinal, pct);
    }
  }, []);

  // The active section = the first rendered section extending below the header line.
  // Drives the render window, prefetch, and the progress report. rAF-throttled from scroll.
  const updateActive = useCallback(() => {
    const list = sectionsRef.current;
    if (list.length === 0) return;
    const headerBottom = headerRef.current?.getBoundingClientRect().bottom ?? 0;
    const line = headerBottom + 4;

    let activeIdx = -1;
    let activeRect: DOMRect | null = null;
    let lastRenderedIdx = -1;
    for (let i = 0; i < list.length; i++) {
      const el = sectionEls.current.get(list[i]!.ordinal);
      if (!el) continue;
      lastRenderedIdx = i;
      const r = el.getBoundingClientRect();
      if (r.bottom > line) {
        activeIdx = i;
        activeRect = r;
        break;
      }
    }
    let chasing = false;
    if (activeIdx === -1) {
      // Every rendered section is above the line — a scrollbar drag/End-key jump went past
      // the window. Anchor on the last rendered section so the window shifts toward the
      // scroll position, and keep chasing (below) until rendered content catches up.
      if (lastRenderedIdx === -1) return; // nothing mounted — mid-restore, wait
      activeIdx = lastRenderedIdx;
      activeRect = sectionEls.current.get(list[activeIdx]!.ordinal)!.getBoundingClientRect();
      chasing = true;
    }

    const active = list[activeIdx]!;
    const pct =
      activeRect && activeRect.height > 0 ? clamp01((line - activeRect.top) / activeRect.height) : 0;
    reportProgress(active.ordinal, pct);

    const w = winRef.current;
    const size = w.end - w.start;
    const maxStart = Math.max(0, list.length - size);
    const start = Math.min(Math.max(activeIdx - WINDOW_BEHIND, 0), maxStart);
    const end = Math.min(list.length, start + size);
    let moved = false;
    if (start !== w.start || end !== w.end) {
      moved = true;
      winRef.current = { start, end };
      setWin({ start, end });
    }

    if (activeIdx >= list.length - PREFETCH_AHEAD) loadNext();

    // A jump fires few scroll events, so chase the scroll position across frames until the
    // window reaches it. Stop when the window can no longer move and no more content can
    // arrive (end of the work, or a failed fetch — never an idle rAF loop).
    if (chasing && (moved || (hasNextRef.current && !errorRef.current))) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        updateActive();
      });
    }
  }, [loadNext, reportProgress]);

  const onScroll = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      updateActive();
    });
  }, [updateActive]);

  useEffect(() => {
    const scroller = getScroller();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [getScroller, onScroll]);

  // ---- window bookkeeping (layout effects: measure, restore, anchor) -------------

  const registerEl = useCallback((ordinal: number, el: HTMLElement | null) => {
    if (el) sectionEls.current.set(ordinal, el);
    else sectionEls.current.delete(ordinal);
  }, []);

  useLayoutEffect(() => {
    let sum = 0;
    let n = 0;
    for (const [ordinal, el] of sectionEls.current) {
      const h = el.offsetHeight;
      if (h > 0) {
        heights.current.set(ordinal, h);
        sum += h;
        n++;
      }
    }
    if (n > 0) avgHeight.current = sum / n;
  });

  // Apply a pending restore/seek once its section is rendered.
  useLayoutEffect(() => {
    const pend = pendingScroll.current;
    if (!pend) return;
    const el = sectionEls.current.get(pend.ordinal);
    if (!el) return; // target not mounted yet — its page/window is still arriving
    pendingScroll.current = null;
    const headerBottom = headerRef.current?.getBoundingClientRect().bottom ?? 0;
    const targetTop = headerBottom + 8 - pend.scrollPct * el.offsetHeight;
    const scroller = getScroller();
    const dy = el.getBoundingClientRect().top - targetTop;
    if (scroller instanceof Window) scroller.scrollBy(0, dy);
    else scroller.scrollTop += dy;
  }, [sections, win, getScroller]);

  // After a prepend, keep the same section under the viewport and hold the window on it.
  useLayoutEffect(() => {
    const anchor = prependAnchor.current;
    if (!anchor) return;
    const idx = sections.findIndex((s) => s.ordinal === anchor.ordinal);
    if (idx === -1) return;
    prependAnchor.current = null;
    setWin((w) => ({ start: idx, end: Math.min(sections.length, idx + (w.end - w.start)) }));
    const el = sectionEls.current.get(anchor.ordinal);
    if (el) {
      const scroller = getScroller();
      const dy = el.getBoundingClientRect().top - anchor.top;
      if (scroller instanceof Window) scroller.scrollBy(0, dy);
      else scroller.scrollTop += dy;
    }
     
  }, [sections, getScroller]);

  // Re-evaluate the active section whenever content or the window changes (also the
  // initial progress report once the first page lands).
  useLayoutEffect(() => {
    updateActive();
  }, [sections, win, updateActive]);

  // ---- external seeks (TOC / Continue) -------------------------------------------

  useEffect(() => {
    if (!seek || seek.nonce === handledSeek.current) return;
    const list = sectionsRef.current;
    const idx = list.findIndex((s) => s.ordinal === seek.ordinal);
    if (idx === -1 && list.length === 0) return; // initial load still in flight; re-run on land
    handledSeek.current = seek.nonce;
    pendingScroll.current = { ordinal: seek.ordinal, scrollPct: seek.scrollPct };
    if (idx === -1) {
      loadInitial(seek.ordinal); // fetch the page containing the target
    } else {
      setWin((w) => {
        const size = w.end - w.start;
        const start = Math.min(Math.max(idx - WINDOW_BEHIND, 0), Math.max(0, list.length - size));
        return { start, end: Math.min(list.length, start + size) };
      });
    }
  }, [seek, sections, loadInitial]);

  // ---- selection popover (Phase-1 engine, section target) -------------------------

  const byId = useRef(new Map<string, WorkSectionRow>());
  byId.current = new Map(sections.map((s) => [String(s.id), s]));

  // Walk a selection boundary up to its section container — the VerseDisplay resolveTarget
  // contract, with dataset.sectionText in place of dataset.verseText. The canonical length
  // comes from the fetched section, not the DOM — sections.body stays the offset authority.
  const resolveTarget = useCallback((node: Node): AnnotationTarget | null => {
    let n: Node | null = node;
    while (n) {
      if (n instanceof HTMLElement && n.dataset.sectionText) {
        const section = byId.current.get(n.dataset.sectionText);
        if (!section) return null;
        return { kind: 'section', key: String(section.id), textLen: section.body.length, container: n };
      }
      n = n.parentNode;
    }
    return null;
  }, []);

  const { pending, dismiss } = useTextAnnotation(rootRef, resolveTarget);
  const pendingSection = pending ? byId.current.get(pending.key) : undefined;
  const pendingLocus = pendingSection
    ? sectionLabel(pendingSection)
    : '';

  // Phase 2: paint the color wash locally (soft wash behind the words, §10.1). Persisting
  // section highlights is Phase 3 (MIG-A makes highlights polymorphic).
  function highlightPending(color: string) {
    if (!pending) return;
    const { key, start, end } = pending;
    setWashes((prev) => {
      const next = new Map(prev);
      next.set(key, [...(next.get(key) ?? []), { start, end, color }]);
      return next;
    });
    dismiss();
  }

  // Hand the selection to /ask as a PREFILL (never auto-submit), attribution = author +
  // work + locus — never a host URL.
  function askPending() {
    if (!pending) return;
    const excerpt = pending.text.length > 220 ? `${pending.text.slice(0, 217)}…` : pending.text;
    const q = `What have commentators said about "${excerpt}" (${source.author}, ${source.title}${pendingLocus ? `, ${pendingLocus}` : ''})?`;
    dismiss();
    router.push(`/ask?q=${encodeURIComponent(q)}`);
  }

  // ---- render ---------------------------------------------------------------------

  function handleLoadPrev() {
    const list = sectionsRef.current;
    const first = list[win.start];
    const el = first ? sectionEls.current.get(first.ordinal) : undefined;
    if (first && el) {
      prependAnchor.current = { ordinal: first.ordinal, top: el.getBoundingClientRect().top };
    }
    loadPrev();
  }

  const estimateRange = (list: WorkSectionRow[]): number => {
    let h = 0;
    for (const s of list) h += heights.current.get(s.ordinal) ?? avgHeight.current;
    return h;
  };
  const visible = sections.slice(win.start, win.end);
  const topSpacer = estimateRange(sections.slice(0, win.start));
  const bottomSpacer =
    estimateRange(sections.slice(win.end)) + (hasNext ? WORK_READER_PAGE_LIMIT * avgHeight.current : 0);

  return (
    <div ref={rootRef}>
      <WorkHeader ref={headerRef} source={source} slug={slug} signedIn={signedIn} onOpenToc={onOpenToc} />

 {/* The reading column sits directly on the parchment page — PRD §3: hairlines and
            whitespace carry separation, so the bordered "page card" (edge + shadow) is gone.
            Width is the reader's measure (`.reading-measure`, default 84ch — owner direction
            2026-08-12), the SAME control the Bible reader follows; this was a hardcoded
            max-w-2xl, so the library read at one width and Scripture at another. */}
 <div className="reading-measure mx-auto my-6 px-6 pb-24 pt-12 sm:my-10 sm:px-14 sm:pt-16">
        {sections.length === 0 && busy === 'initial' && (
          <p className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">Loading…</p>
        )}
        {sections.length === 0 && error && (
          <div className="py-16 text-center">
            <p className="mb-3 text-sm text-stone-500 dark:text-stone-400">Couldn&rsquo;t load this work.</p>
            <button
              onClick={() => loadInitial(initialOrdinal)}
              className="min-h-[44px] border border-stone-900 px-5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
            >
              Try again
            </button>
          </div>
        )}

        {hasPrev && win.start === 0 && firstOrdinal !== null && (
          <div className="mb-6 text-center">
            <button
              onClick={handleLoadPrev}
              disabled={busy === 'prev'}
              className="min-h-[44px] border edge bg-transparent px-4 font-sans text-xs font-semibold text-stone-500 transition-colors ease-gentle hover:bg-stone-100 active:bg-stone-200 disabled:opacity-40 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              {busy === 'prev' ? 'Loading…' : '↑ Earlier in this work'}
            </button>
          </div>
        )}

        {/* Collapsed earlier sections (measured where known, average estimate otherwise). */}
        {topSpacer > 0 && <div style={{ height: topSpacer }} aria-hidden />}

        <div className="reading-scale font-scripture leading-[1.9] text-stone-800 dark:text-stone-200">
          {visible.map((s) => (
            <WorkSection key={s.id} section={s} spans={washes.get(String(s.id))} registerEl={registerEl} sourceType={source.source_type} landed={landingOrdinal !== null && s.ordinal === landingOrdinal} />
          ))}
        </div>

        {/* Collapsed later sections + an estimate for the unfetched remainder, so the
            scrollbar reflects roughly the whole work while pages stream in. */}
        {bottomSpacer > 0 && <div style={{ height: bottomSpacer }} aria-hidden />}

        {busy === 'next' && <p className="py-6 text-center text-sm text-stone-500 dark:text-stone-400">Loading…</p>}
        {sections.length > 0 && error && (
          <div className="py-6 text-center">
            <p className="mb-2 text-sm text-stone-500 dark:text-stone-400">Couldn&rsquo;t load the next page.</p>
            <button
              onClick={() => loadNext()}
              className="min-h-[44px] border edge bg-transparent px-4 font-sans text-xs font-semibold text-stone-500 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Try again
            </button>
          </div>
        )}
        {!hasNext && !error && sections.length > 0 && (
          <p className="py-10 text-center font-scripture text-sm italic text-stone-500 dark:text-stone-400">
            End of {source.title}
          </p>
        )}
      </div>

      {/* The shared Logos-style selection popover (Phase 1): floating card on md+, docked-low
          bar on mobile. onAddNote/onBookmark stay unwired until Phase 3 persistence. */}
      {pending && pendingSection && (
        <SelectionPopover
          pending={pending}
          contextLabel={`${source.author} · ${source.title} · ${pendingLocus}`}
          signedIn={signedIn}
          onHighlight={highlightPending}
          onAsk={askPending}
          // ADD TO STUDY. `pendingSection.id` is `sections.id` — the corpus key
          // `insertClippingFromSection` looks up (`lib/studies.ts:544`), which is why this
          // surface can offer the verb and the Bible reader cannot (see SelectionPopoverProps
          // `clip`). It must be `.id` and never `.ordinal`: both are integers on this row, both
          // satisfy the type, and the wrong one would snapshot a DIFFERENT passage's bytes into
          // the user's study with nothing to signal it.
          //
          // The clipping is the whole SECTION, not the selected phrase — the section is the unit
          // the corpus is keyed by, and the design's answer to "I only wanted this sentence" is
          // the editor's trim ("Trim, not edit", migration 111: the client sends offsets into the
          // server's own snapshot, never text). Deliberately not composed here.
          // B030: the selected text IS the hint, so a save from the reader opens on the
          // paragraph the reader had their finger on rather than the whole section.
          clip={{
            sectionId: pendingSection.id,
            reference: pendingLocus || undefined,
            matchHint: pending.text || undefined,
          }}
          clipTitle={`${source.title}${pendingLocus ? ` · ${pendingLocus}` : ''}`}
          onDismiss={dismiss}
        />
      )}
    </div>
  );
}
