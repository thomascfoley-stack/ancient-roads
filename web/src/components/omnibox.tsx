'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { typeahead, parseRef, type ParseOutcome } from '@bible/ref-parse';
import { webVerseCounts } from '@bible/verse-counts';
import { type Book, bookUrl } from '@/lib/bible';

export function Omnibox() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const result = query.trim().length > 0
    ? typeahead(query, { verseCounts: webVerseCounts })
    : null;

  const navigate = useCallback(
    (book: Book, chapter: number) => {
      router.push(bookUrl(book, chapter));
      setOpen(false);
    },
    [router],
  );

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!result) return;
      if (result.kind === 'ref' && result.outcome.ok) {
        const ref = result.outcome.ref;
        const firstRange = ref.ranges[0];
        if (!firstRange) return;
        const chapter = Math.floor((firstRange.start % 1_000_000) / 1_000);
        navigate(ref.book, chapter);
      } else if (result.kind === 'completions' && result.books.length === 1) {
        const book = result.books[0]!;
        navigate(book, 1);
      }
    },
    [result, navigate],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-stone-200">
        <form onSubmit={onSubmit}>
          <div className="flex items-center border-b border-stone-100 px-4">
            <svg
              className="h-4 w-4 text-stone-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Go to passage, e.g. John 3:16"
              className="flex-1 bg-transparent px-3 py-4 text-sm text-stone-800 placeholder:text-stone-400 outline-none"
            />
            <kbd className="hidden rounded border border-stone-200 px-1.5 py-0.5 text-[10px] text-stone-400 sm:inline-block">
              esc
            </kbd>
          </div>
        </form>

        <div className="max-h-80 overflow-auto p-2">
          {!result && (
            <p className="px-3 py-4 text-center text-sm text-stone-400">
              Type a book, chapter, or verse reference
            </p>
          )}

          {result?.kind === 'completions' && result.books.length > 0 && (
            <ul>
              {result.books.map((b) => (
                <li key={b.slug}>
                  <button
                    onClick={() => navigate(b, 1)}
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-50"
                  >
                    <span className="font-medium text-stone-800">
                      {b.name}
                    </span>
                    <span className="ml-auto text-xs text-stone-400">
                      {b.chapterCount} ch
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {result?.kind === 'completions' && result.books.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-stone-400">
              No books match
            </p>
          )}

          {result?.kind === 'ref' && (
            <RefResult
              outcome={result.outcome}
              onNavigate={navigate}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function RefResult({
  outcome,
  onNavigate,
}: {
  outcome: ParseOutcome;
  onNavigate: (book: Book, chapter: number) => void;
}) {
  if (outcome.ok) {
    const ref = outcome.ref;
    const firstRange = ref.ranges[0];
    const chapter = firstRange
      ? Math.floor((firstRange.start % 1_000_000) / 1_000)
      : 1;
    return (
      <button
        onClick={() => onNavigate(ref.book, chapter)}
        className="flex w-full items-center rounded-lg px-3 py-3 text-left hover:bg-stone-50"
      >
        <div>
          <p className="text-sm font-semibold text-stone-800">{ref.display}</p>
          <p className="text-xs text-stone-400">{ref.book.testament} &middot; {ref.kind.replace('_', ' ')}</p>
        </div>
        <span className="ml-auto text-xs text-stone-400">Enter &rarr;</span>
      </button>
    );
  }

  // Parse failed — show candidates if available, otherwise the error
  if (outcome.candidates && outcome.candidates.length > 0) {
    return (
      <div>
        <p className="px-3 py-2 text-xs text-stone-400">{outcome.reason}</p>
        <ul>
          {outcome.candidates.map((b) => (
            <li key={b.slug}>
              <button
                onClick={() => onNavigate(b, 1)}
                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-50"
              >
                <span className="font-medium text-stone-800">{b.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <p className="px-3 py-4 text-center text-sm text-stone-400">
      {outcome.reason}
    </p>
  );
}
