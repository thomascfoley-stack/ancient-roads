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
            <span className="mt-1.5 shrink-0 select-none font-sans text-[11px] font-semibold text-amber-600/70">
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
                  className="group flex flex-col items-center rounded-md px-1.5 py-1 text-center transition-colors hover:bg-amber-50 dark:hover:bg-amber-500/10"
                  title={word.s}
                >
                  <span className="font-scripture text-xl leading-tight text-stone-900 group-hover:text-amber-900 dark:text-stone-100 dark:group-hover:text-amber-300">
                    {word.w}
                  </span>
                  <span className="mt-0.5 text-[10px] leading-tight text-stone-400 dark:text-stone-500" dir="ltr">
                    {word.tr}
                  </span>
                  {word.g && (
                    <span className="text-[11px] leading-tight text-stone-500 dark:text-stone-400" dir="ltr">
                      {word.g}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-10 border-t border-stone-100 pt-6 text-center text-xs text-stone-400">
        Tap any word for its {rtl ? 'Hebrew' : 'Greek'} definition, morphology, and commentaries.
        Strong&rsquo;s numbers and morphology from public-domain sources.
      </p>
    </div>
  );
}
