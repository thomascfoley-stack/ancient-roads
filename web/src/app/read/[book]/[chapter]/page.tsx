'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  BOOK_BY_BOOK_SLUG,
  fetchChapter,
  fetchCommentary,
  TRANSLATIONS,
  translationAttribution,
  DEFAULT_TRANSLATION,
  type Book,
  type ChapterData,
  type CommentaryEntry,
  type Translation,
} from '@/lib/bible';
import { resolveBookSlug } from '@bible/ref-parse';
import { ReaderHeader } from '@/components/reader-header';
import { VerseDisplay, type StoredSpan } from '@/components/verse-display';
import { ChapterNav } from '@/components/chapter-nav';
import { Interlinear } from '@/components/interlinear';
import { StudyPanel, type StudyTab } from '@/components/study-panel';
import { WordPanel } from '@/components/word-panel';
import { fetchOriginal, loadFullLexicon, type OriginalData, type OWord } from '@/lib/original';
import { encodeVerseId } from '@bible/verse-id';

// The highlight shape returned by GET /api/annotations (sub-verse columns from migration 015).
interface ApiHighlight {
  id: string;
  verse_id: number;
  span_start: number | null;
  span_end: number | null;
  color: string;
  text_color: string | null;
  translation: string | null;
}

function getStoredTranslation(): Translation {
  if (typeof window === 'undefined') return TRANSLATIONS[0]!;
  const stored = localStorage.getItem('translation');
  if (stored) {
    const found = TRANSLATIONS.find((t) => t.id === stored);
    if (found) return found;
  }
  return TRANSLATIONS.find((t) => t.id === DEFAULT_TRANSLATION) ?? TRANSLATIONS[0]!;
}

