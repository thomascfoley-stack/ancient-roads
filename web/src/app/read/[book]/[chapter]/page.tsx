'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
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
import { CommentaryPanel } from '@/components/commentary-panel';

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
  const [selectedVerse, setSelectedVerse] = useState<number | null>(null);
  const [commentaryEntries, setCommentaryEntries] = useState<CommentaryEntry[]>([]);
  const [commentaryCache, setCommentaryCache] = useState<Map<string, CommentaryEntry[]>>(new Map());

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
    setSelectedVerse(null);
    fetchChapter(bookSlug, chapterNum, translation.id)
      .then(setData)
      .catch(() => setError('Failed to load chapter'));
  }, [book, bookSlug, chapterNum, translation]);

  // Prefetch commentary for current chapter
  useEffect(() => {
    const key = `${bookSlug}:${chapterNum}`;
    if (commentaryCache.has(key)) return;

    fetchCommentary(bookSlug, chapterNum).then((result) => {
      if (result) {
        setCommentaryCache((prev) => new Map(prev).set(key, result.entries));
      }
    });
  }, [bookSlug, chapterNum, commentaryCache]);

  const handleVerseClick = useCallback((verse: number) => {
    const key = `${bookSlug}:${chapterNum}`;
    const allEntries = commentaryCache.get(key) ?? [];
    const matching = allEntries.filter(
      (e) => e.verseStart <= verse && verse <= e.verseEnd,
    );
    setCommentaryEntries(matching);
    setSelectedVerse(verse);
  }, [bookSlug, chapterNum, commentaryCache]);

  const verseText = selectedVerse
    ? data?.verses.find((v) => v.verse === selectedVerse)?.text ?? ''
    : '';

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg text-stone-500">{error}</p>
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
      />
      {data ? (
        <>
          <VerseDisplay
            data={data}
            bookName={book.name}
            selectedVerse={selectedVerse}
            onVerseClick={handleVerseClick}
          />
          <ChapterNav book={book} chapter={chapterNum} />
        </>
      ) : (
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-sm text-stone-400">Loading…</p>
        </div>
      )}
      {selectedVerse !== null && (
        <CommentaryPanel
          verseNum={selectedVerse}
          verseText={verseText}
          entries={commentaryEntries}
          onClose={() => setSelectedVerse(null)}
        />
      )}
    </div>
  );
}
