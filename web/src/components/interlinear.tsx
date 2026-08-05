'use client';

import type { OriginalData, OWord } from '@/lib/original';

export function Interlinear({
  data,
  bookName,
  onWordClick,
}: {
  data: OriginalData;
  bookName: string;
  onWordClick: (word: OWord, verse: number, index: number) => void;
}) {
  const rtl = data.lang === 'hebrew';
  const verseNums = Object.keys(data.verses)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="font-scripture text-3xl font-medium text-stone-800 dark:text-stone-100">
          {bookName} {data.chapter}
        </h1>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
          {rtl ? 'Hebrew' : 'Greek'} interlinear
        </span>
      </div>

      <div className="space-y-5">
        {verseNums.map((v) => (
          <div key={v} className="flex gap-2">
            <span className="mt-1.5 shrink-0 select-none font-sans text-micro font-semibold text-accent-600/80 dark:text-accent-300/80">
              {v}
            </span>
            <div
              dir={rtl ? 'rtl' : 'ltr'}
              className="flex flex-1 flex-wrap gap-x-1 gap-y-3"
            >
              {data.verses[String(v)]!.map((word, i) => (
                <button
                  key={i}
                  onClick={() => onWordClick(word, v, i)}
                  className="group flex min-h-[44px] flex-col items-center justify-center rounded-md px-1.5 py-1 text-center transition-colors ease-gentle hover:bg-accent-50/70 active:bg-accent-50 dark:hover:bg-accent-950/30"
                  title={word.s}
                >
                  {/* lang goes on the ORIGINAL-LANGUAGE word only. It was briefly on the
                      wrapping div, which made the transliteration and gloss below inherit
                      Greek/Hebrew phonetics: worse than having no lang at all, on the exact
                      surface where a reader depends on those two lines being readable. */}
                  <span lang={rtl ? 'he' : 'el'} className="font-scripture text-xl leading-tight text-stone-900 group-hover:text-accent-800 dark:text-stone-100 dark:group-hover:text-accent-300">
                    {word.w}
                  </span>
                  <span className="mt-0.5 text-micro leading-tight text-stone-500 dark:text-stone-400" dir="ltr" lang="en">
                    {word.tr}
                  </span>
                  {word.g && (
                    <span className="text-micro leading-tight text-stone-600 dark:text-stone-400" dir="ltr" lang="en">
                      {word.g}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 border-t border-stone-100 pt-6 text-center text-xs text-stone-500 dark:text-stone-400">
        <p>Tap any word for its {rtl ? 'Hebrew' : 'Greek'} definition, morphology, and commentaries.</p>
        {/* Attribution required by the licences of the source data (§7 licensing fix). Full
            per-work records in DATA_SOURCES.md. Strong's is PD; the text + morphology are not. */}
        <p className="mt-1 leading-relaxed">
          {rtl ? (
            <>Hebrew text &amp; morphology: Open Scriptures Hebrew Bible (CC&nbsp;BY&nbsp;4.0).</>
          ) : (
            <>Greek text: SBLGNT © 2010 SBL &amp; Logos (CC&nbsp;BY&nbsp;4.0). Greek morphology: MorphGNT (CC&nbsp;BY-SA&nbsp;3.0).</>
          )}{' '}
          Strong&rsquo;s numbers &amp; definitions: public domain (Strong&rsquo;s, 1890).
        </p>
      </div>
    </div>
  );
}
