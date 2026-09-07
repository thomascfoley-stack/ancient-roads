'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import Link from 'next/link';
import { formatVerseId } from '@bible/verse-id';
import { verseHref } from '@/lib/verse-link';
import { HIGHLIGHT_COLORS } from '@/lib/highlight-colors';
import { DISPLAY_LOCALE } from '@/lib/locale';

interface Note { id: string; verse_id: number; body: string; updated_at: string }
interface Highlight { id: string; verse_id: number; color: string }
interface Bookmark { id: string; verse_id: number; label: string | null }

const DOT: Record<string, string> = Object.fromEntries(HIGHLIGHT_COLORS.map((c) => [c.id, c.dot]));

// The href is built by the SHARED helper so the test can drive the shipped function rather than a
// copy of it. The fragment targets the verse's own id (verse-display.tsx); the reader scrolls to
// it once the chapter has loaded, because the element does not exist at navigation time for the
// browser to anchor natively.
function verseRef(verseId: number) {
  return { label: formatVerseId(verseId), href: verseHref(verseId) };
}

// The DELETE body /api/annotations accepts. A highlight goes by its SPAN id
// (removeHighlightById); a note and a bookmark go by verse, because both are one-per-verse by
// construction (idx_notes_user_verse; a bookmark is a place and toggles). Deleting a highlight by
// verseId would call removeHighlight, which clears EVERY span on that verse — this page lists
// spans one row each, so it would take the neighbouring rows with it.
type DeleteBody =
  | { kind: 'highlight'; id: string }
  | { kind: 'note'; verseId: number }
  | { kind: 'bookmark'; verseId: number };

