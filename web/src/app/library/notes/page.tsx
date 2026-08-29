'use client';

import { useEffect, useState } from 'react';
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

export default function MyLibraryPage() {
  const [state, setState] = useState<'loading' | 'signedout' | 'error' | 'ready'>('loading');
  const [notes, setNotes] = useState<Note[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

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

      {state === 'loading' ? (
        <p className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">Loading…</p>
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
                    <Link
                      key={b.id}
                      href={ref.href}
                      className="inline-flex min-h-[40px] items-center gap-1.5 border edge px-4 text-sm font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300"
                    >
                      <span aria-hidden>⚑</span>
                      {ref.label}
                      {b.label && <span className="text-stone-500 dark:text-stone-400">· {b.label}</span>}
                    </Link>
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
                      <Link href={ref.href} className="inline-flex min-h-[32px] items-center font-scripture text-sm font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300">
                        {ref.label}
                      </Link>
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
                    <Link
                      key={h.id}
                      href={ref.href}
                      className="flex min-h-[44px] items-center gap-2 border edge px-4 text-sm text-stone-700 hover:bg-stone-100 active:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800"
                    >
                      <span className={`h-3 w-3 rounded-full ${DOT[h.color] ?? 'bg-yellow-400'}`} />
                      {ref.label}
                    </Link>
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
