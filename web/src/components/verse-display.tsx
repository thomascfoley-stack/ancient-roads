'use client';

import { useRef, useState } from 'react';
import type { ChapterData } from '@/lib/bible';
import { HIGHLIGHT_BG, HIGHLIGHT_COLORS } from '@/lib/highlight-colors';
import type { StudyTab } from './study-panel';

export function VerseDisplay({
  data,
  bookName,
  selectedVerse,
  onVerseClick,
  highlights,
  notedVerses,
  signedIn,
  onSetHighlight,
  onClearHighlight,
  onOpen,
}: {
  data: ChapterData;
  bookName: string;
  selectedVerse: number | null;
  onVerseClick: (verse: number) => void;
  highlights?: Map<number, string>;
  notedVerses?: Set<number>;
  signedIn?: boolean;
  onSetHighlight?: (verse: number, color: string) => void;
  onClearHighlight?: (verse: number) => void;
  onOpen?: (verse: number, tab: StudyTab) => void;
}) {
  const [hover, setHover] = useState<{ verse: number; left: number; top: number } | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showFor(verse: number, el: HTMLElement) {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    const r = el.getClientRects()[0];
    if (!r) return;
    setHover({ verse, left: Math.max(8, r.left), top: Math.max(60, r.top - 42) });
  }
  function scheduleClear() {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setHover(null), 140);
  }
  function keepOpen() {
    if (clearTimer.current) clearTimeout(clearTimer.current);
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-6">
      <h1 className="mb-8 font-scripture text-3xl font-medium text-stone-800 dark:text-stone-100">
        {bookName} {data.chapter}
      </h1>
      <div className="reading-scale font-scripture leading-[1.9] text-stone-800 dark:text-stone-200">
        {data.verses.map((v) => {
          if (!v.text) return null;
          const isSelected = v.verse === selectedVerse;
          const highlightColor = highlights?.get(v.verse);
          const hasNote = notedVerses?.has(v.verse);
          const bg = isSelected
            ? 'bg-accent-100/80 dark:bg-accent-500/25'
            : highlightColor
              ? HIGHLIGHT_BG[highlightColor] ?? 'hover:bg-stone-100/70 dark:hover:bg-stone-800/60'
              : 'hover:bg-stone-100/70 dark:hover:bg-stone-800/60';
          return (
            <span
              key={v.verse}
              className={`inline cursor-pointer rounded transition-colors ${bg}`}
              onClick={() => {
                // Don't hijack an in-progress text selection (long-press on
                // touch, drag on desktop) — let the user copy scripture.
                const sel = window.getSelection();
                if (sel && !sel.isCollapsed) return;
                onVerseClick(v.verse);
              }}
              onMouseEnter={(e) => showFor(v.verse, e.currentTarget)}
              onMouseLeave={scheduleClear}
            >
              <sup className="mr-0.5 font-sans text-[11px] font-semibold text-accent-600/80 select-none dark:text-accent-300/80">
                {v.verse}
              </sup>
              <span>{v.text} </span>
              {hasNote && (
                <sup className="mr-0.5 select-none text-accent-600 dark:text-accent-300" title="You have a note here">
                  ✎
                </sup>
              )}
            </span>
          );
        })}
      </div>

      {/* Hover quick-menu (pointer devices only) */}
      {hover && onOpen && (
        <div
          className="fixed z-40 hidden items-center gap-1 rounded-full bg-paper px-1.5 py-1 shadow-float [@media(hover:hover)]:flex dark:border-stone-700 dark:bg-stone-800"
          style={{ left: hover.left, top: hover.top }}
          onMouseEnter={keepOpen}
          onMouseLeave={scheduleClear}
        >
          {signedIn && onSetHighlight &&
            HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onSetHighlight(hover.verse, c.id);
                  setHover(null);
                }}
                aria-label={`Highlight ${c.id}`}
                className={`h-5 w-5 rounded-full ${c.dot} ring-1 ring-black/5 transition-transform hover:scale-110`}
              />
            ))}
          {signedIn && highlights?.get(hover.verse) && onClearHighlight && (
            <button
              onClick={() => {
                onClearHighlight(hover.verse);
                setHover(null);
              }}
              aria-label="Clear highlight"
              className="px-1 text-xs text-stone-400 hover:text-stone-600"
            >
              ✕
            </button>
          )}
          <span className="mx-0.5 h-4 w-px bg-stone-200 dark:bg-stone-600" />
          <button
            onClick={() => {
              onOpen(hover.verse, 'word');
              setHover(null);
            }}
            title="Word study"
            className="rounded-full px-1.5 py-0.5 text-sm font-semibold text-stone-500 hover:text-accent-700 dark:text-stone-300"
          >
            אα
          </button>
          <button
            onClick={() => {
              onOpen(hover.verse, 'commentaries');
              setHover(null);
            }}
            title="Commentaries"
            className="rounded-full px-1.5 py-0.5 text-stone-500 hover:text-accent-700 dark:text-stone-300"
          >
            &#10077;
          </button>
        </div>
      )}
    </div>
  );
}
