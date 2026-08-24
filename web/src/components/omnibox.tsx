'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { DialogPanel } from '@/lib/use-dialog';
import { useRouter } from 'next/navigation';
import { typeahead, parseRef, type ParseOutcome } from '@bible/ref-parse';
import { webVerseCounts } from '@bible/verse-counts';
import { decodeVerseId, encodeVerseId } from '@bible/verse-id';
import { type Book } from '@/lib/bible';
import { verseHref } from '@/lib/verse-link';

// Fired by the mobile Search tab (and anything else that wants the omnibox).
export const OMNIBOX_OPEN_EVENT = 'ap:omnibox';

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
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(OMNIBOX_OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OMNIBOX_OPEN_EVENT, onOpenEvent);
    };
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

  // `verse` defaults to 1 (the top of the chapter) for callers that only know a book/chapter —
  // routed through the SAME `verseHref` the reader honors, so a reference with a real verse
  // (`John 3:16`) lands there instead of silently dropping to verse 1 (bookUrl's behavior, and
  // the bug: `bookUrl` emits no `#v` anchor at all).
  const navigate = useCallback(
    (book: Book, chapter: number, verse = 1) => {
      router.push(verseHref(encodeVerseId({ book: book.bookNum, chapter, verse })));
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
        const { chapter, verse } = decodeVerseId(firstRange.start);
        navigate(ref.book, chapter, verse);
      } else if (result.kind === 'completions' && result.books.length === 1) {
        const book = result.books[0]!;
        navigate(book, 1);
      }
    },
    [result, navigate],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[max(3rem,env(safe-area-inset-top))] sm:pt-[18vh]">
      {/* PRD §3 scrim: rgba(26,20,15,0.32) light / rgba(251,248,242,0.08) dark, no blur. */}
      <div
        className="absolute inset-0 bg-stone-950/[0.32] dark:bg-stone-50/[0.08]"
        onClick={() => setOpen(false)}
      />
      {/* PRD §6 modal: parchment surface, 1px hairline, no shadow, square corners. */}
      {/* D39 (DEEP_SWEEP): this scrim+panel had no role="dialog"/aria-modal, no focus trap and
          no focus restore — Tab walked straight out of the panel into the page beneath the
          scrim, and closing left focus on <body> rather than the control that opened it.
          use-dialog was written for exactly this and is wired into five other overlays; the
          omnibox missed it. DialogPanel mounts the hook only while the overlay is open. */}
      <DialogPanel
        label="Go to a passage"
        onClose={() => setOpen(false)}
        className="relative w-full max-w-lg border edge bg-paper animate-fade-in dark:bg-stone-900"
      >
        <form onSubmit={onSubmit}>
          {/* The input carries `focus-quiet`, which suppresses the global :focus-visible
              outline, and nothing replaced it: focus on the omnibox was completely
              invisible. Tabbing back from the result list showed no indicator at all.
              The rule for .focus-quiet is that the container shows focus instead, so the
              container now actually does. */}
 <div className="flex items-center border-b edge edge-focus px-4 transition-colors ease-gentle">
            <svg
              className="h-4 w-4 shrink-0 text-stone-500 dark:text-stone-400"
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
              aria-label="Go to a passage"
              className="focus-quiet min-w-0 flex-1 bg-transparent px-3 py-4 text-base text-stone-800 outline-none placeholder:text-stone-400 sm:text-sm dark:text-stone-100 dark:placeholder:text-stone-500"
            />
 <kbd className="hidden rounded border edge px-1.5 py-0.5 text-micro text-stone-500 dark:text-stone-400 [@media(hover:hover)]:sm:inline-block">
              esc
            </kbd>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close search"
              className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-stone-500 dark:text-stone-400 hover:text-stone-600 active:bg-stone-200/60 [@media(hover:hover)]:hidden dark:active:bg-stone-800"
            >
              <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </form>

        <div className="max-h-[min(20rem,50dvh)] overflow-auto overscroll-contain p-2">
          {!result && (
            <p className="px-3 py-4 text-center text-sm text-stone-500 dark:text-stone-400">
              Type a book, chapter, or verse reference
            </p>
          )}

          {result?.kind === 'completions' && result.books.length > 0 && (
            <ul>
              {result.books.map((b) => (
                <li key={b.slug}>
                  <button
                    onClick={() => navigate(b, 1)}
                    className="flex min-h-[44px] w-full items-center rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-100/70 active:bg-stone-200/60 dark:hover:bg-stone-800 dark:active:bg-stone-800"
                  >
                    <span className="font-medium text-stone-800 dark:text-stone-100">
                      {b.name}
                    </span>
                    <span className="ml-auto text-xs text-stone-500 dark:text-stone-400">
                      {b.chapterCount} ch
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {result?.kind === 'completions' && result.books.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-stone-500 dark:text-stone-400">
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
      </DialogPanel>
    </div>
  );
}

function RefResult({
  outcome,
  onNavigate,
}: {
  outcome: ParseOutcome;
  onNavigate: (book: Book, chapter: number, verse?: number) => void;
}) {
  if (outcome.ok) {
    const ref = outcome.ref;
    const firstRange = ref.ranges[0];
    const { chapter, verse } = firstRange
      ? decodeVerseId(firstRange.start)
      : { chapter: 1, verse: 1 };
    return (
      <button
        onClick={() => onNavigate(ref.book, chapter, verse)}
        className="flex min-h-[44px] w-full items-center rounded-lg px-3 py-3 text-left hover:bg-stone-100/70 active:bg-stone-200/60 dark:hover:bg-stone-800 dark:active:bg-stone-800"
      >
        <div>
          <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">{ref.display}</p>
          <p className="text-xs text-stone-500 dark:text-stone-400">{ref.book.testament} &middot; {ref.kind.replace('_', ' ')}</p>
        </div>
        <span className="ml-auto text-xs text-stone-500 dark:text-stone-400">Enter &rarr;</span>
      </button>
    );
  }

  // Parse failed — show candidates if available, otherwise the error
  if (outcome.candidates && outcome.candidates.length > 0) {
    return (
      <div>
        <p className="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">{outcome.reason}</p>
        <ul>
          {outcome.candidates.map((b) => (
            <li key={b.slug}>
              <button
                onClick={() => onNavigate(b, 1)}
                className="flex min-h-[44px] w-full items-center rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-100/70 active:bg-stone-200/60 dark:hover:bg-stone-800 dark:active:bg-stone-800"
              >
                <span className="font-medium text-stone-800 dark:text-stone-100">{b.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <p className="px-3 py-4 text-center text-sm text-stone-500 dark:text-stone-400">
      {outcome.reason}
    </p>
  );
}
