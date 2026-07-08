'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadFullLexicon, type LexEntry } from '@/lib/original';

type Lang = 'greek' | 'hebrew';

interface Hit extends LexEntry {
  strong: string;
}

export default function WordStudyPage() {
  const [lang, setLang] = useState<Lang>('greek');
  const [lex, setLex] = useState<Record<string, LexEntry> | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Hit | null>(null);

  useEffect(() => {
    setLex(null);
    loadFullLexicon(lang).then(setLex);
  }, [lang]);

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
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-scripture text-3xl font-medium text-stone-800">Word study</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">
          Look up the Greek and Hebrew behind the text. Search by Strong&rsquo;s number, by
          transliteration, by the original word, or by an English meaning. In the reader, turn on
          the אα interlinear and tap any word to open its entry here.
        </p>
      </header>

      <div className="sticky top-0 z-20 -mx-5 mb-6 flex flex-wrap items-center gap-2 border-b border-stone-200 bg-stone-50/95 px-5 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
        <div className="flex rounded-lg bg-stone-200/60 p-0.5">
          {(['greek', 'hebrew'] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors ${
                lang === l ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={lang === 'greek' ? 'agape, G26, love…' : 'shalom, H430, peace…'}
          className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 shadow-sm outline-none placeholder:text-stone-400 focus:border-stone-500"
        />
      </div>

      {!lex ? (
        <p className="py-16 text-center text-sm text-stone-400">Loading {lang} lexicon…</p>
      ) : !query.trim() ? (
        <p className="py-16 text-center text-sm text-stone-400">
          Start typing to search {Object.keys(lex).length.toLocaleString()} {lang} entries.
        </p>
      ) : results.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-400">No matches for &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="space-y-2">
          {results.map((hit) => (
            <button
              key={hit.strong}
              onClick={() => setSelected(hit)}
              className="flex w-full items-baseline gap-3 rounded-xl border border-stone-200 bg-white/60 px-4 py-3 text-left shadow-sm transition-colors hover:bg-amber-50/50"
            >
              <span dir={rtl ? 'rtl' : 'ltr'} className="font-scripture text-xl text-stone-900">
                {hit.lemma}
              </span>
              <span className="text-sm text-stone-500">{hit.translit}</span>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">
                {hit.strong}
              </span>
              <span className="flex-1 truncate text-sm text-stone-600">{hit.def}</span>
            </button>
          ))}
          {results.length >= 200 && (
            <p className="pt-2 text-center text-xs text-stone-400">Showing first 200 matches. Refine your search.</p>
          )}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl">
            <div className="sticky top-0 flex items-start justify-between border-b border-stone-100 bg-white/95 px-5 py-4 backdrop-blur-sm">
              <div>
                <p dir={rtl ? 'rtl' : 'ltr'} className="font-scripture text-3xl text-stone-900">
                  {selected.lemma}
                </p>
                <p className="mt-0.5 text-sm text-stone-500">
                  {selected.translit}
                  {selected.pron && <span className="text-stone-400"> · {selected.pron}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  {selected.strong}
                </span>
                <button
                  onClick={() => setSelected(null)}
                  className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100"
                  aria-label="Close"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="space-y-4 px-5 py-4 text-[15px] leading-relaxed">
              {selected.def && <Field label="Definition">{selected.def}</Field>}
              {selected.derivation && <Field label="Derivation">{selected.derivation}</Field>}
              {selected.kjv && <Field label="KJV usage"><span className="italic">{selected.kjv}</span></Field>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">{label}</p>
      <p className="text-stone-700">{children}</p>
    </div>
  );
}
