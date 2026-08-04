'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { type CommentaryEntry } from '@/lib/bible';
import { HIGHLIGHT_COLORS } from '@/lib/highlight-colors';
import { fetchLexEntry, decodeMorph, type OWord, type LexEntry } from '@/lib/original';
import { useDragDismiss } from '@/lib/use-drag-dismiss';
import {
  eraLabel,
  pickDiverse,
  partitionByRegister,
  EntryCard,
  RegisterLaneSections,
  type AnnotationControls,
} from './commentary-panel';

export type StudyTab = 'commentaries' | 'word' | 'notes';

// Future facets slot in here (videos, sermons) once their data exists.
const TABS: { id: StudyTab; label: string }[] = [
  { id: 'commentaries', label: 'Commentaries' },
  { id: 'word', label: 'Word study' },
  { id: 'notes', label: 'Notes' },
];

export function StudyPanel({
  reference,
  verseNum,
  verseText,
  entries,
  originalWords,
  lang,
  annotation,
  defaultTab = 'commentaries',
  focusWordIdx,
  onTabChange,
  onClose,
}: {
  reference: string;
  verseNum: number;
  verseText: string;
  entries: CommentaryEntry[];
  originalWords: OWord[] | null;
  lang: 'hebrew' | 'greek' | null;
  annotation: AnnotationControls;
  defaultTab?: StudyTab;
  focusWordIdx?: number;
  onTabChange?: (tab: StudyTab) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<StudyTab>(defaultTab);
  const drag = useDragDismiss(onClose);

  useEffect(() => setTab(defaultTab), [defaultTab, verseNum]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  function selectTab(t: StudyTab) {
    setTab(t);
    onTabChange?.(t);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-paper pb-[env(safe-area-inset-bottom)] shadow-deep animate-slide-up dark:bg-stone-900"
        style={drag.style}
      >
        {/* Grab handle (drag down to dismiss) */}
        <div aria-hidden className="flex justify-center pt-2.5" {...drag.handleProps}>
          <span className="h-1.5 w-10 rounded-full bg-stone-300/80 dark:bg-stone-700" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200/60 px-5 py-3 dark:border-stone-800" {...drag.handleProps}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">{reference}</p>
            <p className="mt-0.5 line-clamp-2 max-w-md font-scripture text-sm italic leading-snug text-stone-600 dark:text-stone-400">
              &ldquo;{verseText}&rdquo;
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600 active:bg-stone-100 dark:hover:bg-stone-800"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Always-visible highlight row */}
        <HighlightRow annotation={annotation} />

        {/* Tabs */}
        <div className="flex gap-1 border-b border-stone-200/60 px-4 dark:border-stone-800">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTab(t.id)}
              className={`relative min-h-[44px] px-3.5 py-2.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'text-accent-700 dark:text-accent-300'
                  : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'
              }`}
            >
              {t.label}
              {t.id === 'commentaries' && entries.length > 0 && (
                <span className="ml-1 text-[10px] text-stone-400">{entries.length}</span>
              )}
              {tab === t.id && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent-600 dark:bg-accent-400" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="min-h-[30vh] flex-1 overflow-y-auto">
          {tab === 'commentaries' && <CommentariesTab entries={entries} />}
          {tab === 'word' && <WordTab words={originalWords} lang={lang} focusIdx={focusWordIdx} />}
          {tab === 'notes' && <NotesTab annotation={annotation} />}
        </div>

        <div className="border-t border-stone-200/60 px-5 py-3 text-center dark:border-stone-800">
          <p className="font-scripture text-xs italic text-stone-400">
            Nevertheless, not as I will, but as you will. . . . Your will be done!
          </p>
        </div>
      </div>
    </div>
  );
}

function HighlightRow({ annotation }: { annotation: AnnotationControls }) {
  if (!annotation.signedIn) {
    return (
      <div className="border-b border-stone-100 px-5 py-2.5 dark:border-stone-800">
        <Link href="/auth/sign-in" className="inline-flex min-h-[44px] items-center text-xs font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300">
          Sign in to highlight and save notes to your account →
        </Link>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 border-b border-stone-200/60 px-5 py-1 dark:border-stone-800">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Highlight</span>
      <div className="flex items-center gap-0.5">
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c.id}
            onClick={() => annotation.onSetHighlight(c.id)}
            aria-label={`Highlight ${c.id}`}
            className="flex h-11 w-11 items-center justify-center rounded-full active:bg-stone-100 dark:active:bg-stone-800"
          >
            <span
              className={`h-7 w-7 rounded-full ${c.dot} ring-2 transition-transform hover:scale-110 ${
                annotation.color === c.id ? 'ring-stone-700 dark:ring-stone-200' : 'ring-transparent'
              }`}
            />
          </button>
        ))}
        {annotation.color && (
          <button
            onClick={annotation.onClearHighlight}
            className="ml-1 min-h-[44px] px-2 text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
          >
            clear
          </button>
        )}
      </div>
    </div>
  );
}

