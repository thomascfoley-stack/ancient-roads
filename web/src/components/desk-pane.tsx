'use client';

// One column of the study desk. Two kinds: a Scripture chapter, or a work from the library.
//
// WHY NOT REUSE WorkReader. WorkReader is built to BE the page — it owns the document scroll, the
// resume record in localStorage, a TOC drawer and a selection popover. Three of them on one screen
// would fight over all four: three resume records writing the same key, three popovers, and a
// windowing implementation keyed to the window scroll that no longer maps to any single pane. So a
// pane is a simpler thing on purpose — its own scroll container, no annotation stack. The full
// reader stays one click away at /work/[slug], and that link is in every pane header.
//
// IT DOES WINDOW, THOUGH (UX-3). Until the 4x4 grid, a pane APPENDED every keyset page it fetched
// and rendered all of them — tolerable at three panes, unbounded DOM growth all the same, and
// sixteen times worse at the new ceiling (spurgeon-sermons is 118,371 sections). The pane now
// reuses the full reader's section-page hook (`useWorkSectionPages` — the tested keyset walk) and
// an ADAPTED COPY of its render window, keyed to the pane's own scroll container. See the
// constants above WorkPaneView for the adaptation contract.
//
// EVERY PANE IS LABELLED. `paneRegisterLabel` renders in the header from the work's own
// `source_type`. This is where the register wall lands visually: a hymn beside a commentary is
// allowed and is the point of the desk, but the reader must never have to infer which is which
// from position or typography.
//
// EVERY PANE CAN NAVIGATE ITSELF (owner order, 2026-08-02: "every time a work is open you need to
// be able to search chapters"). A work pane opens the same WorkToc drawer the full reader uses —
// search included — and seeks its own keyset cursor; a Scripture pane opens the BookPicker in
// pick mode and REPLACES itself in the desk URL. Navigation is per-pane and never touches the
// neighbours, which is the desk's whole contract.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BOOK_BY_BOOK_SLUG, fetchChapter, type ChapterData } from '@/lib/bible';
import { paneRegisterLabel, type Pane } from '@/lib/desk';
import { resolveBookSlug } from '@bible/ref-parse';
import { BookPicker } from '@/components/book-picker';
import { WorkToc } from '@/components/work-toc';
import { useWorkSectionPages } from '@/lib/use-work-sections';
import { WORK_READER_PAGE_LIMIT } from '@/lib/work-reader';
import type { WorkSectionRow, WorkSource, WorkTocUnit } from '@/lib/work';

