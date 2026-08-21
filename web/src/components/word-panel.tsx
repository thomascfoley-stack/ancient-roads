'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchLexEntry, decodeMorph, type OWord, type LexEntry } from '@/lib/original';
import { ConcordanceList } from '@/components/concordance-list';

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
  // Lexicon file itself failed to load (vs. entry === null: no entry for this key).
  const [lexDown, setLexDown] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setEntry(null);
    setLexDown(false);
    fetchLexEntry(word.s).then((e) => {
      setLexDown(e === 'unavailable');
      setEntry(e === 'unavailable' ? null : e);
      setLoading(false);
    });
    // A042/A044: the concordance fetch and its paging moved into <ConcordanceList> below, which
    // the standalone lexicon now renders too. This effect keeps only the lexicon entry.
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
    // PRD §3 scrim: rgba(26,20,15,0.32) light / rgba(251,248,242,0.08) dark, NO blur.
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-stone-950/[0.32] animate-fade-in dark:bg-stone-50/[0.08]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl bg-paper animate-slide-up dark:bg-stone-900 dark:text-stone-300">
        {/* Header: the word itself */}
        <div className="sticky top-0 z-10 border-b edge bg-paper px-5 py-4 dark:bg-stone-900">
          <div className="flex items-start justify-between">
            <div>
              {/* PRD word-study headword is 22px EB Garamond — but this headword is the
                  ORIGINAL-LANGUAGE word, whose glyphs EB Garamond does not carry, so it
                  keeps the reading face (font-scripture) at the PRD's 22px. */}
              <p
                dir={rtl ? 'rtl' : 'ltr'} lang={rtl ? 'he' : 'el'}
                className="font-scripture text-[22px] leading-tight text-stone-900 dark:text-stone-100"
              >
                {word.w}
              </p>
              <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
                {word.tr}
                {entry?.pron && <span className="text-stone-500 dark:text-stone-400"> · {entry.pron}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {word.s && (
                // Option D: the chip is the door to the full word page (deep-linkable, with the
                // complete concordance) — a destination, not a decoration.
                <Link
                  href={`/word/${word.s}`}
                  title={`Everything about ${word.s}`}
                  className="bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-500 transition-colors ease-gentle hover:bg-accent-100 hover:text-accent-800 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-accent-950/60 dark:hover:text-accent-300"
                >
                  {word.s}
                </Link>
              )}
              <button
                onClick={onClose}
                className="flex h-11 w-11 items-center justify-center rounded-full text-stone-500 dark:text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800"
                aria-label="Close"
              >
                <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
          {morph && (
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">{morph}</p>
          )}
        </div>

        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <p className="py-6 text-center text-sm text-stone-500 dark:text-stone-400">Looking up…</p>
          ) : lexDown ? (
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {word.g ? `Gloss: ${word.g}. ` : ''}The lexicon isn&rsquo;t available right now, so
              this word&rsquo;s dictionary entry can&rsquo;t be shown.
            </p>
          ) : entry ? (
            <>
              {entry.lemma && (
                <Row label="Lemma">
                  <span dir={rtl ? 'rtl' : 'ltr'} lang={rtl ? 'he' : 'el'} className="font-scripture text-lg text-stone-800 dark:text-stone-100">
                    {entry.lemma}
                  </span>
                </Row>
              )}
              {/* PRD §5 word study: definition 18px Literata at 1.75; etymology 14px ink-wash. */}
              {entry.def && <Row label="Definition"><span className="font-scripture text-lg leading-[1.75] text-stone-800 dark:text-stone-200">{entry.def}</span></Row>}
              {entry.derivation && (
                <Row label="Derivation"><span className="font-scripture text-sm text-stone-500 dark:text-stone-400">{entry.derivation}</span></Row>
              )}
              {entry.kjv && (
                <Row label="KJV usage"><span className="font-scripture text-sm text-stone-600 italic dark:text-stone-400">{entry.kjv}</span></Row>
              )}
            </>
          ) : (
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {word.g ? `Gloss: ${word.g}. ` : ''}No dictionary entry linked for this word
              {word.l && <> (lemma <span className="font-scripture">{word.l}</span>)</>}.
            </p>
          )}
        </div>

        {/* minCount 2: the reader is standing in one of these verses already, so a one-item list
            would offer a link to the verse behind this panel. */}
        <ConcordanceList strong={word.s} minCount={2} />

        <div className="border-t edge px-5 py-4">
          {/* PRD §6 primary CTA: 1px ink hairline, transparent, ink fill on hover. */}
          <button
            onClick={onShowCommentary}
            className="min-h-[44px] w-full rounded-xl border border-stone-900 px-4 py-2.5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 transition-colors ease-gentle hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
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
      <p className="mb-1 text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">{label}</p>
      <p className="text-base leading-relaxed">{children}</p>
    </div>
  );
}
