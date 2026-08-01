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

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BOOK_BY_BOOK_SLUG, fetchChapter, type ChapterData } from '@/lib/bible';
import { paneRegisterLabel, type Pane } from '@/lib/desk';
import type { WorkSectionRow, WorkSource } from '@/lib/work';

const PAGE_LIMIT = 25;

/** Shared chrome so both pane kinds present identically: title, register label, close, expand. */
function PaneFrame({
  title,
  subtitle,
  register,
  fullHref,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string | null;
  register: string;
  fullHref: string;
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
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="min-h-[32px] min-w-[32px] shrink-0 rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
        >
          ✕
        </button>
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

function ScripturePaneView({ pane, onClose }: { pane: Extract<Pane, { kind: 'scripture' }>; onClose: () => void }) {
  const [data, setData] = useState<ChapterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const book = BOOK_BY_BOOK_SLUG.get(pane.book);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    if (!book) {
      setError(`Unknown book "${pane.book}".`);
      return;
    }
    fetchChapter(pane.book, pane.chapter)
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
  }, [pane.book, pane.chapter, book]);

  const title = book ? `${book.name} ${pane.chapter}` : pane.book;

  return (
    <PaneFrame
      title={title}
      register="Scripture"
      fullHref={`/read/${pane.book}/${pane.chapter}`}
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
    </PaneFrame>
  );
}

function WorkPaneView({ pane, onClose }: { pane: Extract<Pane, { kind: 'work' }>; onClose: () => void }) {
  const [source, setSource] = useState<WorkSource | null>(null);
  const [sections, setSections] = useState<WorkSectionRow[]>([]);
  const [nextAfter, setNextAfter] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Guards against a stale response from a previous slug landing in this pane.
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    setSource(null);
    setSections([]);
    setNextAfter(null);
    setError(null);
    setBusy(true);

    (async () => {
      try {
        const metaRes = await fetch(`/api/work/${encodeURIComponent(pane.slug)}`);
        if (!metaRes.ok) throw new Error(metaRes.status === 404 ? 'not found' : `HTTP ${metaRes.status}`);
        const meta = (await metaRes.json()) as { source: WorkSource };

        const pageRes = await fetch(`/api/work/${encodeURIComponent(pane.slug)}/sections?after=0&limit=${PAGE_LIMIT}`);
        if (!pageRes.ok) throw new Error(`HTTP ${pageRes.status}`);
        const page = (await pageRes.json()) as { sections: WorkSectionRow[]; nextAfter: number | null };

        if (mine === seq.current) {
          setSource(meta.source);
          setSections(page.sections);
          setNextAfter(page.nextAfter);
        }
      } catch (err) {
        if (mine === seq.current) {
          setError(err instanceof Error && err.message === 'not found' ? `No published work "${pane.slug}".` : 'Could not load this work.');
        }
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    })();
  }, [pane.slug]);

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
    </PaneFrame>
  );
}

export function DeskPane({ pane, onClose }: { pane: Pane; onClose: () => void }) {
  return pane.kind === 'scripture' ? (
    <ScripturePaneView pane={pane} onClose={onClose} />
  ) : (
    <WorkPaneView pane={pane} onClose={onClose} />
  );
}