/** Shared chrome so both pane kinds present identically: title, register label, contents, close, expand. */
function PaneFrame({
  title,
  subtitle,
  register,
  fullHref,
  loading = false,
  onContents,
  onClose,
  bodyRef,
  children,
}: {
  title: string;
  subtitle?: string | null;
  register: string;
  fullHref: string;
  /**
   * B011 — the pane has not learned what it is yet, and must not pretend otherwise.
   *
   * A work pane is created from a URL that carries a SLUG and nothing else, so between mount and
   * the `/api/work/[slug]` response the header had a title and a register to render and neither
   * one was true: `source?.title ?? pane.slug` printed the raw identifier as though it were the
   * work's name, and `paneRegisterLabel(undefined)` fell through to "Unlabelled". So a new pane
   * flashed `UNLABELLED · spurgeon-sermons` and then became `SERMON · Sermons on the Psalms`.
   *
   * "Unlabelled" is the part that actually matters, and it is worse than ugly. That string is the
   * register wall's signal for a work whose `source_type` this build does not recognise — a real,
   * rare, investigate-me state. Rendering it on every single pane load spends the signal on a
   * condition that is not it, and teaches the reader (and anyone reading a screenshot) to see
   * UNLABELLED as noise. A pane that does not yet know its register must look like it does not
   * know, not like a wall breach.
   *
   * So while `loading`, both slots become skeletons: the frame keeps its shape, nothing is
   * asserted, and the slug never appears as a title. Scripture panes never take this path — their
   * title and register are known from the URL itself, which is the "already-known title" case and
   * the reason this is a flag rather than a blanket loading screen.
   */
  loading?: boolean;
  /** Renders the Contents button only when the pane has something to navigate. */
  onContents?: () => void;
  onClose: () => void;
  /** The work pane's render window keys itself to the pane's OWN scroll container (UX-3) — it
   *  needs the element, which only this frame renders. Scripture panes don't window and don't
   *  pass one. */
  bodyRef?: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  return (
    <section
      // Named honestly while loading, for the same reason the visible header is: "spurgeon-sermons
      // (Unlabelled)" told a screen reader two things that were not so. Panes loading at once
      // are momentarily indistinguishable here, which is the true state of affairs.
      aria-label={loading ? 'Loading a pane' : `${title} (${register})`}
      aria-busy={loading || undefined}
 className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border edge bg-paper/60 dark:bg-stone-950/30"
    >
 <header className="flex items-start justify-between gap-2 border-b edge px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {loading ? (
              // Same box sizes as the real pill and title, so nothing jumps when they arrive.
              // aria-hidden because the section's own label already says "Loading a pane";
              // announcing two empty boxes as well would be noise.
              <>
                <span
                  className="h-[18px] w-16 shrink-0 animate-pulse rounded bg-stone-200/70 dark:bg-stone-800"
                  aria-hidden
                />
                <span className="h-[18px] w-40 max-w-full animate-pulse rounded bg-stone-200/70 dark:bg-stone-800" aria-hidden />
              </>
            ) : (
              <>
                {/* The register label. Never omitted, never inferred from position. */}
                <span className="shrink-0 bg-stone-200/70 px-2 py-0.5 text-micro font-semibold uppercase tracking-wider text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                  {register}
                </span>
                <Link href={fullHref} className="truncate font-scripture text-sm text-stone-800 hover:underline dark:text-stone-100">
                  {title}
                </Link>
              </>
            )}
          </div>
          {/* The subtitle (author · tradition) arrives with the title, so its space is reserved
              too — otherwise the header grows by a line the moment the fetch lands and the whole
              pane's text shifts down under the reader's eyes. */}
          {loading ? (
            <span className="mt-1 block h-3 w-28 animate-pulse rounded bg-stone-200/70 dark:bg-stone-800" aria-hidden />
          ) : (
            subtitle && <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">{subtitle}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onContents && (
            <button
              type="button"
              onClick={onContents}
              aria-label={`Contents of ${title}`}
              title="Contents"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-stone-500 dark:text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
                <path d="M2 3.5h11M2 7.5h11M2 11.5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            // B011: `Close ${title}` read "Close spurgeon-sermons" while the title was still the
            // raw slug. The close button works the same either way, so it says the plain thing
            // until there is a real name to say.
            aria-label={loading ? 'Close this pane' : `Close ${title}`}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-stone-500 dark:text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          >
            ✕
          </button>
        </div>
      </header>
      {/* Each pane scrolls independently, that is the whole point of a desk.
          `data-pane-scroll` names that container: the work pane's render window attaches its
          listeners HERE (not the document — N panes are N independent readers), and the
          continuous-read tests drive the same element.
          MEASURE. This pane had no max-width at all, and it used to be `flex-1` inside a row,
          so a single open pane filled the viewport: roughly 200 characters a line at 1920px,
          against about 74 in the main reader. The same corpus paragraph was the most
          comfortable text in the app in one place and the least in another.
          It follows the reader's measure (`.reading-measure`, default 84ch — owner direction
          2026-08-12; was a hardcoded max-w-2xl, which drifted from the Bible reader the
          moment its width became a preference), and `mx-auto` keeps it centred when the
          pane is wider than the column. */}
      <div ref={bodyRef} data-pane-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        <div className="reading-measure mx-auto w-full">{children}</div>
      </div>
    </section>
  );
}

function Message({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'error' }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className={
        tone === 'error'
          ? 'rounded-lg border border-red-300/60 bg-red-50/60 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200'
          : 'text-sm text-stone-500 dark:text-stone-400'
      }
    >
      {children}
    </p>
  );
}

