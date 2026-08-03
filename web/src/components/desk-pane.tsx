'use client';

// One column of the study desk. Two kinds: a Scripture chapter, or a work from the library.
//
// WHY NOT REUSE WorkReader. WorkReader is built to BE the page — it owns the document scroll, the
// resume record in localStorage, a TOC drawer and a selection popover. Three of them on one screen
// would fight over all four: three resume records writing the same key, three popovers, and a
// windowing implementation keyed to the window scroll that no longer maps to any single pane. So a
// pane is a simpler thing on purpose — its own scroll container, keyset paging, no annotation
// stack. The full reader stays one click away at /work/[slug], and that link is in every pane
// header.
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

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BOOK_BY_BOOK_SLUG, fetchChapter, type ChapterData } from '@/lib/bible';
import { paneRegisterLabel, type Pane } from '@/lib/desk';
import { resolveBookSlug } from '@bible/ref-parse';
import { BookPicker } from '@/components/book-picker';
import { WorkToc } from '@/components/work-toc';
import type { WorkSectionRow, WorkSource, WorkTocUnit } from '@/lib/work';

const PAGE_LIMIT = 25;

/** Shared chrome so both pane kinds present identically: title, register label, contents, close, expand. */
function PaneFrame({
  title,
  subtitle,
  register,
  fullHref,
  onContents,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string | null;
  register: string;
  fullHref: string;
  /** Renders the Contents button only when the pane has something to navigate. */
  onContents?: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={`${title} (${register})`}
      className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-stone-200/70 bg-white/40 dark:border-stone-800 dark:bg-stone-950/30"
    >
      <header className="flex items-start justify-between gap-2 border-b border-stone-200/70 px-4 py-3 dark:border-stone-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {/* The register label. Never omitted, never inferred from position. */}
            <span className="shrink-0 rounded-full bg-stone-200/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-600 dark:bg-stone-800 dark:text-stone-300">
              {register}
            </span>
            <Link href={fullHref} className="truncate font-scripture text-sm text-stone-800 hover:underline dark:text-stone-100">
              {title}
            </Link>
          </div>
          {subtitle && <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onContents && (
            <button
              type="button"
              onClick={onContents}
              aria-label={`Contents of ${title}`}
              title="Contents"
              className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
                <path d="M2 3.5h11M2 7.5h11M2 11.5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          >
            ✕
          </button>
        </div>
      </header>
      {/* Each pane scrolls independently — that is the whole point of a desk. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
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
        <div className="space-y-1.5 font-scripture text-[15px] leading-relaxed text-stone-800 dark:text-stone-100">
          {data.verses.map((v) => (
            <p key={v.verse}>
              <span className="mr-1.5 align-super text-[10px] tabular-nums text-stone-400">{v.verse}</span>
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

function WorkPaneView({ pane, onClose }: { pane: Extract<Pane, { kind: 'work' }>; onClose: () => void }) {
  const [source, setSource] = useState<WorkSource | null>(null);
  const [toc, setToc] = useState<WorkTocUnit[]>([]);
  const [sections, setSections] = useState<WorkSectionRow[]>([]);
  const [nextAfter, setNextAfter] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  // Guards against a stale response from a previous slug landing in this pane.
  const seq = useRef(0);

  /** Load the section list starting AT `ord` (keyset: after = ord - 1). */
  const loadFrom = useCallback(
    async (ord: number, mine: number) => {
      const res = await fetch(`/api/work/${encodeURIComponent(pane.slug)}/sections?after=${ord - 1}&limit=${PAGE_LIMIT}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page = (await res.json()) as { sections: WorkSectionRow[]; nextAfter: number | null };
      if (mine === seq.current) {
        setSections(page.sections);
        setNextAfter(page.nextAfter);
      }
    },
    [pane.slug],
  );

  useEffect(() => {
    const mine = ++seq.current;
    setSource(null);
    setToc([]);
    setSections([]);
    setNextAfter(null);
    setError(null);
    setBusy(true);

    (async () => {
      try {
        const metaRes = await fetch(`/api/work/${encodeURIComponent(pane.slug)}`);
        if (!metaRes.ok) throw new Error(metaRes.status === 404 ? 'not found' : `HTTP ${metaRes.status}`);
        // The TOC was ALWAYS in this response and the pane used to throw it away — keeping it is
        // what makes per-pane contents navigation free (no second request, no new endpoint).
        const meta = (await metaRes.json()) as { source: WorkSource; toc: WorkTocUnit[] };

        if (mine === seq.current) {
          setSource(meta.source);
          setToc(meta.toc);
        }
        await loadFrom(1, mine);
      } catch (err) {
        if (mine === seq.current) {
          setError(err instanceof Error && err.message === 'not found' ? `No published work "${pane.slug}".` : 'Could not load this work.');
        }
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    })();
  }, [pane.slug, loadFrom]);

  const jumpTo = useCallback(
    async (ord: number) => {
      setTocOpen(false);
      const mine = seq.current;
      setBusy(true);
      setError(null);
      setSections([]);
      try {
        await loadFrom(ord, mine);
      } catch {
        if (mine === seq.current) setError('Could not load that part of the work.');
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    },
    [loadFrom],
  );

  const loadMore = useCallback(async () => {
    if (nextAfter === null || busy) return;
    const mine = seq.current;
    setBusy(true);
    try {
      const res = await fetch(`/api/work/${encodeURIComponent(pane.slug)}/sections?after=${nextAfter}&limit=${PAGE_LIMIT}`);
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as { sections: WorkSectionRow[]; nextAfter: number | null };
      if (mine === seq.current) {
        setSections((prev) => [...prev, ...page.sections]);
        setNextAfter(page.nextAfter);
      }
    } catch {
      if (mine === seq.current) setError('Could not load more of this work.');
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  }, [pane.slug, nextAfter, busy]);

  return (
    <PaneFrame
      title={source?.title ?? pane.slug}
      subtitle={source ? [source.author, source.tradition].filter(Boolean).join(' · ') || null : null}
      register={paneRegisterLabel(source?.source_type)}
      fullHref={`/work/${pane.slug}`}
      onContents={source && toc.length > 0 ? () => setTocOpen(true) : undefined}
      onClose={onClose}
    >
      {error ? (
        <Message tone="error">{error}</Message>
      ) : !source && busy ? (
        <Message>Loading…</Message>
      ) : (
        <>
          <div className="space-y-4">
            {sections.map((s) => (
              <article key={s.id} id={`s${s.ordinal}`}>
                {s.heading && (
                  <h3 className="mb-1 font-scripture text-sm text-stone-700 dark:text-stone-200">{s.heading}</h3>
                )}
                {/* Corpus prose, rendered as TEXT. Never dangerouslySetInnerHTML here: bodies are
                    stored source text, and this pane has no sanitiser in its path. */}
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
                  {s.body}
                </p>
              </article>
            ))}
          </div>
          {sections.length === 0 && !busy && <Message>Nothing to read here yet.</Message>}
          {nextAfter !== null && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={busy}
              className="mt-4 min-h-[40px] w-full rounded-full border border-stone-200/70 text-sm text-stone-600 hover:bg-accent-50/50 disabled:opacity-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-accent-950/20"
            >
              {busy ? 'Loading…' : 'Read more'}
            </button>
          )}
        </>
      )}
      {tocOpen && source && (
        <WorkToc
          toc={toc}
          sourceType={source.source_type}
          currentOrdinal={sections[0]?.ordinal ?? null}
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
