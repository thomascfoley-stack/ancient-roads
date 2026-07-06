'use client';

import { useEffect, useRef, useState } from 'react';
import type { CommentaryEntry } from '@/lib/bible';

function eraLabel(year: number | null): string {
  if (!year) return '';
  if (year <= 500) return 'Early Church';
  if (year <= 1500) return 'Medieval';
  if (year <= 1700) return 'Reformation';
  return 'Modern';
}

function traditionKey(entry: CommentaryEntry): string {
  if (entry.tradition) return entry.tradition;
  return eraLabel(entry.year) || 'Unknown';
}

function pickDiverse(entries: CommentaryEntry[], max: number): CommentaryEntry[] {
  if (entries.length <= max) return entries;

  const byTradition = new Map<string, CommentaryEntry[]>();
  for (const e of entries) {
    const key = traditionKey(e);
    const arr = byTradition.get(key);
    if (arr) arr.push(e);
    else byTradition.set(key, [e]);
  }

  const picked: CommentaryEntry[] = [];
  const traditions = [...byTradition.keys()];

  let round = 0;
  while (picked.length < max) {
    let added = false;
    for (const t of traditions) {
      const arr = byTradition.get(t)!;
      if (round < arr.length && picked.length < max) {
        picked.push(arr[round]!);
        added = true;
      }
    }
    if (!added) break;
    round++;
  }

  return picked.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
}

function EntryCard({ entry }: { entry: CommentaryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = entry.text.length > 600;
  const displayText = isLong && !expanded ? entry.text.slice(0, 600).replace(/\s+\S*$/, '') + '...' : entry.text;

  return (
    <div className="rounded-xl bg-stone-50/80 px-4 py-3.5">
      <div className="flex items-baseline gap-2 mb-2 flex-wrap">
        <span className="font-semibold text-stone-800 text-sm">
          {entry.author}
        </span>
        {entry.year && (
          <span className="text-xs text-stone-400">
            {entry.year < 0 ? `${Math.abs(entry.year)} BC` : entry.year}
          </span>
        )}
        {entry.tradition && (
          <span className="rounded-full bg-stone-200/50 px-2 py-0.5 text-[10px] font-medium text-stone-500">
            {entry.tradition}
          </span>
        )}
      </div>
      <p className="font-scripture text-[15px] leading-relaxed text-stone-600">
        {displayText}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs font-medium text-amber-700 hover:text-amber-800"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
      {entry.sourceTitle && (
        <p className="mt-2 text-[11px] text-stone-400">
          {entry.sourceUrl ? (
            <a
              href={entry.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-stone-600 underline decoration-stone-300"
            >
              {entry.sourceTitle}
            </a>
          ) : (
            entry.sourceTitle
          )}
        </p>
      )}
    </div>
  );
}

export function CommentaryPanel({
  verseNum,
  verseText,
  entries,
  onClose,
}: {
  verseNum: number;
  verseText: string;
  entries: CommentaryEntry[];
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const diverse = pickDiverse(entries, 10);
  let lastEra = '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl animate-slide-up"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-100 bg-white/95 px-5 py-4 backdrop-blur-sm">
          <h2 className="text-sm font-semibold text-stone-800">
            What Others Have Said
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="border-b border-stone-100 bg-stone-50/50 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-1.5">
            Verse {verseNum}
          </p>
          <p className="font-scripture text-base leading-relaxed text-stone-700 italic">
            &ldquo;{verseText}&rdquo;
          </p>
        </div>

        <div className="px-5 py-4 space-y-1">
          {diverse.length === 0 ? (
            <p className="py-10 text-center text-sm text-stone-400">
              No commentary available for this verse yet.
            </p>
          ) : (
            diverse.map((entry, i) => {
              const era = eraLabel(entry.year);
              const showEra = era !== lastEra && era !== '';
              if (showEra) lastEra = era;

              return (
                <div key={i}>
                  {showEra && (
                    <p className="pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-stone-300">
                      {era}
                    </p>
                  )}
                  <div className="mb-2">
                    <EntryCard entry={entry} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {diverse.length < entries.length && (
          <div className="px-5 pb-3">
            <p className="text-xs text-stone-400 text-center">
              Showing {diverse.length} of {entries.length} commentaries
            </p>
          </div>
        )}

        <div className="border-t border-stone-100 px-5 py-5 text-center">
          <p className="font-scripture text-sm text-stone-500 italic">
            These are the words of men. Open your Bible and pray on it.
          </p>
        </div>
      </div>
    </div>
  );
}
