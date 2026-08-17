'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadFullLexicon, type LexEntry } from '@/lib/original';
import { ConcordanceList } from '@/components/concordance-list';
import { useDragDismiss } from '@/lib/use-drag-dismiss';
import { useDialog } from '@/lib/use-dialog';

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

  // THE LOAD IS DISOWNED WHEN `lang` CHANGES. Without the guard an in-flight load kept its claim
  // on state, so switching tabs before the first fetch settled let the ABANDONED language land on
  // top of the current one: `lang` said hebrew while `lex` held Greek. Nothing looked wrong —
  // `lex` was non-null, so no loading line and no error — and the page then searched the wrong
  // lexicon while labelling the count "hebrew entries". Reported as "intermittently searches stale
  // Greek data" (2026-08-16 QA fleet); intermittent because it turns on which fetch wins.
  useEffect(() => {
    let cancelled = false;
    setLex(null);
    setLexFailed(false);
    // A selected entry belongs to the language it was found in; carrying it across is the same
    // staleness one layer up (a Greek word open on a page that says Hebrew).
    setSelected(null);
    loadFullLexicon(lang).then((data) => {
      if (cancelled) return;
      setLex(data);
      setLexFailed(data === null);
    });
    return () => {
      cancelled = true;
    };
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

 <div className="sticky top-0 z-20 -mx-4 mb-6 flex flex-wrap items-center gap-2 border-b edge bg-stone-50 px-4 py-3 sm:-mx-6 sm:px-6 dark:bg-stone-950">
        <div className="flex rounded-xl bg-stone-200/60 p-1 dark:bg-stone-800">
          {(['greek', 'hebrew'] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`min-h-[36px] rounded-lg px-4 text-sm font-medium capitalize transition-colors ease-gentle ${
                lang === l
                  ? 'bg-paper text-stone-800 dark:bg-stone-700 dark:text-stone-100'
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
          aria-label={lang === 'greek' ? 'Search the Greek lexicon' : 'Search the Hebrew lexicon'}
          /* PRD §6 input: parchment surface, 1px hairline; focus is the global gold
             :focus-visible ring (a focus:border-* utility would lose to the unlayered .edge). */
          className="min-h-[44px] min-w-0 flex-1 border edge bg-transparent px-3 text-base text-stone-800 placeholder:text-stone-400 sm:min-h-0 sm:py-1.5 sm:text-sm dark:text-stone-100 dark:placeholder:text-stone-500"
        />
      </div>

      {lexFailed ? (
        <p className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">
          The {lang} lexicon isn&rsquo;t available right now. Check your connection and try again.
        </p>
      ) : !lex ? (
        <p className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">Loading {lang} lexicon…</p>
      ) : !query.trim() ? (
        <p className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">
          Start typing to search {Object.keys(lex).length.toLocaleString()} {lang} entries.
        </p>
      ) : results.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">No matches for &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="border-y edge">
          {results.map((hit) => (
            <button
              key={hit.strong}
              onClick={() => setSelected(hit)}
              className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 border-b edge px-1 py-3 text-left transition-colors ease-gentle last:border-b-0 hover:bg-accent-50/40 active:bg-accent-50/70 dark:hover:bg-accent-950/20"
            >
              <span dir={rtl ? 'rtl' : 'ltr'} lang={rtl ? 'he' : 'el'} className="font-scripture text-xl text-stone-900 dark:text-stone-100">
                {hit.lemma}
              </span>
              <span className="text-sm text-stone-500 dark:text-stone-400">{hit.translit}</span>
              <span className="text-micro font-semibold tracking-wider text-stone-500 dark:text-stone-400">
                {hit.strong}
              </span>
              <span className="w-full truncate text-sm text-stone-600 sm:w-auto sm:flex-1 dark:text-stone-300">{hit.def}</span>
            </button>
          ))}
          {results.length >= 200 && (
            <p className="pt-2 text-center text-xs text-stone-500 dark:text-stone-400">Showing first 200 matches. Refine your search.</p>
          )}
        </div>
      )}

      {selected && <EntrySheet hit={selected} rtl={rtl} onClose={() => setSelected(null)} />}
    </div>
  );
}

function EntrySheet({ hit, rtl, onClose }: { hit: Hit; rtl: boolean; onClose: () => void }) {
  const drag = useDragDismiss(onClose);
  const dialog = useDialog(onClose, 'Lexicon entry');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog.ref}
        {...dialog.dialogProps}
        className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl bg-paper pb-[env(safe-area-inset-bottom)] animate-slide-up dark:bg-stone-900"
        style={drag.style}
      >
        <div aria-hidden className="flex justify-center pt-2.5" {...drag.handleProps}>
          <span className="h-1.5 w-10 rounded-full bg-stone-300/80 dark:bg-stone-700" />
        </div>
 <div className="flex items-start justify-between border-b edge px-5 pb-3 pt-1" {...drag.handleProps}>
          <div>
            {/* PRD §5 Word Study: the word at 22px display size. Kept in the READING face
                rather than EB Garamond — the lemma is Greek/Hebrew, and the display face
                has no Hebrew glyphs, so it would silently fall back anyway. */}
            <p dir={rtl ? 'rtl' : 'ltr'} lang={rtl ? 'he' : 'el'} className="font-scripture text-[22px] text-stone-900 dark:text-stone-100">
              {hit.lemma}
            </p>
            <p className="mt-0.5 text-xs italic text-stone-500 dark:text-stone-400">
              {hit.translit}
              {hit.pron && <span className="not-italic text-stone-500 dark:text-stone-400"> · {hit.pron}</span>}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <span className="bg-accent-100 px-2.5 py-1 text-xs font-semibold text-accent-800 dark:bg-accent-950/60 dark:text-accent-200">
              {hit.strong}
            </span>
            <button
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-full text-stone-500 dark:text-stone-400 hover:bg-stone-100 hover:text-stone-600 active:bg-stone-100 dark:hover:bg-stone-800"
              aria-label="Close"
            >
              <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          {/* PRD §5 Word Study: definition 18px Literata at 1.75; etymology/usage 14px ink-wash. */}
          {hit.def && <Field label="Definition" large>{hit.def}</Field>}
          {hit.derivation && <Field label="Derivation">{hit.derivation}</Field>}
          {hit.kjv && <Field label="KJV usage"><span className="italic">{hit.kjv}</span></Field>}
          {/* A042 — the standalone lexicon was "a strictly thinner tool" than the reader's word
              panel, and the cross-verse occurrence list was the gap that was real AND cheap: the
              concordance is keyed by a Strong's number alone, which is exactly what this page has.
              It also gives the entry its only route back into Scripture — each chip lands on the
              verse (A044), where commentary is one tap away. -mx-5 lets the rule run full width
              inside this padded scroll container. */}
          <ConcordanceList strong={hit.strong} className="-mx-5 border-t edge px-5 pt-4" />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, large }: { label: string; children: React.ReactNode; large?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">{label}</p>
      <p className={`font-serif ${large ? 'text-lg leading-[1.75] text-stone-900 dark:text-stone-100' : 'text-sm text-stone-500 dark:text-stone-400'}`}>{children}</p>
    </div>
  );
}
