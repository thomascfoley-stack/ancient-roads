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

/**
 * The server's answer, and therefore the client's FIRST answer too.
 *
 * This used to be one `getStoredTranslation()` that read localStorage and was passed straight to
 * `useState`. A `useState` initializer runs during the first client render, so the server rendered
 * WEB and the browser immediately rendered the stored KJV — a server/client text mismatch at
 * `reader-header.tsx`'s translation badge, which is a React #418 hydration error on EVERY reader
 * page load. It threw in production from the day the feature shipped until 2026-08-02, and A7's
 * "no console errors" check reported PASS over it, because that check read the console *after*
 * navigating and the throw happens *during* the load. Found by the A7b walk.
 *
 * Hydration's rule is simple and absolute: the first client render must produce what the server
 * produced. Anything read from localStorage is therefore forbidden until after mount.
 */
function defaultTranslation(): Translation {
  return TRANSLATIONS.find((t) => t.id === DEFAULT_TRANSLATION) ?? TRANSLATIONS[0]!;
}

/** The reader's saved choice. Client-only, applied after mount — never during render. */
function storedTranslation(): Translation | undefined {
  const stored = localStorage.getItem('translation');
  return stored ? TRANSLATIONS.find((t) => t.id === stored) : undefined;
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
  const [translation, setTranslation] = useState<Translation>(defaultTranslation);
  // `hydrated` gates the chapter fetch below. Without it the reader fetches the DEFAULT
  // translation's chapter and then immediately re-fetches the stored one — two requests per page
  // load for everyone who has ever changed translation, which is a real cost the naive fix adds.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const stored = storedTranslation();
    if (stored) setTranslation(stored);
    setHydrated(true);
  }, []);
  const [data, setData] = useState<ChapterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commentaryCache, setCommentaryCache] = useState<Map<string, CommentaryEntry[]>>(new Map());
  const [interlinear, setInterlinear] = useState(false);
  const [original, setOriginal] = useState<OriginalData | null>(null);
  // verse (1-based within chapter) → its highlight spans (multiple allowed).
  const [highlights, setHighlights] = useState<Map<number, StoredSpan[]>>(new Map());
  const [notes, setNotes] = useState<Map<number, string>>(new Map());
  // Bookmarked verses in this chapter, by verse number. A Set because a bookmark carries no
  // payload — it is a place, not an annotation.
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [signedIn, setSignedIn] = useState(false);
  // The verse a `#v<n>` deep link landed on, briefly emphasised. State, not a DOM mutation.
  const [flashVerse, setFlashVerse] = useState<number | null>(null);
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
    // Wait for the stored translation to land, so this fires once with the right one.
    if (!hydrated) return;
    setData(null);
    setError(null);
    setStudy(null);
    fetchChapter(fetchSlug, chapterNum, translation.id)
      .then(setData)
      .catch(() => setError('Failed to load chapter'));
  }, [book, fetchSlug, chapterNum, translation, hydrated]);

  // ── deep link to a verse (`/read/jhn/3#v16`) ───────────────────────────────────────────────
  // Read from `window.location.hash` in an effect, NOT from useSearchParams: the hash is not sent
  // to the server, so there is nothing for a first client render to disagree with, and no Suspense
  // boundary is needed. Given this session spent an afternoon on a hydration mismatch, the shape
  // that cannot produce one is the right shape.
  //
  // The scroll waits for `data` because the verse element does not exist at navigation time — the
  // chapter is fetched client-side, so the browser has nothing to anchor to and its own native
  // fragment scroll is a no-op here.
  useEffect(() => {
    if (!data) return;
    const m = /^#v(\d+)$/.exec(window.location.hash);
    if (!m) return;
    const verse = Number(m[1]);
    const el = document.querySelector(`[data-verse="${verse}"]`);
    if (!el) return; // a hash naming a verse this chapter does not have is ignored, not an error
    el.scrollIntoView({ block: 'center' });
    // A brief emphasis, because scrolling alone does not say WHICH verse was meant when the whole
    // screen is verses.
    //
    // THIS IS STATE, NOT classList.add. The first version mutated the element's className
    // directly and the ring never appeared: the verse is React-controlled, and the next render —
    // there are several after load (commentary prefetch, original-language prefetch, annotations)
    // — rewrites className from the JSX and drops anything added underneath it. Found by looking
    // at the live DOM rather than trusting that the code read correctly.
    setFlashVerse(verse);
    const t = setTimeout(() => setFlashVerse(null), 2200);
    return () => clearTimeout(t);
  }, [data]);

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
    setBookmarks(new Set());
    fetch(`/api/annotations?book=${book.bookNum}&chapter=${chapterNum}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { highlights: ApiHighlight[]; notes: { verse_id: number; body: string }[]; bookmarks?: { verse_id: number }[] }) => {
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
        // Optional in the type: a reader on a tab opened before this deploy would receive a
        // response without the key, and `undefined.map` would blank the whole chapter's
        // annotations rather than just its bookmarks.
        setBookmarks(new Set((d.bookmarks ?? []).map((b) => b.verse_id % 1000)));
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

  /**
   * Bookmark toggle. Optimistic like the highlight and note handlers beside it, but with one
   * difference that matters: it computes `next` from the CURRENT set inside the updater and
   * fires the matching request, so a fast double-tap cannot send two POSTs. The server is
   * idempotent too (createBookmark returns the existing row), so the two guards are independent.
   */
  const toggleBookmark = useCallback((verse: number) => {
    setBookmarks((prev) => {
      const on = prev.has(verse);
      const next = new Set(prev);
      if (on) next.delete(verse);
      else next.add(verse);
      fetch('/api/annotations', {
        method: on ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'bookmark', verseId: verseId(verse) }),
      }).catch(() => {});
      return next;
    });
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
            flashVerse={flashVerse}
            onVerseClick={handleVerseClick}
            highlights={highlights}
            notedVerses={new Set(notes.keys())}
            bookmarkedVerses={bookmarks}
            onToggleBookmark={toggleBookmark}
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