// The two-step remove, copied from the research-history rows in components/sidebar.tsx: the first
// tap arms, the second removes. Not window.confirm — a native dialog is heavier than the action
// deserves — and ALWAYS VISIBLE rather than revealed on hover, because a control that exists on a
// pointer and not on a touchscreen is the UX-2 defect this repo has already shipped once.
function RemoveButton({
  noun,
  reference,
  armed,
  onArm,
  onConfirm,
  onDisarm,
}: {
  noun: string;
  reference: string;
  armed: boolean;
  onArm: () => void;
  onConfirm: () => void;
  onDisarm: () => void;
}) {
  return (
    <button
      type="button"
      onClick={armed ? onConfirm : onArm}
      // Disarms when focus leaves, so an armed row cannot lie in wait for an unrelated tap.
      onBlur={onDisarm}
      // The accessible name names the ITEM, not the action alone: a screen-reader user moving
      // through a page of forty rows has to know which one this button empties.
      aria-label={armed ? `Confirm remove: ${noun} on ${reference}` : `Remove ${noun} on ${reference}`}
      className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center px-2 text-micro transition-colors ease-gentle ${
        armed
          ? 'font-semibold text-red-700 dark:text-red-400'
          : 'text-stone-400 hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-200'
      }`}
    >
      {armed ? 'Remove?' : '×'}
    </button>
  );
}

export default function MyLibraryPage() {
  const [state, setState] = useState<'loading' | 'signedout' | 'error' | 'ready'>('loading');
  const [notes, setNotes] = useState<Note[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  // Which row is armed, as `${kind}:${id}` — ids come from three different tables, so the kind
  // has to be part of the key.
  const [arming, setArming] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // OPTIMISTIC WITH ROLLBACK, and the rollback is ANNOUNCED. The row leaves immediately; if the
  // request fails it goes back at the index it left from and the reader is told why. A row that
  // silently reappears reads as a bug in the page rather than a request that did not land.
  const removeRow = useCallback(
    async <T extends { id: string }>(
      id: string,
      rows: T[],
      setRows: Dispatch<SetStateAction<T[]>>,
      body: DeleteBody,
      subject: string,
    ) => {
      const index = rows.findIndex((r) => r.id === id);
      if (index < 0) return;
      const row = rows[index]!;
      setArming(null);
      setRemoveError(null);
      setRows((prev) => prev.filter((r) => r.id !== id));
      try {
        const res = await fetch('/api/annotations', {
          method: 'DELETE',
          // requireJsonContentType() in api/annotations/route.ts refuses a DELETE without it.
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        setRows((prev) => [...prev.slice(0, index), row, ...prev.slice(index)]);
        setRemoveError(`Your ${subject} could not be removed. Nothing was changed.`);
      }
    },
    [],
  );

  useEffect(() => {
    fetch('/api/annotations/all')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { highlights: Highlight[]; notes: Note[]; bookmarks?: Bookmark[] }) => {
        setNotes(d.notes);
        setHighlights(d.highlights);
        // Optional: a tab opened before this deploy gets a response without the key, and a bare
        // `d.bookmarks.map` would blank the whole page rather than just its bookmark section.
        setBookmarks(d.bookmarks ?? []);
        setState('ready');
      })
      // 401 is "not signed in". ANYTHING else is a failure, and telling a signed-in
      // reader they are signed out sends them to re-authenticate over a 500. This is the
      // exact shape app/library/page.tsx's header calls out and says it is not repeating.
      .catch((status) => setState(status === 401 ? 'signedout' : 'error'));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-medium tracking-tight text-stone-900 dark:text-stone-100">Saved</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500 dark:text-stone-400">
          Every verse you have highlighted, bookmarked, or written a note on, in one place. Tap any
          reference to jump back to it in the reader.
        </p>
      </header>

      {/* A removal that failed, above the sections so it survives the list emptying out. */}
      {removeError && (
        <p role="alert" className="mb-4 border edge px-4 py-3 text-sm text-red-800 dark:text-red-200">
          {removeError}
        </p>
      )}

      {state === 'loading' ? (
        // The skeleton vocabulary from app/library/loading.tsx, not the 26th hand-written
        // "Loading…" string: the shape of this page is known ahead of time, so showing it is more
        // honest than a word and it removes the layout shift when the data lands. `animate-pulse`
        // is inert under prefers-reduced-motion (globals.css).
        <div aria-busy>
          <span className="sr-only">Loading your saved verses</span>
          <div aria-hidden className="animate-pulse">
            <div className="mb-3 h-3 w-20 bg-stone-200/50 dark:bg-stone-800/70" />
            <div className="mb-9 flex flex-wrap gap-2">
              {['w-28', 'w-24', 'w-32'].map((w) => (
                <div key={w} className={`h-11 ${w} bg-stone-200/60 dark:bg-stone-800/80`} />
              ))}
            </div>
            <div className="mb-3 h-3 w-16 bg-stone-200/50 dark:bg-stone-800/70" />
            <div className="border-y edge">
              {['w-44', 'w-52', 'w-36'].map((w) => (
                <div key={w} className="border-b edge py-4 last:border-b-0">
                  <div className="mb-2 h-4 w-24 bg-stone-200/70 dark:bg-stone-800" />
                  <div className={`h-4 ${w} bg-stone-200/50 dark:bg-stone-800/70`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : state === 'signedout' ? (
        <div className="py-16 text-center">
          <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
            Sign in to see your highlights, notes and bookmarks.
          </p>
          <Link
            href="/auth/sign-in"
            className="inline-flex min-h-[44px] items-center border border-stone-900 px-5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
          >
            Sign in
          </Link>
        </div>
      ) : state === 'error' ? (
        <div className="py-16 text-center">
          <p role="alert" className="mb-4 text-sm text-red-800 dark:text-red-200">
            Your library could not be loaded. Nothing you have saved is affected.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-[44px] items-center border border-stone-900 px-5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
          >
            Try again
          </button>
        </div>
      ) : notes.length === 0 && highlights.length === 0 && bookmarks.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Nothing saved yet. Open a chapter, tap a verse, and highlight it, bookmark it, or add a note.
          </p>
          <Link href="/read/jhn/1" className="mt-4 inline-flex min-h-[44px] items-center text-sm font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300">
            Start reading →
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {bookmarks.length > 0 && (
            <section>
              <h2 className="mb-3 text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Bookmarks ({bookmarks.length})
              </h2>
              <div className="flex flex-wrap gap-2">
                {bookmarks.map((b) => {
                  const ref = verseRef(b.verse_id);
                  return (
                    <div key={b.id} className="inline-flex items-stretch border edge">
                      <Link
                        href={ref.href}
                        className="inline-flex min-h-[44px] items-center gap-1.5 px-4 text-sm font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300"
                      >
                        <span aria-hidden>⚑</span>
                        {ref.label}
                        {b.label && <span className="text-stone-500 dark:text-stone-400">· {b.label}</span>}
                      </Link>
                      <RemoveButton
                        noun="bookmark"
                        reference={ref.label}
                        armed={arming === `bookmark:${b.id}`}
                        onArm={() => setArming(`bookmark:${b.id}`)}
                        onDisarm={() => setArming((cur) => (cur === `bookmark:${b.id}` ? null : cur))}
                        onConfirm={() =>
                          void removeRow(
                            b.id,
                            bookmarks,
                            setBookmarks,
                            { kind: 'bookmark', verseId: b.verse_id },
                            `bookmark on ${ref.label}`,
                          )
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {notes.length > 0 && (
            <section>
              <h2 className="mb-3 text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Notes ({notes.length})
              </h2>
              <div className="border-y edge">
                {notes.map((n) => {
                  const ref = verseRef(n.verse_id);
                  return (
                    <div
                      key={n.id}
                      className="border-b edge px-1 py-3 last:border-b-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Link href={ref.href} className="inline-flex min-h-[44px] items-center font-scripture text-sm font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300">
                          {ref.label}
                        </Link>
                        <RemoveButton
                          noun="note"
                          reference={ref.label}
                          armed={arming === `note:${n.id}`}
                          onArm={() => setArming(`note:${n.id}`)}
                          onDisarm={() => setArming((cur) => (cur === `note:${n.id}` ? null : cur))}
                          onConfirm={() =>
                            void removeRow(
                              n.id,
                              notes,
                              setNotes,
                              { kind: 'note', verseId: n.verse_id },
                              `note on ${ref.label}`,
                            )
                          }
                        />
                      </div>
                      <p
                        className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-stone-700 dark:text-stone-300 break-words"
                        title={n.body}
                      >
                        {n.body}
                      </p>
                      <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
                        {new Date(n.updated_at).toLocaleDateString(DISPLAY_LOCALE, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {highlights.length > 0 && (
            <section>
              <h2 className="mb-3 text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Highlights ({highlights.length})
              </h2>
              <div className="flex flex-wrap gap-2">
                {highlights.map((h) => {
                  const ref = verseRef(h.verse_id);
                  return (
                    <div key={h.id} className="inline-flex items-stretch border edge">
                      <Link
                        href={ref.href}
                        className="flex min-h-[44px] items-center gap-2 px-4 text-sm text-stone-700 hover:bg-stone-100 active:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800"
                      >
                        <span className={`h-3 w-3 rounded-full ${DOT[h.color] ?? 'bg-yellow-400'}`} />
                        {ref.label}
                      </Link>
                      <RemoveButton
                        noun="highlight"
                        reference={ref.label}
                        armed={arming === `highlight:${h.id}`}
                        onArm={() => setArming(`highlight:${h.id}`)}
                        onDisarm={() => setArming((cur) => (cur === `highlight:${h.id}` ? null : cur))}
                        onConfirm={() =>
                          void removeRow(
                            h.id,
                            highlights,
                            setHighlights,
                            { kind: 'highlight', id: h.id },
                            `highlight on ${ref.label}`,
                          )
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