function CommentariesTab({ entries }: { entries: CommentaryEntry[] }) {
  // Register wall (reader side): sermons, theology/confessions, and hymns/poems are
  // DISTINCT registers — each renders in its OWN labeled section, never blended
  // into (or displacing) the exegetical voices (A6 line-by-line 2026-07-17 landed
  // hymns/poetry on this LIVE reader tab; the sermon-lane slice 2026-07-18 extends
  // the same treatment to sermon + theology).
  const { exegetical, sermon, theology, songVerse } = partitionByRegister(entries);
  const diverse = pickDiverse(exegetical, 10);
  let lastEra = '';
  if (diverse.length === 0 && sermon.length === 0 && theology.length === 0 && songVerse.length === 0) {
    return <p className="py-16 text-center text-sm text-stone-400">No commentary on this verse yet.</p>;
  }
  return (
    <div className="space-y-1 px-5 py-4">
      {diverse.map((entry, i) => {
        const era = eraLabel(entry.year);
        const showEra = era !== lastEra && era !== '';
        if (showEra) lastEra = era;
        return (
          <div key={i}>
            {showEra && (
              <p className="pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-stone-300 dark:text-stone-600">
                {era}
              </p>
            )}
            <div className="mb-2">
              <EntryCard entry={entry} />
            </div>
          </div>
        );
      })}
      {diverse.length < exegetical.length && (
        <p className="pt-1 text-center text-xs text-stone-400">
          Showing {diverse.length} of {exegetical.length} voices
        </p>
      )}
      <div className="pt-2">
        <RegisterLaneSections sermon={sermon} theology={theology} songVerse={songVerse} />
      </div>
    </div>
  );
}

function WordTab({
  words,
  lang,
  focusIdx,
}: {
  words: OWord[] | null;
  lang: 'hebrew' | 'greek' | null;
  focusIdx?: number;
}) {
  if (words === null) {
    return <p className="py-16 text-center text-sm text-stone-400">Loading Greek / Hebrew…</p>;
  }
  if (words.length === 0 || !lang) {
    return (
      <p className="py-16 text-center text-sm text-stone-400">
        Original-language data isn&rsquo;t available for this verse.
      </p>
    );
  }
  return (
    <div className="px-3 py-3">
      {words.map((w, i) => (
        <WordRow key={i} word={w} lang={lang} defaultOpen={i === focusIdx} />
      ))}
    </div>
  );
}