function ScripturePaneView({
  pane,
  onClose,
  onReplace,
}: {
  pane: Extract<Pane, { kind: 'scripture' }>;
  onClose: () => void;
  onReplace: (pane: Pane) => void;
}) {
  const [data, setData] = useState<ChapterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  // FOUND BY A7's product walk (2026-08-02) at the reader route; the SAME bare-Map-lookup shape
  // exists here, reachable via `?p=scripture:john/1` (desk.ts:76 parses that path segment with no
  // book validation beyond a slug-char regex). resolveBookSlug is exact-alias-only, same as the
  // reader route — see its comment in bible/ref-parse.ts for why prefix matching is wrong here.
  const book = BOOK_BY_BOOK_SLUG.get(pane.book) ?? resolveBookSlug(pane.book);
  // The canonical slug for every fetch AND for the "open full page" link — using it here avoids
  // even the one redirect hop the reader route now takes for an alias URL.
  const fetchSlug = book?.slug ?? pane.book;

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    if (!book) {
      setError(`Unknown book "${pane.book}".`);
      return;
    }
    fetchChapter(fetchSlug, pane.chapter)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        // Distinct from "no verses": a failed load must not render as an empty chapter.
        if (!cancelled) setError(`Could not load ${book.name} ${pane.chapter}.`);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchSlug, pane.chapter, book]);

  const title = book ? `${book.name} ${pane.chapter}` : pane.book;

  return (
    <PaneFrame
      title={title}
      register="Scripture"
      fullHref={`/read/${fetchSlug}/${pane.chapter}`}
      onContents={() => setPicking(true)}
      onClose={onClose}
    >
      {error ? (
        <Message tone="error">{error}</Message>
      ) : !data ? (
        <Message>Loading…</Message>
      ) : (
        <div className="space-y-1.5 font-scripture text-base leading-relaxed text-stone-800 dark:text-stone-100">
          {data.verses.map((v) => (
            <p key={v.verse}>
              {/* PRD §4: verse numbers are 11px Source Sans, antique gold, old-style figures. */}
              <span className="mr-1.5 align-super font-sans text-micro tabular-nums text-accent-600 dark:text-accent-400">{v.verse}</span>
              {v.text}
            </p>
          ))}
        </div>
      )}
      {picking && book && (
        <BookPicker
          currentBook={book}
          currentChapter={pane.chapter}
          onClose={() => setPicking(false)}
          onPick={(b, c) => {
            setPicking(false);
            // Replace THIS pane in the desk URL; the neighbours stay exactly where they are.
            onReplace({ kind: 'scripture', book: b.slug, chapter: c });
          }}
        />
      )}
    </PaneFrame>
  );
}

// The pane's render window: 8 behind / 16 ahead ≈ 24 mounted sections, whatever the work's size.
//
// ADAPTED FROM work-reader.tsx — deliberately a COPY, not an extraction (W-UX3 design verdict).
// The reader's window math is entangled with its selection popover, resume record, header-line
// progress reporting and pending-scroll restore; extracting it would put the app's most
// load-bearing reading surface in the blast radius of a desk change. The adaptation contract:
// the reader windows 12/28 around a progress-reporting active section keyed to the window/main
// scroller; the pane windows 8/16 (smaller cells, up to sixteen panes) keyed to the PANE's OWN
// scroll container, and its prefetch branch is guarded on error (the pane-level no-storm pin).
// A fix to the chase/convergence logic in EITHER file is owed to the other.
const WINDOW_BEHIND = 8;
const WINDOW_AHEAD = 16;
// Fetch the next page when the active section comes within this many of the loaded tail.
const PREFETCH_AHEAD = 6;
// First-paint spacer estimate, replaced by measured averages as sections render.
const EST_SECTION_HEIGHT = 320;

