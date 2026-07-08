'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { decodeVerseId, formatVerseId } from '@bible/verse-id';
import { BOOK_BY_NUM } from '@bible/books';
import { HIGHLIGHT_COLORS } from '@/lib/highlight-colors';

interface Note { id: string; verse_id: number; body: string; updated_at: string }
interface Highlight { id: string; verse_id: number; color: string }

const DOT: Record<string, string> = Object.fromEntries(HIGHLIGHT_COLORS.map((c) => [c.id, c.dot]));

function verseRef(verseId: number) {
  const { book, chapter } = decodeVerseId(verseId);
  const b = BOOK_BY_NUM.get(book);
  return { label: formatVerseId(verseId), href: b ? `/read/${b.slug}/${chapter}` : '#' };
}

export default function MyLibraryPage() {
  const [state, setState] = useState<'loading' | 'signedout' | 'ready'>('loading');
  const [notes, setNotes] = useState<Note[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  useEffect(() => {
    fetch('/api/annotations/all')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { highlights: Highlight[]; notes: Note[] }) => {
        setNotes(d.notes);
        setHighlights(d.highlights);
        setState('ready');
      })
      .catch(() => setState('signedout'));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-scripture text-3xl font-medium text-stone-800 dark:text-stone-100">My library</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500 dark:text-stone-400">
          Every verse you have highlighted and every note you have written, in one place. Tap any
          reference to jump back to it in the reader.
        </p>
      </header>

      {state === 'loading' ? (
        <p className="py-16 text-center text-sm text-stone-400">Loading…</p>
      ) : state === 'signedout' ? (
        <div className="py-16 text-center">
          <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
            Sign in to see your highlights and notes.
          </p>
          <Link
            href="/auth/sign-in"
            className="rounded-full bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
          >
            Sign in
          </Link>
        </div>
      ) : notes.length === 0 && highlights.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Nothing saved yet. Open a chapter, tap a verse, and highlight it or add a note.
          </p>
          <Link href="/read/jhn/1" className="mt-4 inline-block text-sm font-medium text-amber-700 hover:text-amber-800">
            Start reading →
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {notes.length > 0 && (
            <section>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                Notes ({notes.length})
              </h2>
              <div className="space-y-2">
                {notes.map((n) => {
                  const ref = verseRef(n.verse_id);
                  return (
                    <div
                      key={n.id}
                      className="rounded-xl border border-stone-200 bg-white/60 px-4 py-3 shadow-sm dark:border-stone-800 dark:bg-stone-800/40"
                    >
                      <Link href={ref.href} className="font-scripture text-sm font-medium text-amber-700 hover:text-amber-800">
                        {ref.label}
                      </Link>
                      <p className="mt-1 whitespace-pre-line text-sm text-stone-700 dark:text-stone-300">{n.body}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {highlights.length > 0 && (
            <section>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                Highlights ({highlights.length})
              </h2>
              <div className="flex flex-wrap gap-2">
                {highlights.map((h) => {
                  const ref = verseRef(h.verse_id);
                  return (
                    <Link
                      key={h.id}
                      href={ref.href}
                      className="flex items-center gap-2 rounded-full border border-stone-200 bg-white/60 px-3 py-1.5 text-sm text-stone-700 shadow-sm hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-800/40 dark:text-stone-300 dark:hover:bg-stone-800"
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
