'use client';
// The verses themselves — shared by the hover card, the touch sheet and the reader pane so that a
// passage reads identically wherever it is surfaced, and so the loading and failure copy is
// written once instead of three times with three different tones.
//
// Verse numbers use the reader's own superscript treatment (`verse-display.tsx`) rather than a
// second style invented here: a preview that renders Scripture differently from the reader reads
// as a different kind of thing, which is the opposite of the point.

import type { PreviewVerse } from '@/lib/verse-preview';

// 'empty'      -> the chapter loaded, this TRANSLATION has no such verse (a real difference)
// 'unresolved' -> the reference itself did not resolve to any chapter (a bad reference)
// Collapsing these told a reader with a malformed ref that their translation was at fault.
export type PassageStatus = 'loading' | 'ready' | 'empty' | 'unresolved' | 'error';

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
  translationName,
  fallback,
}: {
  status: PassageStatus;
  verses: PreviewVerse[];
  /** Shown under the text — e.g. that a long span was capped. Never implies completeness. */
  note?: string;
  /** Full name of the translation being read, so an absent verse can name it. */
  translationName?: string;
  /** Offer to re-read the same reference in a translation that may carry it. */
  fallback?: { name: string; onSelect: () => void };
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

  if (status === 'unresolved') {
    return (
      <p className="py-1 text-sm text-stone-500 dark:text-stone-400">
        No verses found for this reference.
      </p>
    );
  }

  if (status === 'empty' || verses.length === 0) {
    // NOT AN ERROR, AND NOT A MISSING FILE. The chapter loaded; this translation simply has no
    // such verse. Translations genuinely disagree here — measured across the shipping set,
    // Matthew 23:14 is present in WEB, KJV, YLT and Geneva (39 verses) and absent from BSB and
    // ASV (38), and the topical indexes are KJV-era so they cite it. The old copy, "No verses
    // found for this reference", reported that as a lookup failure and read like a bug.
    //
    // What this must NOT do is explain WHY the verse is absent. Whether a verse is a later
    // addition is a text-critical judgement, and the product is a concordance, not a
    // commentator (CLAUDE.md, the product guarantee). State the fact, name the translation,
    // and offer one that may carry it — the reader draws their own conclusion.
    return (
      <div className="py-1 text-sm text-stone-500 dark:text-stone-400">
        <p>
          {translationName
            ? `This passage is not in the ${translationName}.`
            : 'This passage is not in the current translation.'}
        </p>
        <p className="mt-1 text-xs">Translations differ on a small number of verses.</p>
        {fallback && (
          <button
            type="button"
            onClick={fallback.onSelect}
            className="mt-2 text-xs font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300"
          >
            Read it in the {fallback.name}
          </button>
        )}
      </div>
    );
  }

  const groups = groupByChapter(verses);
  return (
    <div>
      {groups.map((g, gi) => (
        <div key={`${g.bookSlug}-${g.chapter}`} className={gi > 0 ? 'mt-3' : undefined}>
          {groups.length > 1 && (
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              {g.bookName} {g.chapter}
            </p>
          )}
          <p className="font-serif text-base leading-relaxed text-stone-900 dark:text-stone-200">
            {g.verses.map((v) => (
              <span key={v.verse}>
                <sup className="relative mr-0.5 select-none font-sans text-micro font-medium text-accent-600 [font-feature-settings:'onum'] dark:text-accent-400">
                  {v.verse}
                </sup>
                {v.text}{' '}
              </span>
            ))}
          </p>
        </div>
      ))}
      {note && <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{note}</p>}
    </div>
  );
}
