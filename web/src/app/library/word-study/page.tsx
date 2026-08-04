'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadFullLexicon, type LexEntry } from '@/lib/original';
import { useDragDismiss } from '@/lib/use-drag-dismiss';

type Lang = 'greek' | 'hebrew';

interface Hit extends LexEntry {
  strong: string;
}

export default function WordStudyPage() {
  const [lang, setLang] = useState<Lang>('greek');
  const [lex, setLex] = useState<Record<string, LexEntry> | null>(null);
  // Distinguishes "still loading" from "the lexicon file failed to load";
  // without it a null result would leave the page on "Loading…" forever.
  const [lexFailed, setLexFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Hit | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLex(null);
    setLexFailed(false);
    loadFullLexicon(lang).then((data) => {
      setLex(data);
      setLexFailed(data === null);
    });
  }, [lang]);

  // Focus the search on pointer devices only — auto-popping the keyboard on
  // a phone the moment the page opens is hostile.
  useEffect(() => {
    if (window.matchMedia('(hover: hover)').matches) inputRef.current?.focus();
  }, []);

  const results = useMemo<Hit[]>(() => {
    if (!lex) return [];
    // Diacritic-insensitive: users type "agape", the translit is "agápē".
    const fold = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const q = fold(query.trim());
    if (!q) return [];
    // Strong's number lookup, e.g. "26", "g26", "h430"
    const numMatch = q.match(/^([gh]?)(\d+)$/);
    if (numMatch) {
      const prefix = lang === 'greek' ? 'G' : 'H';
      const key = `${prefix}${numMatch[2]}`;
      const e = lex[key];
      return e ? [{ ...e, strong: key }] : [];
    }
    const hits: Hit[] = [];
    for (const [strong, e] of Object.entries(lex)) {
      if (
        fold(e.translit).includes(q) ||
        fold(e.lemma).includes(q) ||
        fold(e.def).includes(q) ||
        fold(e.kjv).includes(q)
      ) {
        hits.push({ ...e, strong });
        if (hits.length >= 200) break;
      }
    }
    return hits;
  }, [lex, query, lang]);

  const rtl = lang === 'hebrew';

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-medium tracking-tight text-stone-900 dark:text-stone-100">Word study</h1>
        <p className="mt-2 max-w-2xl font-serif text-base leading-relaxed text-stone-500 dark:text-stone-400">
          Look up the Greek and Hebrew behind the text. Search by Strong&rsquo;s number, by
          transliteration, by the original word, or by an English meaning. In the reader, turn on
          the אα interlinear and tap any word to open its entry here.
        </p>
      </header>

      <div className="sticky top-0 z-20 -mx-4 mb-6 flex flex-wrap items-center gap-2 border-b border-stone-200/70 bg-stone-50/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 dark:border-stone-800 dark:bg-stone-950/95">
        <div className="flex rounded-xl bg-stone-200/60 p-1 dark:bg-stone-800">
          {(['greek', 'hebrew'] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`min-h-[36px] rounded-lg px-4 text-sm font-medium capitalize transition-colors ${
                lang === l
                  ? 'bg-paper text-stone-800 shadow-paper dark:bg-stone-700 dark:text-stone-100'
                  : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={lang === 'greek' ? 'agape, G26, love…' : 'shalom, H430, peace…'}
          className="min-h-[44px] min-w-0 flex-1 rounded-lg bg-paper px-3 text-base text-stone-800 shadow-paper outline-none transition-shadow duration-200 ease-gentle placeholder:text-stone-400 focus:shadow-float sm:min-h-0 sm:py-1.5 sm:text-sm dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500 dark:shadow-none"
        />
      </div>

      {lexFailed ? (
        <p className="py-16 text-center text-sm text-stone-400">
          The {lang} lexicon isn&rsquo;t available right now. Check your connection and try again.
        </p>
      ) : !lex ? (
        <p className="py-16 text-center text-sm text-stone-400">Loading {lang} lexicon…</p>
      ) : !query.trim() ? (
        <p className="py-16 text-center text-sm text-stone-400">
          Start typing to search {Object.keys(lex).length.toLocaleString()} {lang} entries.
        </p>
      ) : results.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-400">No matches for &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="space-y-2.5">
          {results.map((hit) => (
            <button
              key={hit.strong}
              onClick={() => setSelected(hit)}
              className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl bg-paper px-4 py-3 text-left shadow-paper transition-colors hover:bg-accent-50/50 active:bg-accent-50/70 dark:bg-stone-800/60 dark:shadow-none dark:hover:bg-stone-800"
            >
              <span dir={rtl ? 'rtl' : 'ltr'} className="font-scripture text-xl text-stone-900 dark:text-stone-100">
                {hit.lemma}
              </span>
              <span className="text-sm text-stone-500 dark:text-stone-400">{hit.translit}</span>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-micro font-semibold text-stone-500 dark:bg-stone-700 dark:text-stone-400">
                {hit.strong}
              </span>
              <span className="w-full truncate text-sm text-stone-600 sm:w-auto sm:flex-1 dark:text-stone-300">{hit.def}</span>
            </button>
          ))}
          {results.length >= 200 && (
            <p className="pt-2 text-center text-xs text-stone-400">Showing first 200 matches. Refine your search.</p>
          )}
        </div>
      )}

      {selected && <EntrySheet hit={selected} rtl={rtl} onClose={() => setSelected(null)} />}
    </div>
  );
}

function EntrySheet({ hit, rtl, onClose }: { hit: Hit; rtl: boolean; onClose: () => void }) {
  const drag = useDragDismiss(onClose);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl bg-paper pb-[env(safe-area-inset-bottom)] shadow-deep animate-slide-up dark:bg-stone-900"
        style={drag.style}
      >
        <div aria-hidden className="flex justify-center pt-2.5" {...drag.handleProps}>
          <span className="h-1.5 w-10 rounded-full bg-stone-300/80 dark:bg-stone-700" />
        </div>
        <div className="flex items-start justify-between border-b border-stone-200/60 px-5 pb-3 pt-1 dark:border-stone-800" {...drag.handleProps}>
          <div>
            <p dir={rtl ? 'rtl' : 'ltr'} className="font-scripture text-3xl text-stone-900 dark:text-stone-100">
              {hit.lemma}
            </p>
            <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
              {hit.translit}
              {hit.pron && <span className="text-stone-400"> · {hit.pron}</span>}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <span className="rounded-full bg-accent-100 px-2.5 py-1 text-xs font-semibold text-accent-800 dark:bg-accent-950/60 dark:text-accent-200">
              {hit.strong}
            </span>
            <button
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600 active:bg-stone-100 dark:hover:bg-stone-800"
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 text-base leading-relaxed">
          {hit.def && <Field label="Definition">{hit.def}</Field>}
          {hit.derivation && <Field label="Derivation">{hit.derivation}</Field>}
          {hit.kjv && <Field label="KJV usage"><span className="italic">{hit.kjv}</span></Field>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-micro font-semibold uppercase tracking-wider text-stone-400">{label}</p>
      <p className="font-serif text-stone-700 dark:text-stone-300">{children}</p>
    </div>
  );
}
