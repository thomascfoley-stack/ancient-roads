'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { isFetchableChapter } from '@/lib/chapter-param';
import { DEFAULT_BIBLE_HREF, DEFAULT_BIBLE_LABEL, saveBiblePosition } from '@/lib/bible-position';
import { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from 'react';
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
// A035: the recovery page opens the SAME picker the header does, rather than growing its own.
import { BookPicker } from '@/components/book-picker';
import { VerseDisplay } from '@/components/verse-display';
import { ChapterNav } from '@/components/chapter-nav';
import { Interlinear } from '@/components/interlinear';
import { StudyPanel, type StudyTab } from '@/components/study-panel';
import { WordPanel } from '@/components/word-panel';
import {
  fetchConcordance,
  fetchOriginal,
  loadFullLexicon,
  matchEnglishWord,
  type DefineResolution,
  type EnglishMatch,
  type OriginalData,
  type OWord,
  type WordSelection,
} from '@/lib/original';
import { useAnnotationWrites } from '@/lib/use-annotation-writes';
import { useSignedIn } from '@/lib/auth/use-signed-in';
import { encodeVerseId } from '@bible/verse-id';

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
  const [retryTick, setRetryTick] = useState(0);
  const [commentaryCache, setCommentaryCache] = useState<Map<string, CommentaryEntry[]>>(new Map());
  const [commentaryFailed, setCommentaryFailed] = useState<Set<string>>(new Set());
  const [interlinear, setInterlinear] = useState(false);
  // Two-tap highlight mode (the phone flow): header toggle flips it, ESC inside VerseDisplay
  // exits it. VerseDisplay owns the anchor; the page owns only on/off.
  const [highlightMode, setHighlightMode] = useState(false);
  const [original, setOriginal] = useState<OriginalData | null>(null);
  // Highlights, notes, bookmarks, and their write path (retry + rollback + a visible failure —
  // see use-annotation-writes.ts for why this isn't the fire-and-forget `.catch(() => {})` it
  // used to be).
  const {
    highlights,
    notes,
    bookmarks,
    freshSpans,
    annotationsFailed,
    retryAnnotations,
    writeError,
    retryWrite,
    dismissWrite,
    addHighlight,
    clearVerse,
    saveVerseNote,
    deleteVerseNote,
    toggleBookmark,
  } = useAnnotationWrites(book?.bookNum, chapterNum, translation.id);
  // The session, not the annotations fetch. See lib/auth/use-signed-in.ts.
  const signedIn = useSignedIn();
  // The verse a `#v<n>` deep link landed on, briefly emphasised. State, not a DOM mutation.
  const [flashVerse, setFlashVerse] = useState<number | null>(null);
  // The unified study panel: which verse, which tab, optional focused word.
  // focusWord carries the actual tapped OWord so a single-word tap can render the
  // focused WordPanel (not the whole-verse word list).
  const [study, setStudy] = useState<{ verse: number; tab: StudyTab; focusWordIdx?: number; focusWord?: OWord; selection?: WordSelection } | null>(null);
  // A035: the book/chapter picker offered from the error page below, so an impossible chapter is
  // not a dead end. Declared up here with the other state because the error branch returns EARLY —
  // a `useState` after that return would be a conditional hook.
  const [recoveryPickerOpen, setRecoveryPickerOpen] = useState(false);
  /** K-6 — is the panel open, and did WE push the history entry for it? See `openStudy`. */
  const panelOpenRef = useRef(false);
  const pushedStudyEntry = useRef(false);

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
    // B4 (#118): rapid chapter navigation starts a second fetch while the first is in flight;
    // without the cancelled flag the SLOWER stale fetch resolves last and overwrites the newer
    // chapter on screen. The same pattern desk-pane.tsx carries for its chapter fetch.
    let cancelled = false;
    setData(null);
    setError(null);
    setStudy(null);
    // K-6 bookkeeping: the panel is being closed by NAVIGATION, not by the reader, so the entry we
    // pushed for it (if any) belongs to the chapter we are leaving. Forgetting it here stops a
    // later close on the NEW chapter from calling `history.back()` and walking the reader back a
    // chapter instead of shutting the panel.
    //
    // NOT also stripping a stale `:study` hash here, though that looks tidier. This effect runs on
    // first mount too, one ordering step away from the hash effect below that reads that hash to
    // open a deep-linked panel — and the value it would buy is a URL nicety in a case that needs a
    // hash to survive a client-side chapter change, which `<Link>` navigation does not do. Least
    // code wins over a subtle ordering dependency for an edge that may not be reachable.
    // (Measured both ways in the browser, because a first attempt at this comment asserted the
    // strip broke the deep link: it does not. That reading came from re-navigating to the URL the
    // page was already on, which is a no-op, not a load. If you re-add the strip, verify the deep
    // link by navigating AWAY first.)
    // If the hash ever does go stale across a chapter change, `openStudy` sees it, replaces rather
    // than pushes, and `closeStudy` takes its no-entry path — the panel still closes correctly.
    pushedStudyEntry.current = false;
    fetchChapter(fetchSlug, chapterNum, translation.id)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load chapter');
      });
    return () => {
      cancelled = true;
    };
  }, [book, fetchSlug, chapterNum, translation, hydrated, retryTick]);

  // A040 — REMEMBER WHERE THE READER IS, so closing the tab does not send them back to John 1.
  //
  // This is the write half of the record `lib/bible-position.ts` documents; `mobile-nav.tsx` is the
  // read half (A034). It is deliberately keyed on the book and chapter ALONE, not on `data`: the
  // position is where they navigated, not what finished downloading, so a slow or failed chapter
  // fetch still leaves them somewhere sensible to come back to.
  //
  // AN EFFECT, NOT A RENDER-TIME WRITE. Same rule as every other storage touch on this page (see
  // the translation note at the top of the file): nothing may read or write localStorage until
  // after mount. A write during render would also fire on the server, where there is no storage.
  //
  // `saveBiblePosition` re-validates and refuses an out-of-range chapter, so the A035 case below
  // is never recorded — otherwise the reader's own dead end would become the destination their
  // next Bible tap aims at.
  useEffect(() => {
    if (!book) return;
    saveBiblePosition(book.slug, chapterNum);
  }, [book, chapterNum]);

  // ── F-144 — restore the reader's scroll position within the chapter ─────────────────────────
  // The work reader already does this (`saveWorkProgress`/`loadWorkProgress`); Scripture did not.
  // Same contract: per-device, never throws, corrupt reads as "no position". Keyed by book+chapter
  // so a translation switch does not lose the place.
  //
  // `history.scrollRestoration = 'manual'` is the other half of the fix: without it the browser's
  // own bfcache/navigation scroll reset fires AFTER our restore and wins, which is why the first
  // version measured scrollTo(500) firing and still landed at 0.
  // ── F-144 — restore the reader's scroll position within the chapter ─────────────────────────
  // The work reader already does this (`saveWorkProgress`/`loadWorkProgress`); Scripture did not.
  // Same contract: per-device, never throws, corrupt reads as "no position". Keyed by book+chapter
  // so a translation switch does not lose the place.
  //
  // THE SCROLL CONTAINER IS <main id="main">, NOT THE WINDOW. AppShell wraps every page in
  // `flex h-dvh overflow-hidden` with `<main className="overflow-y-auto">` inside it, so
  // `window.scrollY` is always 0 here and the scroll lives on that element. The save and the
  // restore both target it.
  const scrollKey = book ? `bible-scroll:${book.slug}:${chapterNum}` : null;
  const restoredScrollFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!scrollKey || !data) return;
    if (restoredScrollFor.current === scrollKey) return;
    // A hash (#v16) is an explicit destination — it wins over the saved position.
    if (window.location.hash) return;
    let saved: number | null = null;
    try {
      const raw = window.localStorage.getItem(scrollKey);
      if (raw) {
        const n = Number(JSON.parse(raw));
        if (Number.isFinite(n) && n >= 0) saved = n;
      }
    } catch {
      // Corrupt or unavailable storage: no saved position.
    }
    if (saved !== null) {
      restoredScrollFor.current = scrollKey;
      // The chapter content has rendered (data is set), but the browser may not have computed
      // the full document height yet — images, fonts, and the commentary prefetch can all
      // change it. A longer defer gives the layout time to settle; the ref guard means this
      // still fires only once per chapter arrival. NO cleanup: `data` updates again when the
      // commentary prefetch lands, and a cleanup would cancel this timeout before it fires.
      setTimeout(() => {
        const main = document.getElementById('main');
        if (main) main.scrollTop = saved!;
      }, 300);
    }
  }, [scrollKey, data]);

  useEffect(() => {
    if (!scrollKey) return;
    const main = document.getElementById('main');
    if (!main) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    function save() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          window.localStorage.setItem(scrollKey!, JSON.stringify(main!.scrollTop));
        } catch {
          // Quota/privacy failure: resume is a convenience, not a gate.
        }
      }, 300);
    }
    main.addEventListener('scroll', save, { passive: true });
    return () => {
      main.removeEventListener('scroll', save);
      if (timer) clearTimeout(timer);
    };
  }, [scrollKey]);

  // ── deep link to a verse (`/read/jhn/3#v16`) ───────────────────────────────────────────────
  /**
   * K-6 — THE OPEN PANEL IS A VIEW, SO BACK MUST CLOSE IT BEFORE IT LEAVES THE CHAPTER.
   *
   * Measured before fixing (dev, signed out): /library -> /read/jhn/3 -> tap verse 16 -> Back
   * landed on /library. One Back threw the reader out of the chapter they were reading, and the
   * panel had added no history entry at all (`history.length` unchanged, hash empty).
   *
   * The entry deliberately carries the SAME url rather than the existing `#v<n>:study` deep link.
   * Writing that hash here is the obvious version and it is wrong: the hash effect above re-reads
   * the hash whenever `data` changes, so a hash we wrote ourselves makes the panel re-open and the
   * page re-scroll on every chapter reload — a translation switch with the panel open would yank
   * the reader back to the verse. Four existing suites caught it
   * (`study-panel-verse-sequence`, `settings-close-on-study`). Making the URL reflect panel state
   * is worth doing, but it needs that effect reworked first and is not part of this fix.
   *
   * `pushedStudyEntry` is what keeps the deep-link case honest: arriving directly at
   * `#v16:study` opens the panel through the hash effect without us pushing anything, so closing
   * must NOT call `history.back()` — that would leave the site instead of the panel.
   */
  const openStudy = useCallback(
    (verse: number, tab: StudyTab, focusWordIdx?: number, focusWord?: OWord, selection?: WordSelection) => {
      if (!panelOpenRef.current) {
        // K-6 deep-link arrival: the current entry ALREADY carries `#v<n>:study` (the hash effect
        // calling us is what opened the panel). Pushing `window.location.href` here would push
        // that hash onto the stack a second time, then `closeStudy` would take its `history.back()`
        // branch and land back on the original, still-hash-carrying entry — the hash would never
        // be stripped, and any later `data` change (a translation switch) would re-fire the hash
        // effect and re-open the panel the reader just dismissed. Skip the push; `closeStudy` then
        // falls through to its `replaceState` and clears the hash. (48f00e69 re-gated this on
        // `panelOpenRef` and lost this case; restored here.)
        if (/:study$/.test(window.location.hash)) {
          panelOpenRef.current = true;
        } else {
          // An entry with the SAME url — the panel needs something for Back to pop, and nothing
          // more. Re-aiming an already-open panel (verse to verse, word to commentary) pushes
          // nothing, so a reader who taps six verses still presses Back once.
          window.history.pushState(null, '', window.location.href);
          pushedStudyEntry.current = true;
          panelOpenRef.current = true;
        }
      }
      setStudy({ verse, tab, focusWordIdx, focusWord, selection });
    },
    [],
  );

  /** Back (or a swipe-back) while the panel is open closes the panel and stays in the chapter. */
  useEffect(() => {
    const onPop = (): void => {
      pushedStudyEntry.current = false;
      panelOpenRef.current = false;
      setStudy(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /**
   * Closing by the panel's own control. If we pushed an entry, go back so it is CONSUMED — leaving
   * it on the stack would make the reader's next Back press do nothing visible, which reads as a
   * broken button. If we did not push (deep link), strip the hash instead so a later Back does not
   * re-open a panel the reader has already dismissed.
   */
  const closeStudy = useCallback(() => {
    if (pushedStudyEntry.current) {
      pushedStudyEntry.current = false;
      panelOpenRef.current = false;
      window.history.back();
      return;
    }
    // Opened by deep link: nothing of ours on the stack. Strip the hash so a later Back does not
    // re-open a panel the reader has already dismissed.
    if (/:study$/.test(window.location.hash)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    panelOpenRef.current = false;
    setStudy(null);
  }, []);

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
    // `#v12` scrolls. `#v12:study` also OPENS the study drawer — added for T1, whose spec assumed
    // a drawer-opening deep link already existed. It did not: this effect scrolled and nothing
    // more, and there are no query params on this route. Extending the hash the effect already
    // parses is the smallest change that makes the claim true, and it reuses `openStudy` rather
    // than adding a second way to open the panel.
    // `?firstrun=1` is the OAuth-safe form: a fragment never survives a `callbackURL` round trip
    // and Neon's hosted auth server rejects one outright. Read from `window.location` in this
    // effect rather than `useSearchParams`, which would need a Suspense boundary.
    if (new URLSearchParams(window.location.search).get('firstrun') === '1') {
      openStudy(1, 'commentaries');
      return;
    }
    const m = /^#v(\d+)(:study)?$/.exec(window.location.hash);
    if (!m) return;
    const verse = Number(m[1]);
    const el = document.querySelector(`[data-verse="${verse}"]`);
    if (!el) return; // a hash naming a verse this chapter does not have is ignored, not an error
    if (m[2]) openStudy(verse, 'commentaries');
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
  }, [data, openStudy]);

  // Prefetch commentary for the chapter.
  useEffect(() => {
    // A084 — unguarded, this prefetched `.../NaN` on every malformed chapter URL.
    if (!isFetchableChapter(book?.bookNum, chapterNum)) return;
    const key = `${fetchSlug}:${chapterNum}`;
    if (commentaryCache.has(key) || commentaryFailed.has(key)) return;
    fetchCommentary(fetchSlug, chapterNum).then((result) => {
      if (result) {
        setCommentaryCache((prev) => new Map(prev).set(key, result.entries));
        setCommentaryFailed((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      } else {
        setCommentaryFailed((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
      }
    });
  }, [fetchSlug, chapterNum, commentaryCache, commentaryFailed]);

  // Prefetch original-language words for the chapter (small per-chapter file);
  // powers both the interlinear view and the study panel's Word study tab.
  useEffect(() => {
    // A084 — same as the commentary prefetch above: guarded the book, never the chapter.
    if (!isFetchableChapter(book?.bookNum, chapterNum)) return;
    setOriginal(null);
    fetchOriginal(fetchSlug, chapterNum).then(setOriginal);
  }, [book, fetchSlug, chapterNum]);

  // Preload the full dictionary once study/interlinear is engaged so lookups are instant.
  useEffect(() => {
    if ((study || interlinear) && original) loadFullLexicon(original.lang);
  }, [study, interlinear, original]);


  const handleVerseClick = useCallback((verse: number) => openStudy(verse, 'commentaries'), [openStudy]);
  const handleWordClick = useCallback(
    (word: OWord, verse: number, idx: number) => openStudy(verse, 'word', idx, word),
    [openStudy],
  );

  /**
   * OPTION A (ruling 2026-08-21): resolve the original word(s) behind a single selected English
   * word, for the popover to show as the answer itself — the "Define" verb this replaced hid the
   * feature behind the one label that didn't say what it does.
   *
   * The interlinear carries no word-by-word alignment to the English, so the match is made against
   * what each original word records as its own meaning (gloss + Strong's KJV usage). The popover
   * renders whatever this returns — one confident row, every candidate, or the honest zero line —
   * and never picks one on the reader's behalf. A single confident match also carries its
   * concordance count (static JSON, cached), the number that makes the row worth tapping.
   */
  const resolveDefine = useCallback(
    async (english: string, verse: number): Promise<DefineResolution | null> => {
      if (!original) return null;
      const words = original.verses[String(verse)] ?? [];
      const lex = await loadFullLexicon(original.lang);
      const matches = matchEnglishWord(english, words, lex);
      const count =
        matches.length === 1 && matches[0]!.word.s
          ? (await fetchConcordance(matches[0]!.word.s))?.count
          : undefined;
      return { english, lang: original.lang, matches, count, lexiconDown: lex === null };
    },
    [original],
  );
  /** A tapped candidate opens the full entry (WordPanel), exactly as the old 1-match path did. */
  const pickDefine = useCallback(
    (verse: number, m: EnglishMatch) => openStudy(verse, 'word', m.index, m.word),
    [openStudy],
  );
  /** Option C's door: Word study with the selection pinned (or the honest no-match header). */
  const openWordStudy = useCallback(
    (verse: number, selection: WordSelection) => openStudy(verse, 'word', undefined, undefined, selection),
    [openStudy],
  );

  const commentaryKey = `${fetchSlug}:${chapterNum}`;
  const studyEntries = useMemo(() => {
    if (!study) return [];
    // Must match the prefetch effect's key exactly (fetchSlug, not bookSlug) or an alias URL
    // reads an empty cache forever — the prefetch stores under fetchSlug two effects above.
    const all = commentaryCache.get(commentaryKey) ?? [];
    return all.filter((e) => e.verseStart <= study.verse && study.verse <= e.verseEnd);
  }, [study, commentaryCache, commentaryKey]);
  const studyEntriesFailed = study ? commentaryFailed.has(commentaryKey) : false;
  // F-162 — the panel's own retry: clear the failure mark so the prefetch effect re-runs.
  const retryCommentaries = useCallback(() => {
    setCommentaryFailed((prev) => {
      if (!prev.has(commentaryKey)) return prev;
      const next = new Set(prev);
      next.delete(commentaryKey);
      return next;
    });
  }, [commentaryKey]);

  const studyVerseText = study
    ? data?.verses.find((v) => v.verse === study.verse)?.text ?? ''
    : '';
  const studyWords = study && original ? original.verses[String(study.verse)] ?? [] : null;

  // A027 — THE VERSE BEFORE AND AFTER THE OPEN ONE, so the panel can step through the chapter
  // instead of being closed and reopened for every verse.
  //
  // Derived from `data.verses`, NOT from `study.verse ± 1`. The list is filtered to verses that
  // actually render — VerseDisplay skips `!v.text` — so "next" is the next verse the reader can
  // SEE, and a gap in the chapter's text cannot strand the panel on a blank one. `null` at either
  // end is what disables the control; an unknown verse (the panel can be open before `data` lands)
  // disables both, which is honest rather than a guess.
  const studyNeighbours = useMemo(() => {
    if (!study || !data) return { prev: null, next: null };
    const rendered = data.verses.filter((v) => v.text).map((v) => v.verse);
    const i = rendered.indexOf(study.verse);
    if (i === -1) return { prev: null, next: null };
    return { prev: rendered[i - 1] ?? null, next: rendered[i + 1] ?? null };
  }, [study, data]);

  // A027/A028 — move the open verse WITHIN the chapter. Not `openStudy`, because that takes a tab
  // and would make every caller decide one: `s.tab` KEEPS the reader's tab, which is the whole
  // point of stepping (reading commentary verse by verse must not drop you back on Commentaries'
  // sibling every step — and StudyPanel holds the tab across a verse change on its own side too).
  // `focusWordIdx`/`focusWord` are dropped by omission: a word index belongs to the verse it was
  // taken from, and carrying `focusWord` over would swap the panel for WordPanel mid-step.
  const navigateStudy = useCallback((verse: number) => {
    setStudy((s) => (s ? { verse, tab: s.tab } : s));
  }, []);

  // A035 — AN IMPOSSIBLE CHAPTER MUST NOT BE A DEAD END.
  //
  // `/read/psa/999` used to render this one grey sentence and nothing else: no link, no picker, no
  // nav (the reader route has no chrome of its own), so the only way out of the app's own error was
  // the browser's back button. The page ALREADY KNOWS the way out — it prints the book's name and
  // its chapter count in the very message, which means it is holding the `Book` the whole time.
  //
  // Two cases, because they can offer different amounts:
  //   - the BOOK resolved and the chapter did not (`psa/999`, `psa/abc`): offer that book's first
  //     chapter, and the picker. Send them to the book they ASKED for — landing them on John after
  //     they asked for a psalm is just a politer dead end.
  //   - the book did not resolve at all (`enoch/1`): there is no book to offer a chapter of, so
  //     offer the default way into Scripture. The picker needs a `currentBook` and there isn't one.
  if (error) {
    const canRetry = error === 'Failed to load chapter';
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
        <p role="alert" className="text-lg text-stone-500 dark:text-stone-400">{error}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {canRetry && (
            <button
              type="button"
              onClick={() => {
                setRetryTick((t) => t + 1);
                setCommentaryFailed((prev) => {
                  const key = `${fetchSlug}:${chapterNum}`;
                  if (!prev.has(key)) return prev;
                  const next = new Set(prev);
                  next.delete(key);
                  return next;
                });
              }}
              className="min-h-[44px] border edge px-4 py-2.5 text-sm font-semibold text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:text-stone-200 dark:hover:bg-stone-200 dark:hover:text-stone-950"
            >
              Try again
            </button>
          )}
          {book ? (
            <>
              {!canRetry && (
                <Link
                  href={`/read/${book.slug}/1`}
                  className="min-h-[44px] border edge px-4 py-2.5 text-sm font-semibold text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:text-stone-200 dark:hover:bg-stone-200 dark:hover:text-stone-950"
                >
                  {book.name} 1
                </Link>
              )}
              <button
                onClick={() => setRecoveryPickerOpen(true)}
                className="min-h-[44px] border edge px-4 py-2.5 text-sm font-medium text-stone-500 hover:bg-stone-900 hover:text-stone-50 dark:text-stone-400 dark:hover:bg-stone-200 dark:hover:text-stone-950"
              >
                Choose another chapter
              </button>
            </>
          ) : (
            // Label and href both come from `lib/bible-position.ts`, derived from one slug, so a
            // link that says "John 1" cannot start pointing somewhere else.
            <Link
              href={DEFAULT_BIBLE_HREF}
              className="min-h-[44px] border edge px-4 py-2.5 text-sm font-semibold text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:text-stone-200 dark:hover:bg-stone-200 dark:hover:text-stone-950"
            >
              {DEFAULT_BIBLE_LABEL}
            </Link>
          )}
        </div>
        {/* The SAME BookPicker the header opens — reused, not re-built, so the recovery path and
            the normal path cannot drift. `currentChapter={chapterNum}` deliberately: the requested
            chapter does not exist, so nothing in the grid highlights, which is the honest picture
            (passing 1 would highlight a chapter the reader is not in). */}
        {recoveryPickerOpen && book && (
          <BookPicker
            currentBook={book}
            currentChapter={chapterNum}
            onClose={() => setRecoveryPickerOpen(false)}
          />
        )}
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
        highlightMode={highlightMode}
        onToggleHighlightMode={() => setHighlightMode((v) => !v)}
        // A031 — the study dialog and the header's Aa popover could both be open at once,
        // overlapping. The popover's only exit was an outside MOUSEDOWN, and the keyboard path
        // (Enter on a verse handle), the `#v16:study` deep link and `?firstrun=1` all open the
        // dialog without one. This is the same invariant VerseDisplay keeps for the popover's
        // sibling — the selection popover never co-renders with the drawer (`pending &&
        // selectedVerse === null`) — applied at the only seam available: the page owns `study`,
        // the popover owns its `open`, so the page states the fact and the popover acts on it.
        // `study !== null` covers BOTH sheets that state opens (StudyPanel and WordPanel).
        dialogOpen={study !== null}
      />
      {/* THE CHAPTER'S ANNOTATIONS DID NOT LOAD. Signed-in readers only: signed out this GET is a
          401 by design, and there is nothing to have failed to load. In flow rather than fixed, so
          it cannot collide with the write-failure banner at the bottom of this file; ReaderHeader
          is `sticky`, not `fixed`, so it cannot hide under that either. The copy names the thing a
          reader would otherwise do wrong — re-create highlights, or type over a note that is still
          on the server. */}
      {signedIn && annotationsFailed && (
        <div
          role="status"
          className="reading-measure mx-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 pt-3 text-xs text-amber-800 sm:px-6 dark:text-amber-300"
        >
          <span>Your highlights and notes couldn&rsquo;t be loaded. Nothing was lost. This page just isn&rsquo;t showing them.</span>
          <button
            type="button"
            onClick={retryAnnotations}
            className="inline-flex min-h-[44px] shrink-0 items-center font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}
      {interlinear ? (
        original ? (
          <>
            <Interlinear data={original} bookName={book.name} onWordClick={handleWordClick} />
            <ChapterNav book={book} chapter={chapterNum} />
          </>
        ) : (
          <ChapterSkeleton label="Loading Greek and Hebrew" />
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
            freshSpans={freshSpans}
            notedVerses={new Set(notes.keys())}
            bookmarkedVerses={bookmarks}
            onToggleBookmark={toggleBookmark}
            onClearHighlight={clearVerse}
            signedIn={signedIn}
            onAddHighlight={addHighlight}
            onOpen={(verse, tab) => openStudy(verse, tab)}
            tapMode={highlightMode}
            onExitTapMode={() => setHighlightMode(false)}
            // Absent until the chapter's interlinear has loaded: resolving with no data behind
            // it would answer every word with "no match", which is a lie about the verse rather
            // than a fact about the lookup.
            resolveDefine={original ? resolveDefine : undefined}
            onPickDefine={pickDefine}
            onOpenWordStudy={openWordStudy}
          />
          <ChapterNav book={book} chapter={chapterNum} />
        </>
      ) : (
        <ChapterSkeleton label={`Loading ${book.name} ${chapterNum}`} />
      )}
      {translationAttribution(translation.id) ? (
        <p className="reading-measure mx-auto px-6 pb-8 text-center text-xs text-stone-500 dark:text-stone-400">
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
          onClose={closeStudy}
        />
      ) : study ? (
        <StudyPanel
          reference={`${book.name} ${chapterNum}:${study.verse}`}
          verseNum={study.verse}
          verseText={studyVerseText}
          entries={studyEntries}
          entriesLoadFailed={studyEntriesFailed}
          onRetryCommentaries={retryCommentaries}
          originalWords={studyWords}
          lang={original?.lang ?? null}
          defaultTab={study.tab}
          focusWordIdx={study.focusWordIdx}
          selection={study.selection}
          prevVerse={studyNeighbours.prev}
          nextVerse={studyNeighbours.next}
          onNavigate={navigateStudy}
          // B022 — the bookmark toggle in the panel's persistent chrome. The same closure shape
          // as `annotation.onClearHighlight` below: the page holds the verse, the panel gets the
          // answer. `bookmarks` is the optimistic Set from useAnnotationWrites, so the label
          // flips live with the toggle. Signed-out gating happens inside the panel's row (it
          // renders the sign-in line instead), same as the highlight controls.
          bookmarked={bookmarks.has(study.verse)}
          onToggleBookmark={() => toggleBookmark(study.verse)}
          verseId={encodeVerseId({ book: book.bookNum, chapter: chapterNum, verse: study.verse })}
          annotation={{
            color: highlights.get(study.verse)?.at(-1)?.color ?? null,
            note: notes.get(study.verse) ?? '',
            signedIn,
            loadFailed: annotationsFailed,
            onSetHighlight: (color) => addHighlight(study.verse, null, color),
            onClearHighlight: () => clearVerse(study.verse),
            onSaveNote: (body) => {
              // F-120/F-125 — do not close the panel on a failed save. The panel closes only
              // via the onSuccess callback, which fires after the write has landed; on failure
              // the error banner appears and the panel stays open so the reader can retry or
              // copy their note out.
              saveVerseNote(study.verse, body, closeStudy);
            },
            onDeleteNote: () => deleteVerseNote(study.verse),
          }}
          onTabChange={(t) => setStudy((s) => (s ? { ...s, tab: t, focusWordIdx: undefined } : s))}
          onClose={closeStudy}
        />
      ) : null}

      {/* A highlight/note/bookmark write that failed after retrying (use-annotation-writes.ts).
          The optimistic paint has already been rolled back by the time this appears — this is
          telling the reader that happened, not asking them to wait. Fixed, not floating: a
          reader annotating near the top of a long chapter shouldn't need to scroll to see it.
          bottom-[…] on mobile clears MobileNav's own fixed bar (mobile-nav.tsx: 3.75rem tall +
          safe-area-inset-bottom) — the same clearance selection-popover.tsx uses for its docked
          bar — or the banner sits UNDER Home/Bible/Search/etc. and is unreadable. md+ has no
          bottom nav, so bottom-4 is correct there. */}
      {writeError && (
        <div
          role="alert"
          className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom)+1rem)] z-50 mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-full border border-red-300/60 bg-red-50/95 px-4 py-2 text-sm text-red-800 md:bottom-4 dark:border-red-900/60 dark:bg-red-950/90 dark:text-red-200"
        >
          <span>{writeError.message}.</span>
          {writeError.retry && (
            <button
              type="button"
              onClick={() => {
                retryWrite();
                dismissWrite();
              }}
              className="min-h-[28px] shrink-0 rounded-lg bg-red-700 px-3 py-1 text-xs font-semibold text-white hover:bg-red-800 dark:bg-red-500 dark:hover:bg-red-400"
            >
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={dismissWrite}
            aria-label="Dismiss"
            className="shrink-0 text-red-500 hover:text-red-700 dark:text-red-300 dark:hover:text-red-100"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The reading surface's own shape, held while the chapter loads.
 *
 * This replaced a centred `<p>Loading…</p>` — so the claim that the reader gave "no feedback at
 * all" was not quite right, but the complaint underneath it was: the Library shows a pulsing
 * skeleton and the reader showed a bare word in the middle of an empty screen, so the same app
 * answered the same question two different ways, and the reader's answer also threw the page
 * into a full relayout when the verses arrived.
 *
 * The container classes below MIRROR VerseDisplay's outermost div deliberately. That is a
 * duplication with a purpose: the skeleton is only worth having if it occupies the same box the
 * real content will, which is what stops the layout shift. If VerseDisplay's container changes,
 * this follows it.
 *
 * `animate-pulse` is already inert under prefers-reduced-motion (globals.css), and the bars are
 * aria-hidden behind one sr-only line so a screen reader hears the state once instead of
 * hearing nothing or hearing eleven empty divs.
 */
function ChapterSkeleton({ label }: { label: string }) {
  // Ragged, not uniform: equal-length bars read as a table, and Scripture does not set that way.
  const lines = ['w-[95%]', 'w-[88%]', 'w-full', 'w-[72%]', 'w-[92%]', 'w-[84%]', 'w-full', 'w-[63%]'];
  return (
    <div
      aria-busy
      className="reading-measure mx-auto my-12 px-6 sm:my-20"
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden className="animate-pulse">
        <div className="mb-8 h-8 w-40 rounded-lg bg-stone-200/70 dark:bg-stone-800" />
        <div className="space-y-3.5">
          {lines.map((w, i) => (
            <div key={i} className={`h-4 ${w} rounded bg-stone-200/60 dark:bg-stone-800/80`} />
          ))}
        </div>
      </div>
    </div>
  );
}