function WorkPaneView({ pane, onClose }: { pane: Extract<Pane, { kind: 'work' }>; onClose: () => void }) {
  const [source, setSource] = useState<WorkSource | null>(null);
  const [toc, setToc] = useState<WorkTocUnit[]>([]);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  // The section walk: keyset-paginated, prepend-capable, in-flight-deduped — the SAME hook the
  // full reader uses (its invariants are pinned in web/test/invariants/work-reader-paging.test.tsx).
  // The hook owns the data; the render window below owns how much of it is MOUNTED.
  const { sections, firstOrdinal, hasPrev, hasNext, busy, error, loadInitial, loadNext, loadPrev } =
    useWorkSectionPages(pane.slug);

  useEffect(() => {
    let cancelled = false;
    setSource(null);
    setToc([]);
    setMetaError(null);
    (async () => {
      try {
        const metaRes = await fetch(`/api/work/${encodeURIComponent(pane.slug)}`);
        if (!metaRes.ok) throw new Error(metaRes.status === 404 ? 'not found' : `HTTP ${metaRes.status}`);
        // The TOC was ALWAYS in this response and the pane used to throw it away — keeping it is
        // what makes per-pane contents navigation free (no second request, no new endpoint).
        const meta = (await metaRes.json()) as { source: WorkSource; toc: WorkTocUnit[] };
        if (!cancelled) {
          setSource(meta.source);
          setToc(meta.toc);
        }
      } catch (err) {
        if (!cancelled) {
          setMetaError(err instanceof Error && err.message === 'not found' ? `No published work "${pane.slug}".` : 'Could not load this work.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pane.slug]);

  useEffect(() => {
    loadInitial(pane.ordinal ?? null);
  }, [loadInitial, pane.ordinal]);

  // ---- the render window (adapted from work-reader.tsx — the contract is above) -------------

  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Rendered section elements + their measured heights (for spacer sizing and window math).
  const sectionEls = useRef(new Map<number, HTMLElement>());
  const heights = useRef(new Map<number, number>());
  const avgHeight = useRef(EST_SECTION_HEIGHT);
  const [win, setWin] = useState({ start: 0, end: WINDOW_BEHIND + WINDOW_AHEAD });
  // Render-fresh mirrors so scroll callbacks stay referentially stable.
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const winRef = useRef(win);
  winRef.current = win;
  const hasNextRef = useRef(hasNext);
  hasNextRef.current = hasNext;
  const errorRef = useRef(error);
  errorRef.current = error;
  const frame = useRef(0);
  // Prepend anchor: keeps the viewport glued to the same section across a loadPrev prepend.
  const prependAnchor = useRef<{ ordinal: number; top: number } | null>(null);

  // The active section = the first rendered section extending below the pane's reading line
  // (the top of its own scroll container). Drives the render window and the prefetch.
  // rAF-throttled from scroll.
  const updateActive = useCallback(() => {
    const list = sectionsRef.current;
    if (list.length === 0) return;
    const line = (scrollRef.current?.getBoundingClientRect().top ?? 0) + 4;

    let activeIdx = -1;
    let lastRenderedIdx = -1;
    for (let i = 0; i < list.length; i++) {
      const el = sectionEls.current.get(list[i]!.ordinal);
      if (!el) continue;
      lastRenderedIdx = i;
      const r = el.getBoundingClientRect();
      if (r.bottom > line) {
        activeIdx = i;
        break;
      }
    }
    let chasing = false;
    if (activeIdx === -1) {
      // Every rendered section is above the line — a scrollbar drag/End-key jump went past the
      // window. Anchor on the last rendered section so the window shifts toward the scroll
      // position, and keep chasing (below) until rendered content catches up.
      if (lastRenderedIdx === -1) return; // nothing mounted — mid-jump, wait
      activeIdx = lastRenderedIdx;
      chasing = true;
    }

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

    // CONTINUOUS READING (order 2026-08-20-historians-study-entrance): "the book is the whole
    // book" — the next page loads when the ACTIVE section nears the loaded tail. This window's
    // own prefetch trigger replaced the old sentinel-button proximity check (the mechanism the
    // re-expressed desk-pane-continuous-read.test.tsx pins). NOT while an error stands: a failed
    // loadNext leaves the reader where they are with an inline Retry, and an unguarded prefetch
    // would re-fire the same failing request on every scroll frame — the deep-audit HIGH storm
    // in its windowed shape. Retry re-arms by calling loadNext directly.
    if (!errorRef.current && activeIdx >= list.length - PREFETCH_AHEAD) loadNext();

    // A jump fires few scroll events, so chase the scroll position across frames until the
    // window reaches it. Stop when the window can no longer move and no more content can
    // arrive (end of the work, or a failed fetch — never an idle rAF loop).
    if (chasing && (moved || (hasNextRef.current && !errorRef.current))) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        updateActive();
      });
    }
  }, [loadNext]);

  const onScroll = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      updateActive();
    });
  }, [updateActive]);

  // The listeners attach to the PANE's own scroll container, not the document: up to sixteen
  // panes on the grid are sixteen independent readers, and the old capture-phase document
  // listener made every pane answer every other pane's scroll (and any scroll anywhere else
  // in the app).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [onScroll]);

  // ---- window bookkeeping (layout effects: measure, anchor, re-evaluate) --------------------

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

  // After a prepend, keep the same section under the viewport and hold the window on it.
  useLayoutEffect(() => {
    const anchor = prependAnchor.current;
    if (!anchor) return;
    const idx = sections.findIndex((s) => s.ordinal === anchor.ordinal);
    if (idx === -1) return;
    prependAnchor.current = null;
    setWin((w) => ({ start: idx, end: Math.min(sections.length, idx + (w.end - w.start)) }));
    const el = sectionEls.current.get(anchor.ordinal);
    if (el && scrollRef.current) {
      scrollRef.current.scrollTop += el.getBoundingClientRect().top - anchor.top;
    }
  }, [sections]);

  // Re-evaluate the active section whenever content or the window changes (also the first
  // evaluation once the initial page lands — what makes a short first page never need a scroll
  // to keep reading, and what walks the window along a jsdom-style zero-rect environment).
  useLayoutEffect(() => {
    updateActive();
  }, [sections, win, updateActive]);

  const jumpTo = useCallback(
    (ord: number) => {
      setTocOpen(false);
      // A fresh position: the hook replaces the loaded range with the page CONTAINING `ord`
      // (its keyset contract starts that page AT ord — lib/work-reader.ts
      // pageAfterContaining), and the window resets onto it.
      const w = { start: 0, end: WINDOW_BEHIND + WINDOW_AHEAD };
      winRef.current = w;
      setWin(w);
      void loadInitial(ord);
    },
    [loadInitial],
  );

  function handleLoadPrev() {
    const list = sectionsRef.current;
    const first = list[winRef.current.start];
    const el = first ? sectionEls.current.get(first.ordinal) : undefined;
    if (first && el) {
      prependAnchor.current = { ordinal: first.ordinal, top: el.getBoundingClientRect().top };
    }
    void loadPrev();
  }

  // B011: neither the work nor a reason it failed — the pane genuinely does not know what it is
  // yet. Derived rather than tracked, so it cannot drift out of step with `source`/`metaError`;
  // the two states it distinguishes from are exactly the two the header needs to render truthfully.
  const loading = !source && !metaError;

  // The windowed slice: `visible` is all that mounts, however much of the work has streamed in
  // (the ≤24 bound is pinned at 250-section scale in desk-pane-windowed.test.tsx). Everything
  // outside it collapses into spacer divs sized from measured section heights, so the pane's
  // scrollbar still says where in the work you are.
  const visible = sections.slice(win.start, win.end);
  const estimateRange = (list: WorkSectionRow[]): number => {
    let h = 0;
    for (const s of list) h += heights.current.get(s.ordinal) ?? avgHeight.current;
    return h;
  };
  const topSpacer = estimateRange(sections.slice(0, win.start));
  const bottomSpacer =
    estimateRange(sections.slice(win.end)) + (hasNext ? WORK_READER_PAGE_LIMIT * avgHeight.current : 0);

  return (
    <PaneFrame
      // Still the fallbacks, because `loading` suppresses their rendering — but they are now
      // reached only in the impossible case (no source, no error, not loading), where a raw slug
      // is the honest thing to show: it is all we have.
      title={source?.title ?? pane.slug}
      subtitle={source ? [source.author, source.tradition].filter(Boolean).join(' · ') || null : null}
      register={paneRegisterLabel(source?.source_type)}
      fullHref={`/work/${pane.slug}`}
      loading={loading}
      onContents={source && toc.length > 0 ? () => setTocOpen(true) : undefined}
      onClose={onClose}
      bodyRef={scrollRef}
    >
      {metaError ? (
        <Message tone="error">{metaError}</Message>
      ) : loading ? (
        <Message>Loading…</Message>
      ) : sections.length === 0 && error ? (
        // The FIRST page failed. A load-MORE failure is a different thing (below): it keeps the
        // sections already read. Friendly words either way — the hook's error string names the
        // HTTP status, which is not the reader's business.
        <div>
          <Message tone="error">Could not load this work.</Message>
          <button
            type="button"
            onClick={() => void loadInitial(null)}
            className="mt-3 min-h-[44px] border edge px-4 font-sans text-sm text-stone-600 hover:bg-accent-50/50 dark:text-stone-300 dark:hover:bg-accent-950/20"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          {/* Reached by a jump mid-work: the hook can prepend the page before the loaded range
              (keyset backward). Manual, matching the full reader — downward is the continuous
              direction; upward is a button. */}
          {hasPrev && win.start === 0 && firstOrdinal !== null && (
            <button
              type="button"
              onClick={handleLoadPrev}
              disabled={busy === 'prev'}
              className="mb-4 min-h-[44px] w-full border edge font-sans text-sm text-stone-600 hover:bg-accent-50/50 disabled:opacity-40 dark:text-stone-300 dark:hover:bg-accent-950/20"
            >
              {busy === 'prev' ? 'Loading…' : '↑ Earlier in this work'}
            </button>
          )}
          {/* Collapsed earlier sections (measured where known, average estimate otherwise). */}
          {topSpacer > 0 && <div style={{ height: topSpacer }} aria-hidden />}
          <div className="space-y-4">
            {visible.map((s) => (
              <article key={s.id} id={`s${s.ordinal}`} ref={(el) => registerEl(s.ordinal, el)}>
                {s.heading && (
                  <h3 className="mb-1 font-scripture text-sm text-stone-700 dark:text-stone-200">{s.heading}</h3>
                )}
                {/* Corpus prose, rendered as TEXT. Never dangerouslySetInnerHTML here: bodies are
                    stored source text, and this pane has no sanitiser in its path. */}
                <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-stone-700 dark:text-stone-300">
                  {s.body}
                </p>
              </article>
            ))}
          </div>
          {/* Collapsed later sections + an estimate for the unfetched remainder, so the pane's
              scrollbar reflects roughly the whole work while pages stream in. */}
          {bottomSpacer > 0 && <div style={{ height: bottomSpacer }} aria-hidden />}
          {sections.length === 0 && busy === 'initial' && <Message>Loading…</Message>}
          {sections.length === 0 && !busy && !error && <Message>Nothing to read here yet.</Message>}
          {/* A load-more failure: the read stays, an inline retry appears, and the prefetch
              branch does NOT fire while the error stands (see updateActive — that guard is the
              storm fix, pinned by the no-storm leg of desk-pane-continuous-read.test.tsx).
              Retry is a DIRECT loadNext call; nothing else re-arms the auto-path. */}
          {sections.length > 0 && error && (
            <div className="mt-4 border edge p-3 text-sm text-stone-600 dark:text-stone-300">
              Could not load more of this work.{' '}
              <button
                type="button"
                onClick={() => void loadNext()}
                className="underline hover:text-accent-700 dark:hover:text-accent-300"
              >
                Retry
              </button>
            </div>
          )}
          {/* The manual fallback SURVIVES (deep-audit finding 9): keyboard readers scroll this
              pane with the same events the prefetch listens to, but a focusable control must
              exist that does the same thing — and it is proven by a real click, not by presence.
              NOT `disabled` while busy: a disabled button leaves the tab order, stealing focus
              from a keyboard reader parked on it. The hook's in-flight dedupe blocks a
              double-fire, so the button can stay focusable while loading. */}
          {hasNext && !error && (
            <button
              type="button"
              aria-busy={busy === 'next' || undefined}
              onClick={() => void loadNext()}
              className="mt-4 min-h-[44px] w-full border edge font-sans text-sm text-stone-600 hover:bg-accent-50/50 dark:text-stone-300 dark:hover:bg-accent-950/20"
            >
              {busy === 'next' ? 'Loading…' : 'Read more'}
            </button>
          )}
        </>
      )}
      {tocOpen && source && (
        <WorkToc
          toc={toc}
          sourceType={source.source_type}
          currentOrdinal={sections[win.start]?.ordinal ?? null}
          onNavigate={(ord) => void jumpTo(ord)}
          onClose={() => setTocOpen(false)}
        />
      )}
    </PaneFrame>
  );
}

export function DeskPane({
  pane,
  onClose,
  onReplace,
}: {
  pane: Pane;
  onClose: () => void;
  onReplace: (pane: Pane) => void;
}) {
  return pane.kind === 'scripture' ? (
    <ScripturePaneView pane={pane} onClose={onClose} onReplace={onReplace} />
  ) : (
    <WorkPaneView pane={pane} onClose={onClose} />
  );
}
