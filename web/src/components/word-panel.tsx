'use client';

import { useEffect, useState } from 'react';
import { fetchLexEntry, decodeMorph, type OWord, type LexEntry } from '@/lib/original';

export function WordPanel({
  word,
  lang,
  reference,
  onShowCommentary,
  onClose,
}: {
  word: OWord;
  lang: 'hebrew' | 'greek';
  reference: string;
  onShowCommentary: () => void;
  onClose: () => void;
}) {
  const [entry, setEntry] = useState<LexEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setEntry(null);
    fetchLexEntry(word.s).then((e) => {
      setEntry(e);
      setLoading(false);
    });
  }, [word.s]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const morph = decodeMorph(word.m, lang);
  const rtl = lang === 'hebrew';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl animate-slide-up dark:bg-stone-900 dark:text-stone-300">
        {/* Header: the word itself */}
        <div className="sticky top-0 z-10 border-b border-stone-100 bg-white/95 px-5 py-4 backdrop-blur-sm dark:border-stone-800 dark:bg-stone-900/95">
          <div className="flex items-start justify-between">
            <div>
              <p
                dir={rtl ? 'rtl' : 'ltr'}
                className="font-scripture text-3xl leading-tight text-stone-900 dark:text-stone-100"
              >
                {word.w}
              </p>
              <p className="mt-0.5 text-sm text-stone-500">
                {word.tr}
                {entry?.pron && <span className="text-stone-400"> · {entry.pron}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {word.s && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  {word.s}
                </span>
              )}
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
          {morph && (
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-stone-400">{morph}</p>
          )}
        </div>

        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <p className="py-6 text-center text-sm text-stone-400">Looking up…</p>
          ) : entry ? (
            <>
              {entry.lemma && (
                <Row label="Lemma">
                  <span dir={rtl ? 'rtl' : 'ltr'} className="font-scripture text-lg text-stone-800 dark:text-stone-100">
                    {entry.lemma}
                  </span>
                </Row>
              )}
              {entry.def && <Row label="Definition"><span className="text-stone-700 dark:text-stone-300">{entry.def}</span></Row>}
              {entry.derivation && (
                <Row label="Derivation"><span className="text-stone-600 dark:text-stone-400">{entry.derivation}</span></Row>
              )}
              {entry.kjv && (
                <Row label="KJV usage"><span className="text-stone-600 italic dark:text-stone-400">{entry.kjv}</span></Row>
              )}
            </>
          ) : (
            <p className="text-sm text-stone-500">
              {word.g ? `Gloss: ${word.g}. ` : ''}No dictionary entry linked for this word
              {word.l && <> (lemma <span className="font-scripture">{word.l}</span>)</>}.
            </p>
          )}
        </div>

        <div className="border-t border-stone-100 px-5 py-4">
          <button
            onClick={onShowCommentary}
            className="w-full rounded-xl bg-stone-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-700"
          >
            Read commentaries on {reference}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">{label}</p>
      <p className="text-[15px] leading-relaxed">{children}</p>
    </div>
  );
}
