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
  loading = false,
  onContents,
  onClose,
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
  children: React.ReactNode;
}) {
  return (
    <section
      // Named honestly while loading, for the same reason the visible header is: "spurgeon-sermons
      // (Unlabelled)" told a screen reader two things that were not so. Three panes loading at once
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
          MEASURE. This pane had no max-width at all, and it is `flex-1` inside a
          `lg:flex-row`, so a single open pane filled the viewport: roughly 200 characters
          a line at 1920px, against about 74 in the main reader. The same corpus paragraph
          was the most comfortable text in the app in one place and the least in another.
          It follows the reader's measure (`.reading-measure`, default 84ch — owner direction
          2026-08-12; was a hardcoded max-w-2xl, which drifted from the Bible reader the
          moment its width became a preference), and `mx-auto` keeps it centred when the
          pane is wider than the column. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
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

function WorkPaneView({ pane, onClose }: { pane: Extract<Pane, { kind: 'work' }>; onClose: () => void }) {
  const [source, setSource] = useState<WorkSource | null>(null);
  const [toc, setToc] = useState<WorkTocUnit[]>([]);
  const [sections, setSections] = useState<WorkSectionRow[]>([]);
  const [nextAfter, setNextAfter] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // B011: starts TRUE, because a work pane is fetching from the moment it mounts. It used to start
  // false, and the effect that sets it runs only after the first paint — so for that first frame
  // `sections.length === 0 && !busy` was true and the pane rendered "Nothing to read here yet."
  // about a work it had not yet asked for. Same defect as the UNLABELLED header one line up: state
  // that has not been established yet, reported as an established fact.
  const [busy, setBusy] = useState(true);
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

  // B011: neither the work nor a reason it failed — the pane genuinely does not know what it is
  // yet. Derived rather than tracked, so it cannot drift out of step with `source`/`error`; the
  // two states it distinguishes from are exactly the two the header needs to render truthfully.
  const loading = !source && !error;

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
    >
      {error ? (
        <Message tone="error">{error}</Message>
      ) : loading ? (
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
                <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-stone-700 dark:text-stone-300">
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
 className="mt-4 min-h-[44px] w-full border edge font-sans text-sm text-stone-600 hover:bg-accent-50/50 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-accent-950/20"
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