export default function ReaderPage() {
  const params = useParams<{ book: string; chapter: string }>();
  const router = useRouter();
  const bookSlug = params.book;
  const chapterNum = parseInt(params.chapter, 10);

  // FOUND BY A7's product walk (2026-08-02): `/read/john/1` failed with `Unknown book: "john"`
  // while `/read/jhn/1` worked, even though aliases.ts already declares `jhn: ['john', ...]` —
  // this was a bare Map lookup on the canonical slug, never consulting the alias table.
  // `resolveBookSlug` is EXACT-alias-only (never a prefix/candidate guess), so `book` below is
  // still deterministic. When the URL used a non-canonical form, redirect to the canonical one —
  // every internal link already points at canonical slugs, and `fetchChapter` below fetches a
  // static file keyed by the canonical slug, so it MUST run against `book.slug`, not `bookSlug`.
  const book: Book | undefined = BOOK_BY_BOOK_SLUG.get(bookSlug) ?? resolveBookSlug(bookSlug);
  const canonicalSlug = book?.slug;
  // Every static-file fetch below is keyed by the CANONICAL slug (`/bible/<t>/jhn.json`,
  // `/commentaries/jhn/1.json`, `/original/jhn/1.json`) — none of those files exist under an
  // alias name, so every fetch site must use this, never the raw `bookSlug`. Falls back to
  // `bookSlug` unchanged when `book` is undefined, so a genuinely unknown slug still surfaces
  // the same "Unknown book" error as before, rather than fetching under `undefined`.
  const fetchSlug = canonicalSlug ?? bookSlug;

  useEffect(() => {
    if (canonicalSlug && canonicalSlug !== bookSlug) {
      router.replace(`/read/${canonicalSlug}/${params.chapter}`);
    }
  }, [canonicalSlug, bookSlug, params.chapter, router]);
  const [translation, setTranslation] = useState<Translation>(getStoredTranslation);
  const [data, setData] = useState<ChapterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commentaryCache, setCommentaryCache] = useState<Map<string, CommentaryEntry[]>>(new Map());
  const [interlinear, setInterlinear] = useState(false);
  const [original, setOriginal] = useState<OriginalData | null>(null);
  // verse (1-based within chapter) → its highlight spans (multiple allowed).
  const [highlights, setHighlights] = useState<Map<number, StoredSpan[]>>(new Map());
  const [notes, setNotes] = useState<Map<number, string>>(new Map());
  const [signedIn, setSignedIn] = useState(false);
  // The unified study panel: which verse, which tab, optional focused word.
  // focusWord carries the actual tapped OWord so a single-word tap can render the
  // focused WordPanel (not the whole-verse word list).
  const [study, setStudy] = useState<{ verse: number; tab: StudyTab; focusWordIdx?: number; focusWord?: OWord } | null>(null);

  const handleTranslationChange = useCallback((t: Translation) => {
    setTranslation(t);
    localStorage.setItem('translation', t.id);
  }, []);

  useEffect(() => {
    if (!book) {
      setError(`Unknown book: "${bookSlug}"`);
      return;
    }
    if (isNaN(chapterNum) || chapterNum < 1 || chapterNum > book.chapterCount) {
      setError(
        `${book.name} has ${book.chapterCount} chapter${book.chapterCount === 1 ? '' : 's'}`,
      );
      return;
    }
    setData(null);
    setError(null);
    setStudy(null);
    fetchChapter(fetchSlug, chapterNum, translation.id)
      .then(setData)
      .catch(() => setError('Failed to load chapter'));
  }, [book, fetchSlug, chapterNum, translation]);

  // Prefetch commentary for the chapter.
  useEffect(() => {
    const key = `${fetchSlug}:${chapterNum}`;
    if (commentaryCache.has(key)) return;
    fetchCommentary(fetchSlug, chapterNum).then((result) => {
      if (result) setCommentaryCache((prev) => new Map(prev).set(key, result.entries));
    });
  }, [fetchSlug, chapterNum, commentaryCache]);

  // Prefetch original-language words for the chapter (small per-chapter file);
  // powers both the interlinear view and the study panel's Word study tab.
  useEffect(() => {
    if (!book) return;
    setOriginal(null);
    fetchOriginal(fetchSlug, chapterNum).then(setOriginal);
  }, [book, fetchSlug, chapterNum]);

  // Preload the full dictionary once study/interlinear is engaged so lookups are instant.
  useEffect(() => {
    if ((study || interlinear) && original) loadFullLexicon(original.lang);
  }, [study, interlinear, original]);

  // Load the user's highlights + notes for this chapter.
  useEffect(() => {
    if (!book) return;
    setHighlights(new Map());
    setNotes(new Map());
    fetch(`/api/annotations?book=${book.bookNum}&chapter=${chapterNum}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { highlights: ApiHighlight[]; notes: { verse_id: number; body: string }[] }) => {
        setSignedIn(true);
        const byVerse = new Map<number, StoredSpan[]>();
        for (const h of d.highlights) {
          const v = h.verse_id % 1000;
          const arr = byVerse.get(v) ?? [];
          arr.push({ id: h.id, start: h.span_start, end: h.span_end, color: h.color, textColor: h.text_color, translation: h.translation });
          byVerse.set(v, arr);
        }
        setHighlights(byVerse);
        setNotes(new Map(d.notes.map((n) => [n.verse_id % 1000, n.body])));
      })
      .catch(() => setSignedIn(false));
  }, [book, chapterNum]);

  const verseId = useCallback(
    (verse: number) => encodeVerseId({ book: book!.bookNum, chapter: chapterNum, verse }),
    [book, chapterNum],
  );

  // Add a highlight span. range === null → whole verse (the tap-a-verse path). Optimistic:
  // paint locally first, then persist (the save carries the pinned translation).
  const addHighlight = useCallback(
    (verse: number, range: { start: number; end: number } | null, color: string) => {
      const optimistic: StoredSpan = {
        start: range?.start ?? null,
        end: range?.end ?? null,
        color,
        translation: translation.id,
      };
      setHighlights((prev) => {
        const next = new Map(prev);
        next.set(verse, [...(next.get(verse) ?? []), optimistic]);
        return next;
      });
      fetch('/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'highlight',
          verseId: verseId(verse),
          color,
          spanStart: range?.start ?? null,
          spanEnd: range?.end ?? null,
          translation: translation.id,
        }),
      }).catch(() => {});
    },
    [verseId, translation],
  );

  // Clear every span on a verse (the whole-verse "clear" affordance in the study panel).
  const clearVerse = useCallback((verse: number) => {
    setHighlights((prev) => {
      const next = new Map(prev);
      next.delete(verse);
      return next;
    });
    fetch('/api/annotations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'highlight', verseId: verseId(verse) }),
    }).catch(() => {});
  }, [verseId]);

  const saveVerseNote = useCallback((verse: number, body: string) => {
    setNotes((prev) => new Map(prev).set(verse, body));
    fetch('/api/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'note', verseId: verseId(verse), body }),
    }).catch(() => {});
  }, [verseId]);

  const deleteVerseNote = useCallback((verse: number) => {
    setNotes((prev) => {
      const next = new Map(prev);
      next.delete(verse);
      return next;
    });
    fetch('/api/annotations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'note', verseId: verseId(verse) }),
    }).catch(() => {});
  }, [verseId]);

  const openStudy = useCallback(
    (verse: number, tab: StudyTab, focusWordIdx?: number, focusWord?: OWord) => {
      setStudy({ verse, tab, focusWordIdx, focusWord });
    },
    [],
  );

  const handleVerseClick = useCallback((verse: number) => openStudy(verse, 'commentaries'), [openStudy]);
  const handleWordClick = useCallback(
    (word: OWord, verse: number, idx: number) => openStudy(verse, 'word', idx, word),
    [openStudy],
  );

  const studyEntries = useMemo(() => {
    if (!study) return [];
    // Must match the prefetch effect's key exactly (fetchSlug, not bookSlug) or an alias URL
    // reads an empty cache forever — the prefetch stores under fetchSlug two effects above.
    const all = commentaryCache.get(`${fetchSlug}:${chapterNum}`) ?? [];
    return all.filter((e) => e.verseStart <= study.verse && study.verse <= e.verseEnd);
  }, [study, commentaryCache, fetchSlug, chapterNum]);

  const studyVerseText = study
    ? data?.verses.find((v) => v.verse === study.verse)?.text ?? ''
    : '';
  const studyWords = study && original ? original.verses[String(study.verse)] ?? [] : null;

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-lg text-stone-500 dark:text-stone-400">{error}</p>
      </div>
    );
  }

  if (!book) return null;

  return (
    <div className="min-h-screen">
      <ReaderHeader
        book={book}
        chapter={chapterNum}
        translation={translation}
        onTranslationChange={handleTranslationChange}
        interlinear={interlinear}
        onToggleInterlinear={() => setInterlinear((v) => !v)}
      />
      {interlinear ? (
        original ? (
          <>
            <Interlinear data={original} bookName={book.name} onWordClick={handleWordClick} />
            <ChapterNav book={book} chapter={chapterNum} />
          </>
        ) : (
          <div className="flex min-h-[60vh] items-center justify-center">
            <p className="text-sm text-stone-400">Loading Greek / Hebrew…</p>
          </div>
        )
      ) : data ? (
        <>
          <VerseDisplay
            data={data}
            bookName={book.name}
            translation={translation.id}
            selectedVerse={study?.verse ?? null}
            onVerseClick={handleVerseClick}
            highlights={highlights}
            notedVerses={new Set(notes.keys())}
            signedIn={signedIn}
            onAddHighlight={addHighlight}
            onOpen={(verse, tab) => openStudy(verse, tab)}
          />
          <ChapterNav book={book} chapter={chapterNum} />
        </>
      ) : (
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-sm text-stone-400">Loading…</p>
        </div>
      )}
      {translationAttribution(translation.id) ? (
        <p className="mx-auto max-w-2xl px-6 pb-8 text-center text-xs text-stone-400">
          {translationAttribution(translation.id)}
        </p>
      ) : null}
      {study && study.focusWord && original ? (
        <WordPanel
          word={study.focusWord}
          lang={original.lang}
          reference={`${book.name} ${chapterNum}:${study.verse}`}
          onShowCommentary={() =>
            setStudy((s) => (s ? { ...s, tab: 'commentaries', focusWordIdx: undefined, focusWord: undefined } : s))
          }
          onClose={() => setStudy(null)}
        />
      ) : study ? (
        <StudyPanel
          reference={`${book.name} ${chapterNum}:${study.verse}`}
          verseNum={study.verse}
          verseText={studyVerseText}
          entries={studyEntries}
          originalWords={studyWords}
          lang={original?.lang ?? null}
          defaultTab={study.tab}
          focusWordIdx={study.focusWordIdx}
          annotation={{
            color: highlights.get(study.verse)?.at(-1)?.color ?? null,
            note: notes.get(study.verse) ?? '',
            signedIn,
            onSetHighlight: (color) => addHighlight(study.verse, null, color),
            onClearHighlight: () => clearVerse(study.verse),
            onSaveNote: (body) => { saveVerseNote(study.verse, body); setStudy(null); },
            onDeleteNote: () => deleteVerseNote(study.verse),
          }}
          onTabChange={(t) => setStudy((s) => (s ? { ...s, tab: t, focusWordIdx: undefined } : s))}
          onClose={() => setStudy(null)}
        />
      ) : null}
    </div>
  );
}
