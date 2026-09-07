'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { sanitizeSnippet } from '@/lib/snippet';
import { responseErrorMessage } from '@/lib/api-error-message';
import { TextSkeleton } from '@/components/skeleton';
import {
  BOOKS,
  BOOK_BY_BOOK_SLUG,
  fetchCommentary,
  fetchCommentaryManifest,
  type Book,
  type CommentaryEntry,
  type CommentarySource,
} from '@/lib/bible';
import { resolveBookSlug } from '@bible/ref-parse';
import {
  partitionByRegister,
  registerChipLabel,
  ParaphraseChip,
  RegisterSectionHeading,
  SERMON_NOTE,
  THEOLOGY_NOTE,
  SONG_VERSE_NOTE,
} from '@/components/commentary-panel';

const BOOK_BY_NUM = new Map(BOOKS.map((b) => [b.bookNum, b]));

/**
 * A refusal the SERVER described — carrying a sentence already fit to show a reader.
 *
 * It exists only to be distinguishable in the `.catch` from everything else that can land there:
 * a dropped connection, an abort, a body that is not JSON. Those reject with the runtime's own
 * words ("Failed to fetch"), which must never be rendered, and without a marker the catch had no
 * way to tell one from the other — so it rendered `err.message` for both.
 */
class SearchRefused extends Error {}

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 20;

interface SearchResult {
  id: number;
  book: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
  author: string;
  year: number | null;
  tradition: string | null;
  source_title: string;
  snippet: string;
  rank: number;
}

function eraLabel(year: number | null): string {
  if (!year) return 'Undated';
  if (year <= 500) return 'Early Church';
  if (year <= 1500) return 'Medieval';
  if (year <= 1700) return 'Reformation';
  return 'Modern';
}

function yearLabel(year: number | null): string {
  if (year == null) return '';
  return year < 0 ? `${Math.abs(year)} BC` : `${year}`;
}

function verseLabel(start: number, end: number): string {
  return start === end ? `${start}` : `${start}–${end}`;
}

function EntryText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 700;
  const shown = isLong && !expanded ? text.slice(0, 700).replace(/\s+\S*$/, '') + '…' : text;
  return (
    <>
      <span className="whitespace-pre-line break-words">{shown}</span>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="ml-1 text-xs font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300"
        >
          {expanded ? 'less' : 'more'}
        </button>
      )}
    </>
  );
}

