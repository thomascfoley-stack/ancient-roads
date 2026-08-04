'use client';
// The verses themselves — shared by the hover card, the touch sheet and the reader pane so that a
// passage reads identically wherever it is surfaced, and so the loading and failure copy is
// written once instead of three times with three different tones.
//
// Verse numbers use the reader's own superscript treatment (`verse-display.tsx`) rather than a
// second style invented here: a preview that renders Scripture differently from the reader reads
// as a different kind of thing, which is the opposite of the point.

import type { PreviewVerse } from '@/lib/verse-preview';

export type PassageStatus = 'loading' | 'ready' | 'empty' | 'error';

interface ChapterGroup {
  bookName: string;
  bookSlug: string;
  chapter: number;
  verses: PreviewVerse[];
}

/** Group consecutive verses by chapter so a cross-chapter span can label where each part starts. */
function groupByChapter(verses: PreviewVerse[]): ChapterGroup[] {
  const groups: ChapterGroup[] = [];
  for (const v of verses) {
    const last = groups[groups.length - 1];
    if (last && last.chapter === v.chapter && last.bookSlug === v.bookSlug) last.verses.push(v);
    else groups.push({ bookName: v.bookName, bookSlug: v.bookSlug, chapter: v.chapter, verses: [v] });
  }
  return groups;
}

export function PassageView({
  status,
  verses,
  note,
}: {
  status: PassageStatus;
  verses: PreviewVerse[];
  /** Shown under the text — e.g. that a long span was capped. Never implies completeness. */
  note?: string;
}) {
  if (status === 'loading') {
    return (
      <div className="space-y-2 py-1" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading passage</span>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-3 animate-pulse rounded bg-stone-200 dark:bg-stone-700 ${
              i === 2 ? 'w-2/3' : 'w-full'
            }`}
          />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <p role="alert" className="py-1 text-sm text-red-800 dark:text-red-200">
        This passage could not be loaded.
      </p>
    );
  }

  if (status === 'empty' || verses.length === 0) {
    return (
      <p className="py-1 text-sm text-stone-500 dark:text-stone-400">
        No verses found for this reference.
      </p>
    );
  }

  const groups = groupByChapter(verses);
  return (
    <div>
      {groups.map((g, gi) => (
        <div key={`${g.bookSlug}-${g.chapter}`} className={gi > 0 ? 'mt-3' : undefined}>
          {groups.length > 1 && (
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-400">
              {g.bookName} {g.chapter}
            </p>
          )}
          <p className="font-serif text-base leading-relaxed text-stone-800 dark:text-stone-200">
            {g.verses.map((v) => (
              <span key={v.verse}>
                <sup className="relative mr-0.5 select-none font-sans text-micro font-semibold text-accent-600/80 dark:text-accent-300/80">
                  {v.verse}
                </sup>
                {v.text}{' '}
              </span>
            ))}
          </p>
        </div>
      ))}
      {note && <p className="mt-2 text-xs text-stone-400">{note}</p>}
    </div>
  );
}
