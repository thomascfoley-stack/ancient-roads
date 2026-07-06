'use client';

import type { ChapterData } from '@/lib/bible';

export function VerseDisplay({
  data,
  bookName,
  selectedVerse,
  onVerseClick,
}: {
  data: ChapterData;
  bookName: string;
  selectedVerse: number | null;
  onVerseClick: (verse: number) => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-6">
      <h1 className="mb-8 font-scripture text-3xl font-medium text-stone-800">
        {bookName} {data.chapter}
      </h1>
      <div className="font-scripture text-lg leading-[1.9] text-stone-800">
        {data.verses.map((v) => {
          if (!v.text) return null;
          const isSelected = v.verse === selectedVerse;
          return (
            <span
              key={v.verse}
              className={`inline cursor-pointer rounded transition-colors ${
                isSelected
                  ? 'bg-amber-100/80'
                  : 'hover:bg-stone-100/70'
              }`}
              onClick={() => onVerseClick(v.verse)}
            >
              <sup className="mr-0.5 font-sans text-[11px] font-semibold text-amber-600/70 select-none">
                {v.verse}
              </sup>
              <span>{v.text} </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
