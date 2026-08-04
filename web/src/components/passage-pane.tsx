'use client';
// The reader pane — the passage opened beside the plan, so reading a day never costs you your
// place in it.
//
// It shows exactly what was CITED by default (1 Kings 18:24-39 is sixteen verses, not a chapter),
// because the citation is the claim the topical index actually made. Reading the surrounding
// chapter is one deliberate press away and lands in this same pane rather than navigating: on a
// phone, following a reference must not turn into leaving the plan and finding your way back.
//
// It is not a replacement for /read — annotations, commentary and the interlinear all live there,
// and the footer link goes to exactly that chapter for anyone who wants them.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PassageView, type PassageStatus } from '@/components/passage-view';
import { TRANSLATIONS, translationAttribution } from '@/lib/bible';
import {
  chaptersInSpan,
  fetchSpanVerses,
  isWholeChapter,
  MAX_PREVIEW_CHAPTERS,
  wholeChapterSpan,
  type PassageTarget,
  type PreviewVerse,
} from '@/lib/verse-preview';

export function PassagePane({
  target,
  translation,
  onClose,
}: {
  target: PassageTarget;
  translation: string;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<PassageStatus>('loading');
  const [verses, setVerses] = useState<PreviewVerse[]>([]);

  // A new reference always starts at what was cited, never inheriting the last one's expansion.
  useEffect(() => {
    setExpanded(false);
  }, [target.verseStart, target.verseEnd]);

  const cited = useMemo(
    () => chaptersInSpan(target.verseStart, target.verseEnd),
    [target.verseStart, target.verseEnd],
  );
  const whole = useMemo(() => wholeChapterSpan(target.verseStart), [target.verseStart]);
  const span = expanded ? whole : cited;

  useEffect(() => {
    let live = true;
    if (span.slices.length === 0) {
      setStatus('empty');
      setVerses([]);
      return;
    }
    setStatus('loading');
    fetchSpanVerses(span, translation)
      .then((got) => {
        // The pane is reused across references; a slow fetch for the PREVIOUS one must not
        // overwrite the current one when it finally lands.
        if (!live) return;
        setVerses(got);
        setStatus(got.length > 0 ? 'ready' : 'empty');
      })
      .catch(() => {
        if (live) setStatus('error');
      });
    return () => {
      live = false;
    };
  }, [span, translation]);

  const first = span.slices[0];
  const abbr = TRANSLATIONS.find((t) => t.id === translation)?.abbr ?? translation.toUpperCase();
  const attribution = translationAttribution(translation);
  // Offering "whole chapter" for a reference that already IS one would be a control that does
  // nothing; offering it across a multi-chapter span would silently narrow what you are reading.
  const canExpand = !expanded && cited.slices.length === 1 && !isWholeChapter(cited);

  const note = span.truncated
    ? `Showing the first ${MAX_PREVIEW_CHAPTERS} of ${span.totalChapters} chapters.`
    : undefined;

  const collapse = useCallback(() => setExpanded(false), []);

  return (
    <section
      aria-label={`Passage: ${target.label}`}
      className="flex max-h-[calc(100vh-2rem)] flex-col rounded-xl bg-paper shadow-paper dark:bg-stone-900/70"
    >
      <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-3 dark:border-stone-700">
        <div className="min-w-0">
          <h3 className="truncate font-serif text-lg text-stone-800 dark:text-stone-100">
            {expanded && first ? `${first.bookName} ${first.chapter}` : target.label}
          </h3>
          <p className="mt-0.5 text-xs text-stone-400">
            {abbr}
            {expanded && <span> · whole chapter</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 shrink-0 rounded px-2 py-1 text-sm text-stone-500 transition-colors ease-gentle hover:text-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:text-stone-400"
        >
          {/* The same control means different things by width: on a phone the pane REPLACED the
              plan, so the honest label is where it takes you back to. */}
          <span className="lg:hidden">← Back to plan</span>
          <span className="hidden lg:inline">Close</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        <PassageView status={status} verses={verses} note={note} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-stone-200 px-4 py-2.5 dark:border-stone-700">
        {canExpand && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300"
          >
            Read the whole chapter
          </button>
        )}
        {expanded && (
          <button
            type="button"
            onClick={collapse}
            className="text-xs font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300"
          >
            Back to {target.label}
          </button>
        )}
        {first && (
          <Link
            href={`/read/${first.bookSlug}/${first.chapter}`}
            className="text-xs text-stone-500 hover:text-accent-700 dark:text-stone-400"
          >
            Open in full reader
          </Link>
        )}
        {attribution && <span className="w-full text-[11px] text-stone-400">{attribution}</span>}
      </div>
    </section>
  );
}