function WordRow({ word, lang, defaultOpen = false }: { word: OWord; lang: 'hebrew' | 'greek'; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [entry, setEntry] = useState<LexEntry | null>(null);
  // Lexicon file itself failed to load (vs. entry === null: no entry for this key).
  const [lexDown, setLexDown] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const rtl = lang === 'hebrew';

  useEffect(() => {
    if (open && !loaded) {
      fetchLexEntry(word.s).then((e) => {
        setLexDown(e === 'unavailable');
        setEntry(e === 'unavailable' ? null : e);
        setLoaded(true);
      });
    }
  }, [open, loaded, word.s]);

  const morph = decodeMorph(word.m, lang);

  return (
    <div className="border-b border-stone-200/50 last:border-0 dark:border-stone-800/70">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[48px] w-full items-center gap-3 px-2 py-2.5 text-left transition-colors hover:bg-accent-50/60 active:bg-accent-50/80 dark:hover:bg-accent-950/30"
      >
        <span dir={rtl ? 'rtl' : 'ltr'} className="font-scripture text-xl text-stone-900 dark:text-stone-100">
          {word.w}
        </span>
        <span className="text-xs text-stone-500 dark:text-stone-400">{word.tr}</span>
        {word.g && <span className="flex-1 truncate text-sm text-stone-600 dark:text-stone-300">{word.g}</span>}
        {word.s && (
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500 dark:bg-stone-800 dark:text-stone-400">
            {word.s}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-2 px-2 pb-3 text-sm">
          {morph && (
            <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{morph}</p>
          )}
          {!loaded ? (
            <p className="text-stone-400">Looking up…</p>
          ) : entry ? (
            <>
              {entry.def && <p className="text-stone-700 dark:text-stone-300">{entry.def}</p>}
              {entry.kjv && (
                <p className="text-stone-500 dark:text-stone-400">
                  <span className="font-semibold">KJV: </span>
                  <span className="italic">{entry.kjv}</span>
                </p>
              )}
            </>
          ) : lexDown ? (
            <p className="text-stone-400">Lexicon unavailable right now; entry can&rsquo;t be shown.</p>
          ) : (
            <p className="text-stone-400">No dictionary entry linked{word.l ? ` (lemma ${word.l})` : ''}.</p>
          )}
        </div>
      )}
    </div>
  );
}

function NotesTab({ annotation }: { annotation: AnnotationControls }) {
  const [text, setText] = useState(annotation.note);
  useEffect(() => setText(annotation.note), [annotation.note]);

  if (!annotation.signedIn) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="mb-3 text-sm text-stone-500 dark:text-stone-400">Save notes to your account.</p>
        <Link
          href="/auth/sign-in"
          className="inline-flex min-h-[44px] items-center rounded-lg bg-accent-700 px-5 text-sm font-semibold text-stone-50 hover:bg-accent-800 active:bg-accent-900 dark:bg-accent-500 dark:hover:bg-accent-400"
        >
          Sign in
        </Link>
      </div>
    );
  }

  // The DELIBERATE replacement for an accidental guard. Until `signedIn` stopped being a fetch
  // result, a failed annotations load also made this branch render the "Sign in" panel, so nobody
  // could type over an invisible note. Now the load failing and being signed out are separate
  // facts, and this is the one that has to block the editor: `onSaveNote` upserts.
  if (annotation.loadFailed) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="mb-1 text-sm text-stone-500 dark:text-stone-400">Your notes couldn&rsquo;t be loaded.</p>
        <p className="text-xs text-stone-400">
          Close this and use Retry at the top of the chapter. Editing now could overwrite a note you can&rsquo;t see.
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 py-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a note on this verse…"
        rows={6}
        className="w-full resize-y rounded-lg bg-stone-100/80 px-3 py-2.5 text-base text-stone-800 outline-none placeholder:text-stone-400 sm:text-sm dark:bg-stone-800 dark:text-stone-100"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => annotation.onSaveNote(text)}
          disabled={!text.trim()}
          className="min-h-[44px] rounded-lg bg-accent-700 px-4 text-xs font-semibold text-stone-50 hover:bg-accent-800 active:bg-accent-900 disabled:opacity-40 dark:bg-accent-500 dark:hover:bg-accent-400"
        >
          Save note
        </button>
        {annotation.note && (
          <button
            onClick={() => {
              annotation.onDeleteNote();
              setText('');
            }}
            className="min-h-[44px] px-2 text-xs text-stone-400 hover:text-accent-700 dark:hover:text-accent-300"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
