'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  BOOK_BY_BOOK_SLUG,
  fetchChapter,
  fetchCommentary,
  TRANSLATIONS,
  DEFAULT_TRANSLATION,
  type Book,
  type ChapterData,
  type CommentaryEntry,
  type Translation,
} from '@/lib/bible';
import { ReaderHeader } from '@/components/reader-header';
import { VerseDisplay } from '@/components/verse-display';
import { ChapterNav } from '@/components/chapter-nav';
import { Interlinear } from '@/components/interlinear';
import { StudyPanel, type StudyTab } from '@/components/study-panel';
import { fetchOriginal, loadFullLexicon, type OriginalData, type OWord } from '@/lib/original';
import { encodeVerseId } from '@bible/verse-id';

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
  const bookSlug = params.book;
  const chapterNum = parseInt(params.chapter, 10);

  const book: Book | undefined = BOOK_BY_BOOK_SLUG.get(bookSlug);
  const [translation, setTranslation] = useState<Translation>(getStoredTranslation);
  const [data, setData] = useState<ChapterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commentaryCache, setCommentaryCache] = useState<Map<string, CommentaryEntry[]>>(new Map());
  const [interlinear, setInterlinear] = useState(false);
  const [original, setOriginal] = useState<OriginalData | null>(null);
  const [highlights, setHighlights] = useState<Map<number, string>>(new Map());
  const [notes, setNotes] = useState<Map<number, string>>(new Map());
  const [signedIn, setSignedIn] = useState(false);
  // The unified study panel: which verse, which tab, optional focused word.
  const [study, setStudy] = useState<{ verse: number; tab: StudyTab; focusWordIdx?: number } | null>(null);

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
    fetchChapter(bookSlug, chapterNum, translation.id)
      .then(setData)
      .catch(() => setError('Failed to load chapter'));
  }, [book, bookSlug, chapterNum, translation]);

  // Prefetch commentary for the chapter.
  useEffect(() => {
    const key = `${bookSlug}:${chapterNum}`;
    if (commentaryCache.has(key)) return;
    fetchCommentary(bookSlug, chapterNum).then((result) => {
      if (result) setCommentaryCache((prev) => new Map(prev).set(key, result.entries));
    });
  }, [bookSlug, chapterNum, commentaryCache]);

  // Prefetch original-language words for the chapter (small per-chapter file);
  // powers both the interlinear view and the study panel's Word study tab.
  useEffect(() => {
    if (!book) return;
    setOriginal(null);
    fetchOriginal(bookSlug, chapterNum).then(setOriginal);
  }, [book, bookSlug, chapterNum]);

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
      .then((d: { highlights: { verse_id: number; color: string }[]; notes: { verse_id: number; body: string }[] }) => {
        setSignedIn(true);
        setHighlights(new Map(d.highlights.map((h) => [h.verse_id % 1000, h.color])));
        setNotes(new Map(d.notes.map((n) => [n.verse_id % 1000, n.body])));
      })
      .catch(() => setSignedIn(false));
  }, [book, chapterNum]);

  const verseId = useCallback(
    (verse: number) => encodeVerseId({ book: book!.bookNum, chapter: chapterNum, verse }),
    [book, chapterNum],
  );

  const setVerseHighlight = useCallback((verse: number, color: string) => {
    setHighlights((prev) => new Map(prev).set(verse, color));
    fetch('/api/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'highlight', verseId: verseId(verse), color }),
    }).catch(() => {});
  }, [verseId]);

  const clearVerseHighlight = useCallback((verse: number) => {
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

  const openStudy = useCallback((verse: number, tab: StudyTab, focusWordIdx?: number) => {
    setStudy({ verse, tab, focusWordIdx });
  }, []);

  const handleVerseClick = useCallback((verse: number) => openStudy(verse, 'commentaries'), [openStudy]);
  const handleWordClick = useCallback(
    (_word: OWord, verse: number, idx: number) => openStudy(verse, 'word', idx),
    [openStudy],
  );

  const studyEntries = useMemo(() => {
    if (!study) return [];
    const all = commentaryCache.get(`${bookSlug}:${chapterNum}`) ?? [];
    return all.filter((e) => e.verseStart <= study.verse && study.verse <= e.verseEnd);
  }, [study, commentaryCache, bookSlug, chapterNum]);

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
            selectedVerse={study?.verse ?? null}
            onVerseClick={handleVerseClick}
            highlights={highlights}
            notedVerses={new Set(notes.keys())}
            signedIn={signedIn}
            onSetHighlight={setVerseHighlight}
            onClearHighlight={clearVerseHighlight}
            onOpen={(verse, tab) => openStudy(verse, tab)}
          />
          <ChapterNav book={book} chapter={chapterNum} />
        </>
      ) : (
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-sm text-stone-400">Loading…</p>
        </div>
      )}
      {study && (
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
            color: highlights.get(study.verse) ?? null,
            note: notes.get(study.verse) ?? '',
            signedIn,
            onSetHighlight: (color) => setVerseHighlight(study.verse, color),
            onClearHighlight: () => clearVerseHighlight(study.verse),
            onSaveNote: (body) => { saveVerseNote(study.verse, body); setStudy(null); },
            onDeleteNote: () => deleteVerseNote(study.verse),
          }}
          onTabChange={(t) => setStudy((s) => (s ? { ...s, tab: t, focusWordIdx: undefined } : s))}
          onClose={() => setStudy(null)}
        />
      )}
    </div>
  );
}
