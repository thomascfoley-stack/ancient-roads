'use client';

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { ChapterData } from '@/lib/bible';
import { HIGHLIGHT_BG } from '@/lib/highlight-colors';
import { flattenToSegments, type HighlightRange } from '@/lib/highlight-range';
import { useTextAnnotation, type AnnotationTarget } from '@/lib/use-text-annotation';
import { SelectionPopover } from './selection-popover';
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  // Resolve a selection boundary to its verse container (the shared engine's target contract;
  // the Phase-2 WorkReader supplies the dataset.sectionText equivalent). The canonical length
  // comes from chapter data, not the DOM — v.text stays the offset authority.
  const resolveTarget = useCallback(
    (node: Node): AnnotationTarget | null => {
      let n: Node | null = node;
      while (n) {
        if (n instanceof HTMLElement && n.dataset.verseText) {
          const verse = Number(n.dataset.verseText);
          const text = data.verses.find((v) => v.verse === verse)?.text ?? '';
          if (!text) return null;
          return { kind: 'verse', key: String(verse), textLen: text.length, container: n };
        }
        n = n.parentNode;
      }
      return null;
    },
    [data],
  );

  const { pending, dismiss } = useTextAnnotation(rootRef, resolveTarget);

  function highlightPending(color: string) {
    if (pending && onAddHighlight) {
      onAddHighlight(Number(pending.key), { start: pending.start, end: pending.end }, color);
    }
    dismiss();
  }

  function openPending(tab: StudyTab) {
    if (!pending) return;
    const verse = Number(pending.key);
    dismiss();
    onOpen?.(verse, tab);
  }

  // Hand the selection to /ask as a PREFILL (never auto-submit — a reload must not spend a
  // teacher run). The question carries the excerpt + locus, no host URL.
  function askPending() {
    if (!pending) return;
    const excerpt = pending.text.length > 220 ? `${pending.text.slice(0, 217)}…` : pending.text;
    const q = `What have commentators said about "${excerpt}" (${bookName} ${data.chapter}:${pending.key})?`;
    dismiss();
    router.push(`/ask?q=${encodeURIComponent(q)}`);
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
                  anchoring mapper (rangeToOffsetsInContainer) walks it to derive offsets into v.text. */}
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

      {/* The shared Logos-style selection popover (Phase 1): floating card on md+, docked-low bar
          on mobile. No onBookmark yet — Phase 3 (bookmarks table) wires it. */}
      {pending && (
        <SelectionPopover
          pending={pending}
          contextLabel={`${bookName} ${data.chapter}:${pending.key} · ${translation.toUpperCase()}`}
          copyLineNo={pending.key}
          signedIn={!!signedIn}
          onHighlight={onAddHighlight ? highlightPending : undefined}
          onAddNote={onOpen ? () => openPending('notes') : undefined}
          onAsk={askPending}
          onOpenCommentaries={onOpen ? () => openPending('commentaries') : undefined}
          onDismiss={dismiss}
        />
      )}
    </div>
  );
}
