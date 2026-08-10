'use client';

import { useEffect } from 'react';
import type { EnglishMatch } from '@/lib/original';

// What the reader sees when "Define" cannot answer with exactly one word.
//
// The interlinear data carries no alignment between the English text and the original words, so a
// match is made against each word's gloss and KJV usage. That can legitimately return several
// words, or none, and BOTH of those are answers this sheet has to give honestly — picking one at
// random, or showing an empty panel, would have the product asserting a mapping it does not have.
// A single confident match never reaches here: the reader opens the WordPanel directly.

export function DefineSheet({
  english,
  reference,
  matches,
  lexiconDown,
  onPick,
  onClose,
}: {
  english: string;
  reference: string;
  matches: EnglishMatch[];
  /** The lexicon file failed to load, so matching ran on glosses alone. Say so rather than
   *  letting a thin result look like a complete one. */
  lexiconDown: boolean;
  onPick: (match: EnglishMatch) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    // PRD §3 scrim: rgba(26,20,15,0.32) light / rgba(251,248,242,0.08) dark, NO blur.
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-stone-950/[0.32] animate-fade-in dark:bg-stone-50/[0.08]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl bg-paper animate-slide-up dark:bg-stone-900 dark:text-stone-300">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b edge bg-paper px-5 py-4 dark:bg-stone-900">
          <div>
            {/* PRD §5 word study: the word is 22px EB Garamond — and this one IS English,
                so the display face applies. */}
            <p className="font-display text-[22px] text-stone-900 dark:text-stone-100">“{english}”</p>
            <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">{reference}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-600 dark:text-stone-400 dark:hover:bg-stone-800"
            aria-label="Close"
          >
            <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          {matches.length === 0 ? (
            <p className="font-serif text-[15px] leading-relaxed text-stone-600 dark:text-stone-300">
              No original-language word in this verse is recorded as meaning “{english}”.
              {lexiconDown
                ? ' The lexicon could not be loaded, so only the short glosses were searched — it may be found once it loads.'
                : ' The interlinear does not line English up with the original word by word, so a word that is supplied by the translation, or rendered differently, will not be found here.'}
            </p>
          ) : (
            <>
              <p className="mb-3 font-serif text-[14px] leading-relaxed text-stone-500 dark:text-stone-400">
                {matches.length} words in this verse are recorded as meaning “{english}”. English is
                not lined up with the original word by word, so choose the one you meant.
              </p>
              <ul className="space-y-2">
                {matches.map((m) => (
                  <li key={`${m.word.s}-${m.index}`}>
                    {/* A hairline-bordered row, not a card: PRD bans the lifted-box look. */}
                    <button
                      onClick={() => onPick(m)}
                      className="flex min-h-[44px] w-full items-baseline justify-between gap-3 rounded-xl border edge bg-stone-50 px-4 py-3 text-left transition-colors ease-gentle hover:bg-accent-50/60 dark:bg-stone-950 dark:hover:bg-accent-950/30"
                    >
                      <span>
                        <span className="font-scripture text-lg text-stone-900 dark:text-stone-100">{m.word.w}</span>
                        <span className="ml-2 text-sm text-stone-500 dark:text-stone-400">{m.word.tr}</span>
                        {m.word.g && (
                          <span className="mt-0.5 block font-serif text-[14px] text-stone-600 dark:text-stone-300">
                            {m.word.g}
                          </span>
                        )}
                      </span>
                      {m.word.s && (
                        <span className="shrink-0 bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                          {m.word.s}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
