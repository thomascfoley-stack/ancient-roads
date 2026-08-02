'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatVerseId } from '@bible/verse-id';
import { verseHref } from '@/lib/verse-link';
import { HIGHLIGHT_COLORS } from '@/lib/highlight-colors';

interface Note { id: string; verse_id: number; body: string; updated_at: string }
interface Highlight { id: string; verse_id: number; color: string }

const DOT: Record<string, string> = Object.fromEntries(HIGHLIGHT_COLORS.map((c) => [c.id, c.dot]));

// The href is built by the SHARED helper so the test can drive the shipped function rather than a
// copy of it. The fragment targets the verse's own id (verse-display.tsx); the reader scrolls to
// it once the chapter has loaded, because the element does not exist at navigation time for the
// browser to anchor natively.
function verseRef(verseId: number) {
  return { label: formatVerseId(verseId), href: verseHref(verseId) };
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
            className="inline-flex min-h-[44px] items-center rounded-full bg-accent-700 px-5 text-sm font-semibold text-stone-50 hover:bg-accent-800 active:bg-accent-900 dark:bg-accent-500 dark:hover:bg-accent-400"
          >
            Sign in
          </Link>
        </div>
      ) : notes.length === 0 && highlights.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Nothing saved yet. Open a chapter, tap a verse, and highlight it or add a note.
          </p>
          <Link href="/read/jhn/1" className="mt-4 inline-flex min-h-[44px] items-center text-sm font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300">
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
                      className="rounded-xl bg-paper px-4 py-3 shadow-paper dark:bg-stone-800/60 dark:shadow-none"
                    >
                      <Link href={ref.href} className="inline-flex min-h-[32px] items-center font-scripture text-sm font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300">
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
                      className="flex min-h-[44px] items-center gap-2 rounded-full bg-paper px-4 text-sm text-stone-700 shadow-paper hover:bg-stone-100 active:bg-stone-200 dark:bg-stone-800/60 dark:text-stone-300 dark:shadow-none dark:hover:bg-stone-800"
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
