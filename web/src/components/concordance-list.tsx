'use client';

import { useEffect, useState } from 'react';
import { fetchConcordance, type Concordance } from '@/lib/original';
import { formatVerseId } from '@bible/verse-id';
import { verseHref } from '@/lib/verse-link';

/**
 * Every other verse a Strong's number occurs in, as links into the reader.
 *
 * MOVED HERE FROM word-panel.tsx (A042/A044, QA fleet 2026-08-16) rather than copied. Two findings
 * pushed the same way:
 *
 *  - A044 said the reader's occurrence links "jump to the top of the chapter, not the specific
 *    verse" — true, and the QA report filed it as the SAME defect the A7b walk found in
 *    /library/notes, which is why `lib/verse-link.ts` exists. A second surface building its own
 *    `/read/<slug>/<chapter>` string is how that defect got a second life; one component calling
 *    the shipped `verseHref` is how it stops getting a third.
 *  - A042 said the standalone /library/word-study lexicon is missing the cross-verse occurrence
 *    list. It was. `fetchConcordance` is keyed by a Strong's number alone, which that page has, so
 *    the gap was a missing call site, not missing data.
 *
 * Only the CHROME differs between the two surfaces (the reader's panel is horizontally padded by
 * this section, the standalone sheet by its own scroll container), so that is the only thing the
 * caller supplies.
 */

const PAGE = 12;

export function ConcordanceList({
  strong,
  // How many occurrences are worth showing. The reader's word panel passes 2 because the reader is
  // already standing in one of them and a one-item list would link to the verse on screen; the
  // standalone lexicon takes the default 1, where "occurs exactly once, in Jude 9" is precisely the
  // fact someone came to a lexicon for.
  minCount = 1,
  className = 'border-t edge px-5 py-4',
}: {
  strong: string;
  minCount?: number;
  className?: string;
}) {
  const [concordance, setConcordance] = useState<Concordance | null>(null);
  const [page, setPage] = useState(0);

  // The load is disowned when `strong` changes. Same guard, same reason, as the standalone
  // lexicon's language load (word-study/page.tsx): both surfaces let you move to another word
  // before the first fetch settles, and without the guard an abandoned response writes itself into
  // state — here that would list one word's verses under another word's entry, which reads as a
  // fact about the word on screen and is not one.
  useEffect(() => {
    let cancelled = false;
    setConcordance(null);
    setPage(0);
    if (!strong) return;
    fetchConcordance(strong).then((c) => {
      if (!cancelled) setConcordance(c);
    });
    return () => {
      cancelled = true;
    };
  }, [strong]);

  if (!concordance || concordance.count < minCount) return null;

  return (
    <div className={className}>
      <p className="mb-2 text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
        {/* "Also appears in N verses" until this moved: the count is every occurrence INCLUDING the
            verse the reader is on, so "also" overstated it by one there, and on the standalone
            lexicon there is no "here" for an occurrence to be additional to. */}
        Appears in {concordance.count} verse{concordance.count === 1 ? '' : 's'}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {concordance.verseIds.slice(page * PAGE, page * PAGE + PAGE).map((vid) => {
          // A044: `#v<n>`, via the one helper the reader already honours — its deep-link effect
          // parses exactly this fragment and scrolls to the verse. An id whose book does not
          // resolve gives '#', and an inert chip is better than a chip that navigates to the top
          // of the page, so that case keeps the pre-existing "render it, don't link it" behaviour.
          const href = verseHref(vid);
          return (
            <a
              key={vid}
              href={href === '#' ? undefined : href}
              className="bg-stone-100 px-2.5 py-1 text-xs text-stone-600 transition-colors ease-gentle hover:bg-accent-100 hover:text-accent-800 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-accent-950/40 dark:hover:text-accent-300"
            >
              {formatVerseId(vid)}
            </a>
          );
        })}
      </div>
      {concordance.count > PAGE && (
        <div className="mt-3 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="inline-flex min-h-[44px] items-center px-2 hover:text-stone-600 disabled:opacity-40 dark:hover:text-stone-300"
          >
            ← prev
          </button>
          <span>
            {page * PAGE + 1}–{Math.min((page + 1) * PAGE, concordance.count)} of {concordance.count}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={(page + 1) * PAGE >= concordance.count}
            className="inline-flex min-h-[44px] items-center px-2 hover:text-stone-600 disabled:opacity-40 dark:hover:text-stone-300"
          >
            next →
          </button>
        </div>
      )}
    </div>
  );
}