function SearchResultCard({
  result: r,
  loadFullText,
}: {
  result: SearchResult;
  loadFullText: (r: SearchResult) => Promise<string | null>;
}) {
  const [full, setFull] = useState<string | null>(null);
  const [view, setView] = useState<'snippet' | 'loading' | 'full' | 'unavailable'>('snippet');

  const b = BOOK_BY_NUM.get(r.book);
  const passageLabel = b
    ? `${b.name} ${r.chapter}:${verseLabel(r.verse_start, r.verse_end)}`
    : `${r.book}:${r.chapter}:${r.verse_start}`;
  const readerUrl = b ? `/read/${b.slug}/${r.chapter}` : '#';

  async function expand() {
    if (full) {
      setView('full');
      return;
    }
    setView('loading');
    const text = await loadFullText(r);
    if (text) {
      setFull(text);
      setView('full');
    } else {
      setView('unavailable');
    }
  }

  return (
    <article className="border-t edge pt-4">
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium text-stone-800 dark:text-stone-100">{r.author}</span>
        {r.year != null && <span className="text-xs text-stone-500 dark:text-stone-400">{yearLabel(r.year)}</span>}
        {r.tradition && (
          <span className="bg-stone-100 px-2 py-0.5 text-micro font-medium uppercase tracking-wide text-stone-500 dark:bg-stone-700 dark:text-stone-400">
            {r.tradition}
          </span>
        )}
      </div>
      <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">
        {passageLabel} · {r.source_title}
      </p>
      {view === 'full' && full ? (
        <p className="whitespace-pre-line font-scripture text-base leading-relaxed text-stone-700 dark:text-stone-300 break-words">
          {full}
        </p>
      ) : (
        <p
          className="font-scripture text-sm leading-relaxed text-stone-600 dark:text-stone-300 [&_mark]:rounded-sm [&_mark]:bg-accent-100 [&_mark]:px-0.5 [&_mark]:text-accent-900 dark:[&_mark]:bg-accent-900/50 dark:[&_mark]:text-accent-200"
          dangerouslySetInnerHTML={{ __html: sanitizeSnippet(r.snippet) }}
        />
      )}
      {view === 'unavailable' && (
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          Full text isn&rsquo;t available here. Open it in the reader.
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-5">
        {view === 'full' ? (
          <button
            onClick={() => setView('snippet')}
            className="inline-flex min-h-[44px] items-center text-xs font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300 dark:hover:text-accent-200"
          >
            Show less
          </button>
        ) : view !== 'unavailable' ? (
          <button
            onClick={expand}
            disabled={view === 'loading'}
            className="inline-flex min-h-[44px] items-center text-xs font-medium text-accent-700 hover:text-accent-800 disabled:opacity-50 dark:text-accent-300 dark:hover:text-accent-200"
          >
            {view === 'loading' ? 'Loading full text…' : 'Read full text'}
          </button>
        ) : null}
        <Link
          href={readerUrl}
          className="inline-flex min-h-[44px] items-center text-xs font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300 dark:hover:text-accent-200"
        >
          Open in reader &rarr;
        </Link>
      </div>
    </article>
  );
}

// Register-lane browse groups are keyed by WORK, not author: a metrical psalter
// (Watts' Psalms Imitated, paraphrase) and a hymnal (Watts' Hymns, not) share the
// author "Isaac Watts" but are DIFFERENT works with different paraphrase status —
// grouping by work keeps the "not Scripture" marker precise.
interface WorkGroup {
  key: string;
  author: string;
  year: number | null;
  tradition: string | null;
  sourceTitle: string;
  register?: string;
  paraphrase: boolean;
  notes: CommentaryEntry[];
}
function groupByWork(entries: CommentaryEntry[]): WorkGroup[] {
  const byWork = new Map<string, CommentaryEntry[]>();
  for (const e of entries) {
    const key = e.work ?? e.author;
    const arr = byWork.get(key);
    if (arr) arr.push(e);
    else byWork.set(key, [e]);
  }
  return [...byWork.entries()]
    .map(([key, list]) => ({
      key,
      author: list[0]!.author,
      year: list[0]!.year,
      tradition: list[0]!.tradition ?? null,
      sourceTitle: list[0]!.sourceTitle,
      register: list[0]!.register,
      paraphrase: list.some((e) => e.paraphrase),
      notes: [...list].sort((a, b) => a.verseStart - b.verseStart),
    }))
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.author.localeCompare(b.author));
}

// A labeled register section (Sermons / Theology & confessions / Hymns & sacred
// poetry) in the library browse — the register wall, consistent with the reader:
// these registers are NEVER blended into the exegetical commentary above.
function RegisterBrowseSection({ title, note, groups }: { title: string; note: string; groups: WorkGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <section className="mt-10">
      <RegisterSectionHeading title={title} note={note} />
      <div className="space-y-8">
        {groups.map((g) => (
          <article key={g.key} className="border-t edge pt-5">
 <div className="mb-3 flex flex-wrap items-baseline gap-2 border-b edge pb-3">
              <h3 className="font-scripture text-xl font-medium text-stone-800 dark:text-stone-100">{g.author}</h3>
              {g.year != null && <span className="text-xs text-stone-500 dark:text-stone-400">{yearLabel(g.year)}</span>}
              {registerChipLabel(g.register) && (
                <span className="bg-accent-700/10 px-2 py-0.5 text-micro font-medium text-accent-700 dark:text-accent-300">
                  {registerChipLabel(g.register)}
                </span>
              )}
              {g.paraphrase && <ParaphraseChip />}
              <span className="ml-auto text-micro text-stone-500 dark:text-stone-400">{g.sourceTitle}</span>
            </div>
            <div className="space-y-3">
              {g.notes.map((n, i) => (
                <p key={i} className="font-scripture text-base leading-relaxed text-stone-700 dark:text-stone-300">
                  <span className="mr-2 select-none font-sans text-xs font-semibold text-accent-600/80 dark:text-accent-300/80">
                    {n.verseStart === n.verseEnd ? `v${n.verseStart}` : `v${n.verseStart}–${n.verseEnd}`}
                  </span>
                  <EntryText text={n.text} />
                </p>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function PassageSearchPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchTotalCapped, setSearchTotalCapped] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPage, setSearchPage] = useState(0);
  const [traditionFilter, setTraditionFilter] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [bookSlug, setBookSlug] = useState('jhn');
  const [chapter, setChapter] = useState(1);
  const [entries, setEntries] = useState<CommentaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [manifest, setManifest] = useState<CommentarySource[] | null>(null);
  const [authorFilter, setAuthorFilter] = useState<string>('all');

  // The derived test/invariants/book-slug-alias-wiring.test.ts found this a THIRD site with the
  // A7 shape — bare BOOK_BY_BOOK_SLUG.get with no alias fallback. `bookSlug` is currently
  // set only from the <select> below, whose options are BOOKS' own canonical slugs, so an
  // alias never reaches here TODAY. Fixed anyway: it is the one line every other caller has,
  // the invariant is codebase-wide rather than hand-scoped to "reachable right now", and it is
  // free insurance the day this page gains a `?book=` deep link (a natural next feature for a
  // search page) and `bookSlug` starts life from a URL instead of a click.
  const book: Book = BOOK_BY_BOOK_SLUG.get(bookSlug) ?? resolveBookSlug(bookSlug) ?? BOOKS[0]!;
  const isSearching = debouncedQuery.length > 0;

  useEffect(() => {
    fetchCommentaryManifest().then((m) => setManifest(m?.sources ?? []));
  }, []);

  // D16 (DEEP_SWEEP): the B4 shape, unguarded. The book/chapter selects fire one effect run per
  // change; flip twice quickly and the SLOWER stale response resolves last and overwrites
  // `entries` — the selectors say John 5 while the list shows John 3, and it stays wrong because
  // nothing fetches again. setLoading only gates display while pending; it does not decide which
  // response wins. Same `cancelled` guard as read/[book]/[chapter] and desk-pane.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setAuthorFilter('all');
    fetchCommentary(bookSlug, chapter)
      .then((d) => { if (!cancelled) setEntries(d?.entries ?? []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bookSlug, chapter]);

  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setDebouncedQuery('');
      setSearchResults([]);
      setFacetTraditions([]); // D47: a new query gets a new facet vocabulary
      setSearchTotal(0);
      setSearchTotalCapped(false);
      setSearchPage(0);
      setTraditionFilter(null);
      setSearchError(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value.trim());
      setSearchPage(0);
      setTraditionFilter(null);
    }, DEBOUNCE_MS);
  }, []);

  // D17: no sequence guard, unlike catalog-search.tsx:71 and study-library-panel.tsx:85 which
  // both seq-guard. Two debounced queries, or a tradition-chip tap while a search is in flight,
  // race — and the stale response painting last shows the OLD query's results and count under
  // the new query text, i.e. unfiltered results under a lit filter chip. A stale page-0 response
  // after a Load-more also REPLACES the appended list.
  const [facetTraditions, setFacetTraditions] = useState<string[]>([]);
  const searchSeq = useRef(0);
  useEffect(() => {
    if (!debouncedQuery) return;
    const mine = ++searchSeq.current;
    setSearchLoading(true);
    setSearchError(null);

    const params = new URLSearchParams({ q: debouncedQuery, limit: String(PAGE_SIZE), offset: String(searchPage * PAGE_SIZE) });
    if (traditionFilter) params.set('tradition', traditionFilter);

    // The `!r.ok` branch used to throw an Error whose message interpolated r.status, and the catch
    // rendered `err.message`, so a reader was shown "Search failed (500)" — and, on a dropped
    // connection, fetch's own "Failed to fetch". The refusal and the transport failure are now
    // handled apart: the refusal gets the server's curated copy (or its status's meaning) via
    // `responseErrorMessage`, and the catch — which can now only be a transport or parse
    // failure — gets one sentence of ours, never the exception's.
    fetch(`/api/search/commentaries?${params}`)
      .then(async (r) => {
        if (!r.ok) {
          const said = await responseErrorMessage(r, 'That search could not be run. Please try again.');
          throw new SearchRefused(said);
        }
        return r.json() as Promise<{ results: SearchResult[]; total: number; totalCapped?: boolean }>;
      })
      .then((data: { results: SearchResult[]; total: number; totalCapped?: boolean }) => {
        if (mine !== searchSeq.current) return;
        // D47: capture the facet vocabulary from the UNFILTERED page-0 response only.
        if (searchPage === 0 && !traditionFilter) {
          const set = new Set<string>();
          for (const r of data.results) if (r.tradition) set.add(r.tradition);
          setFacetTraditions([...set].sort());
        }
        setSearchTotal(data.total);
        setSearchTotalCapped(Boolean(data.totalCapped));
        setSearchResults((prev) => {
          if (searchPage === 0) return data.results;
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...data.results.filter((r) => !seen.has(r.id))];
        });
      })
      .catch((err: unknown) => {
        if (mine !== searchSeq.current) return;
        setSearchError(
          err instanceof SearchRefused
            ? err.message
            : 'That search could not be run. Please check your connection and try again.',
        );
        // D17 secondary: this wiped ALL results even when only a Load-more page failed,
        // destroying pages the reader already had. Only a page-0 failure clears.
        if (searchPage === 0) {
          setSearchResults([]);
          setSearchTotal(0);
          setSearchTotalCapped(false);
        }
      })
      .finally(() => { if (mine === searchSeq.current) setSearchLoading(false); });
  }, [debouncedQuery, searchPage, traditionFilter]);

  // Resolve a search hit to its full entry text from the static corpus files
  // (same content the reader uses); cached per chapter.
  const chapterCacheRef = useRef(new Map<string, CommentaryEntry[]>());
  const loadFullText = useCallback(async (r: SearchResult): Promise<string | null> => {
    const b = BOOK_BY_NUM.get(r.book);
    if (!b) return null;
    const key = `${b.slug}:${r.chapter}`;
    let chapterEntries = chapterCacheRef.current.get(key);
    if (!chapterEntries) {
      const d = await fetchCommentary(b.slug, r.chapter);
      chapterEntries = d?.entries ?? [];
      chapterCacheRef.current.set(key, chapterEntries);
    }
    const hit =
      chapterEntries.find(
        (e) => e.author === r.author && e.verseStart === r.verse_start && e.verseEnd === r.verse_end,
      ) ??
      chapterEntries.find(
        (e) => e.author === r.author && e.verseStart <= r.verse_start && r.verse_end <= e.verseEnd,
      );
    return hit?.text ?? null;
  }, []);

  // D47 (DEEP_SWEEP): these chips used to be derived from `searchResults`, which the active
  // traditionFilter has ALREADY narrowed server-side. Clicking "reformed" narrowed the results to
  // reformed-only, which recomputed the facets to ['reformed'] — every other chip vanished, and
  // the only way back was "All". Facets must describe what the QUERY matched, not what the
  // current filter left, so they are captured from the unfiltered page-0 response and held
  // stable while the reader filters.
  const traditions = facetTraditions;

  // Register wall (library browse): partition the chapter's entries into their
  // registers, then group ONLY the exegetical commentary by author for the browse +
  // author filter. Sermons, theology/confessions, and hymns/poetry render in their
  // own labeled sections below (never blended into the commentary voices) — the
  // same wall the reader enforces.
  const part = useMemo(() => partitionByRegister(entries), [entries]);

  const grouped = useMemo(() => {
    const byAuthor = new Map<string, CommentaryEntry[]>();
    for (const e of part.exegetical) {
      const arr = byAuthor.get(e.author);
      if (arr) arr.push(e);
      else byAuthor.set(e.author, [e]);
    }
    return [...byAuthor.entries()]
      .map(([author, list]) => ({
        author,
        year: list[0]!.year,
        tradition: list[0]!.tradition ?? null,
        sourceTitle: list[0]!.sourceTitle,
        sourceUrl: list[0]!.sourceUrl,
        notes: [...list].sort((a, b) => a.verseStart - b.verseStart),
      }))
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.author.localeCompare(b.author));
  }, [part]);

  const sermonGroups = useMemo(() => groupByWork(part.sermon), [part]);
  const theologyGroups = useMemo(() => groupByWork(part.theology), [part]);
  const songVerseGroups = useMemo(() => groupByWork(part.songVerse), [part]);

  const visible = authorFilter === 'all' ? grouped : grouped.filter((g) => g.author === authorFilter);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-medium tracking-tight text-stone-900 dark:text-stone-100">Passage search</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500 dark:text-stone-400">
          Search what others before you have said, or browse passage by passage.
          {manifest && manifest.length > 0 && (
            <> {manifest.length} sources across the library.</>
          )}
        </p>
      </header>

      {/* Search input */}
      <div className="relative mb-4">
        <svg aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500 dark:text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchInput(e.target.value)}
          placeholder="Search commentaries…"
          aria-label="Search commentaries"
          className="w-full border edge bg-transparent py-3 pl-10 pr-12 text-base text-stone-800 placeholder:text-stone-400 sm:py-2.5 sm:text-sm dark:text-stone-100 dark:placeholder:text-stone-500"
        />
        {searchQuery && (
          <button
            onClick={() => handleSearchInput('')}
            className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-stone-500 dark:text-stone-400 hover:text-stone-600 active:bg-stone-200/60 dark:hover:text-stone-300 dark:active:bg-stone-700/60"
            aria-label="Clear search"
          >
            <svg aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {isSearching ? (
        /* ============ SEARCH MODE ============ */
        <>
          {/* Tradition facet chips */}
          {traditions.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              <button
                onClick={() => { setTraditionFilter(null); setSearchPage(0); }}
                className={`min-h-[44px] rounded-lg px-4 text-sm font-medium transition-colors ease-gentle sm:min-h-0 sm:px-3 sm:py-1 sm:text-xs ${
                  !traditionFilter
                    ? 'bg-accent-700 text-stone-50 dark:bg-accent-400 dark:text-stone-950'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200 active:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700'
                }`}
              >
                All
              </button>
              {traditions.map((t) => (
                <button
                  key={t}
                  onClick={() => { setTraditionFilter(traditionFilter === t ? null : t); setSearchPage(0); }}
                  className={`min-h-[44px] rounded-lg px-4 text-sm font-medium transition-colors ease-gentle sm:min-h-0 sm:px-3 sm:py-1 sm:text-xs ${
                    traditionFilter === t
                      ? 'bg-accent-700 text-stone-50 dark:bg-accent-400 dark:text-stone-950'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200 active:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {searchLoading && searchResults.length === 0 ? (
            <p className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">Searching…</p>
          ) : searchError ? (
            <p role="alert" className="py-16 text-center text-sm text-red-800 dark:text-red-200">{searchError}</p>
          ) : searchResults.length === 0 ? (
            <p className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">
              No results for &ldquo;{debouncedQuery}&rdquo;
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
                {searchTotal}{searchTotalCapped ? '+' : ''} result{searchTotal !== 1 ? 's' : ''}
                {traditionFilter ? ` in ${traditionFilter}` : ''}
              </p>

              <div className="space-y-3">
                {searchResults.map((r) => (
                  <SearchResultCard key={r.id} result={r} loadFullText={loadFullText} />
                ))}
              </div>

              {/* Load more (append) */}
              {searchResults.length < searchTotal && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={() => setSearchPage((p) => p + 1)}
                    disabled={searchLoading}
                    className="min-h-[44px] border border-stone-500 bg-transparent px-6 font-sans text-sm font-medium text-stone-600 transition-colors ease-gentle hover:bg-stone-500 hover:text-stone-50 disabled:opacity-40 dark:border-stone-400 dark:text-stone-300 dark:hover:bg-stone-400 dark:hover:text-stone-950"
                  >
                    {searchLoading ? 'Loading…' : `Load more (${searchResults.length} of ${searchTotal}${searchTotalCapped ? '+' : ''})`}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        /* ============ BROWSE MODE ============ */
        <>
          {/* Passage selector */}
 <div className="sticky top-0 z-20 -mx-5 mb-6 flex flex-wrap items-center gap-2 border-b edge bg-stone-50 px-5 py-3 dark:bg-stone-950 sm:-mx-6 sm:px-6">
            <select
              value={bookSlug}
              onChange={(e) => {
                setBookSlug(e.target.value);
                setChapter(1);
              }}
              className="min-h-[44px] max-w-full border edge bg-transparent px-3 text-base text-stone-800 sm:min-h-0 sm:py-1.5 sm:text-sm dark:text-stone-100"
            >
              <optgroup label="Old Testament">
                {BOOKS.filter((b) => b.testament === 'OT').map((b) => (
                  <option key={b.slug} value={b.slug}>{b.name}</option>
                ))}
              </optgroup>
              <optgroup label="New Testament">
                {BOOKS.filter((b) => b.testament === 'NT').map((b) => (
                  <option key={b.slug} value={b.slug}>{b.name}</option>
                ))}
              </optgroup>
            </select>

            <select
              value={chapter}
              onChange={(e) => setChapter(Number(e.target.value))}
              className="min-h-[44px] max-w-full border edge bg-transparent px-3 text-base text-stone-800 sm:min-h-0 sm:py-1.5 sm:text-sm dark:text-stone-100"
            >
              {Array.from({ length: book.chapterCount }, (_, i) => i + 1).map((c) => (
                <option key={c} value={c}>
                  {book.chapterCount === 1 ? 'Whole book' : `Chapter ${c}`}
                </option>
              ))}
            </select>

            {grouped.length > 0 && (
              <select
                value={authorFilter}
                onChange={(e) => setAuthorFilter(e.target.value)}
                className="min-h-[44px] max-w-full border edge bg-transparent px-3 text-base text-stone-800 sm:min-h-0 sm:py-1.5 sm:text-sm dark:text-stone-100"
              >
                {/* "authors", not "sources": every option below this one is `g.author`, and the
                    header three hundred lines up already says "N sources across the library" from
                    a DIFFERENT set (the whole-library manifest, not this passage's results). Two
                    counts of two different things wearing one noun on one screen — three of the
                    2026-08-16 QA fleet's twenty sessions independently filed it as an arithmetic
                    contradiction. Neither number was ever wrong; the label was. */}
                <option value="all">All authors ({grouped.length})</option>
                {grouped.map((g) => (
                  <option key={g.author} value={g.author}>{g.author}</option>
                ))}
              </select>
            )}

            <Link
              href={`/read/${bookSlug}/${chapter}`}
              className="ml-auto inline-flex min-h-[44px] items-center border edge px-4 text-xs font-medium text-stone-600 hover:bg-stone-100 active:bg-stone-200 sm:min-h-0 sm:py-1.5 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Open in reader &rarr;
            </Link>
          </div>

          {loading ? (
            <TextSkeleton label="Loading commentary on this passage" lines={6} className="py-16" />
          ) : entries.length === 0 ? (
            <p className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">
              No commentary available for {book.name} {book.chapterCount === 1 ? '' : chapter} yet.
            </p>
          ) : (
            <>
              {visible.length > 0 ? (
                <div className="space-y-8">
                  {visible.map((g) => (
                    <article key={g.author} className="border-t edge pt-5">
 <div className="mb-3 flex flex-wrap items-baseline gap-2 border-b edge pb-3">
                        <h2 className="font-scripture text-xl font-medium text-stone-800 dark:text-stone-100">{g.author}</h2>
                        {g.year != null && <span className="text-xs text-stone-500 dark:text-stone-400">{yearLabel(g.year)}</span>}
                        <span className="bg-stone-100 px-2 py-0.5 text-micro font-medium uppercase tracking-wide text-stone-500 dark:bg-stone-700 dark:text-stone-400">
                          {g.tradition ?? eraLabel(g.year)}
                        </span>
                        <span className="ml-auto text-micro text-stone-500 dark:text-stone-400">{g.sourceTitle}</span>
                      </div>
                      <div className="space-y-3">
                        {g.notes.map((n, i) => (
                          <p key={i} className="font-scripture text-base leading-relaxed text-stone-700 dark:text-stone-300">
                            <span className="mr-2 select-none font-sans text-xs font-semibold text-accent-600/80 dark:text-accent-300/80">
                              {n.verseStart === n.verseEnd ? `v${n.verseStart}` : `v${n.verseStart}–${n.verseEnd}`}
                            </span>
                            <EntryText text={n.text} />
                          </p>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-stone-500 dark:text-stone-400">
                  No verse-by-verse commentary{authorFilter !== 'all' ? ' from this source' : ''} here.
                </p>
              )}

              {/* The register wall: sermons, theology/confessions, and hymns/poetry
                  in their OWN labeled sections — never blended into the commentary
                  above. Shown in the full (unfiltered) browse view. */}
              {authorFilter === 'all' && (
                <>
                  <RegisterBrowseSection title="Sermons" note={SERMON_NOTE} groups={sermonGroups} />
                  <RegisterBrowseSection title="Theology & confessions" note={THEOLOGY_NOTE} groups={theologyGroups} />
                  <RegisterBrowseSection title="Hymns & sacred poetry" note={SONG_VERSE_NOTE} groups={songVerseGroups} />
                </>
              )}
            </>
          )}
        </>
      )}

 <p className="mt-12 border-t edge pt-6 text-center font-scripture text-sm italic text-stone-500 dark:text-stone-400">
        Nevertheless, not as I will, but as you will. . . . Your will be done!
      </p>
    </div>
  );
}
