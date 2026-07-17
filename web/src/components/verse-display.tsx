'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChapterData } from '@/lib/bible';
import { HIGHLIGHT_BG, HIGHLIGHT_COLORS } from '@/lib/highlight-colors';
import { flattenToSegments, rangeToVerseOffsets, snapToWords, type HighlightRange } from '@/lib/highlight-range';
import type { StudyTab } from './study-panel';

// A stored highlight span as the reader holds it: character offsets into v.text (null/null = a
// legacy whole-verse highlight), the background color, and the translation it was anchored in.
export interface StoredSpan {
  id?: string;
  start: number | null;
  end: number | null;
  color: string;
  textColor?: string | null;
  translation?: string | null;
}

interface PendingSelection {
  verse: number;
  start: number;
  end: number;
  text: string;
}

export function VerseDisplay({
  data,
  bookName,
  translation,
  selectedVerse,
  onVerseClick,
  highlights,
  notedVerses,
  signedIn,
  onAddHighlight,
  onOpen,
}: {
  data: ChapterData;
  bookName: string;
  translation: string;
  selectedVerse: number | null;
  onVerseClick: (verse: number) => void;
  highlights?: Map<number, StoredSpan[]>;
  notedVerses?: Set<number>;
  signedIn?: boolean;
  onAddHighlight?: (verse: number, range: { start: number; end: number } | null, color: string) => void;
  onOpen?: (verse: number, tab: StudyTab) => void;
}) {
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Selection-first: ride selectionchange (works on touch AND mouse; native copy still works).
  // We never float over the selection where the OS callout sits — the action bar docks low (below).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    function evaluate() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPending(null);
        return;
      }
      const range = sel.getRangeAt(0);
      // The verse-text container the selection is anchored in.
      let node: Node | null = range.startContainer;
      let container: HTMLElement | null = null;
      while (node) {
        if (node instanceof HTMLElement && node.dataset.verseText) {
          container = node;
          break;
        }
        node = node.parentNode;
      }
      if (!container || !rootRef.current?.contains(container)) {
        setPending(null);
        return;
      }
      const verse = Number(container.dataset.verseText);
      const text = data.verses.find((v) => v.verse === verse)?.text ?? '';
      const raw = rangeToVerseOffsets(range, container, text.length);
      if (!raw) {
        setPending(null);
        return;
      }
      const snapped = snapToWords(text, raw.start, raw.end);
      if (!snapped) {
        setPending(null);
        return;
      }
      setPending({ verse, start: snapped.start, end: snapped.end, text: text.slice(snapped.start, snapped.end) });
    }
    function onChange() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(evaluate, 60);
    }
    document.addEventListener('selectionchange', onChange);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      if (timer) clearTimeout(timer);
    };
  }, [data]);

  function highlightPending(color: string) {
    if (pending && onAddHighlight) onAddHighlight(pending.verse, { start: pending.start, end: pending.end }, color);
    window.getSelection()?.removeAllRanges();
    setPending(null);
  }

  return (
    <div ref={rootRef} className="mx-auto max-w-2xl px-5 py-8 sm:px-6">
      <h1 className="mb-8 font-scripture text-3xl font-medium text-stone-800 dark:text-stone-100">
        {bookName} {data.chapter}
      </h1>
      <div className="reading-scale font-scripture leading-[1.9] text-stone-800 dark:text-stone-200">
        {data.verses.map((v) => {
          if (!v.text) return null;
          const isSelected = v.verse === selectedVerse;
          const spans = highlights?.get(v.verse) ?? [];
          // Translation pin (§1.3): a sub-verse span renders exactly only in the translation it was
          // made in. Whole-verse (null range) and null-translation (legacy) spans always render.
          const native: HighlightRange[] = [];
          let foreignColor: string | null = null;
          for (const s of spans) {
            const wholeVerse = s.start == null || s.end == null;
            const sameTranslation = s.translation == null || s.translation === translation;
            if (wholeVerse || sameTranslation) {
              native.push({ start: s.start ?? 0, end: s.end ?? v.text.length, color: s.color, id: s.id });
            } else {
              foreignColor = s.color; // degrade to a verse-level indicator, never lost
            }
          }
          const segments = flattenToSegments(v.text.length, native);
          const hasNote = notedVerses?.has(v.verse);
          const outerBg = isSelected ? 'bg-accent-100/70 dark:bg-accent-500/20' : '';
          return (
            <span
              key={v.verse}
              data-verse={v.verse}
              className={`verse inline rounded ${outerBg}`}
              onClick={() => {
                // Don't hijack an in-progress text selection — let the user copy / annotate.
                const sel = window.getSelection();
                if (sel && !sel.isCollapsed) return;
                onVerseClick(v.verse);
              }}
            >
              <sup className="mr-0.5 font-sans text-[11px] font-semibold text-accent-600/80 select-none dark:text-accent-300/80">
                {v.verse}
              </sup>
              {foreignColor && (
                <sup
                  className={`mr-0.5 inline-block h-1.5 w-1.5 rounded-full align-super ${HIGHLIGHT_BG[foreignColor] ?? ''} select-none`}
                  title="Highlighted in another translation"
                />
              )}
              {/* The verse-text container: its text nodes concatenate to exactly v.text, so the
                  anchoring mapper (rangeToVerseOffsets) walks it to derive offsets into v.text. */}
              <span data-verse-text={v.verse}>
                {segments.map((seg, i) =>
                  seg.color ? (
                    <span key={i} className={`rounded-[3px] ${HIGHLIGHT_BG[seg.color] ?? ''}`}>
                      {v.text.slice(seg.start, seg.end)}
                    </span>
                  ) : (
                    <span key={i}>{v.text.slice(seg.start, seg.end)}</span>
                  ),
                )}
              </span>{' '}
              {hasNote && (
                <sup className="mr-0.5 select-none text-accent-600 dark:text-accent-300" title="You have a note here">
                  ✎
                </sup>
              )}
            </span>
          );
        })}
      </div>

      {/* Selection-first annotation bar — DOCKED LOW (§3/§4), works on touch and mouse. Never
          hover-gated, never floated over the selection. Sits above the mobile nav. */}
      {pending && (
        <div
          className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 md:bottom-6"
          // Keep the selection alive: don't let a tap on the bar clear it before we read it.
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => e.preventDefault()}
        >
          <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-full bg-stone-900/95 px-3 py-2 shadow-deep dark:bg-stone-800">
            <span className="shrink-0 px-1 text-xs font-medium text-stone-300">
              {bookName} {data.chapter}:{pending.verse}
            </span>
            {signedIn && onAddHighlight ? (
              HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => highlightPending(c.id)}
                  aria-label={`Highlight ${c.id}`}
                  className={`h-7 w-7 shrink-0 rounded-full ${c.dot} ring-1 ring-white/20 transition-transform active:scale-90`}
                />
              ))
            ) : (
              <a href="/auth/sign-in" className="shrink-0 px-1 text-xs font-semibold text-accent-300">
                Sign in to highlight
              </a>
            )}
            <span className="mx-0.5 h-5 w-px shrink-0 bg-white/15" />
            <button
              onClick={() => {
                if (onOpen) onOpen(pending.verse, 'commentaries');
                window.getSelection()?.removeAllRanges();
                setPending(null);
              }}
              title="Commentaries on this verse"
              className="shrink-0 rounded-full px-2 py-1 text-stone-200 hover:text-white"
            >
              &#10077;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
