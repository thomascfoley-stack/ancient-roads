'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  BOOKS,
  BOOK_BY_BOOK_SLUG,
  fetchCommentary,
  fetchCommentaryManifest,
  type Book,
  type CommentaryEntry,
  type CommentarySource,
} from '@/lib/bible';

const BOOK_BY_NUM = new Map(BOOKS.map((b) => [b.bookNum, b]));
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
      <span className="whitespace-pre-line">{shown}</span>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="ml-1 text-xs font-medium text-amber-700 hover:text-amber-800"
        >
          {expanded ? 'less' : 'more'}
        </button>
      )}
    </>
  );
}

export default function CommentariesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
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

  const book: Book = BOOK_BY_BOOK_SLUG.get(bookSlug) ?? BOOKS[0]!;
  const isSearching = debouncedQuery.length > 0;

  useEffect(() => {
    fetchCommentaryManifest().then((m) => setManifest(m?.sources ?? []));
  }, []);

  useEffect(() => {
    setLoading(true);
    setAuthorFilter('all');
    fetchCommentary(bookSlug, chapter)
      .then((d) => setEntries(d?.entries ?? []))
      .finally(() => setLoading(false));
  }, [bookSlug, chapter]);

  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setDebouncedQuery('');
      setSearchResults([]);
      setSearchTotal(0);
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

  useEffect(() => {
    if (!debouncedQuery) return;
    setSearchLoading(true);
    setSearchError(null);

    const params = new URLSearchParams({ q: debouncedQuery, limit: String(PAGE_SIZE), offset: String(searchPage * PAGE_SIZE) });
    if (traditionFilter) params.set('tradition', traditionFilter);

    fetch(`/api/search/commentaries?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Search failed (${r.status})`);
        return r.json();
      })
      .then((data: { results: SearchResult[]; total: number }) => {
        setSearchResults(data.results);
        setSearchTotal(data.total);
      })
      .catch((err) => {
        setSearchError(err instanceof Error ? err.message : 'Search failed');
        setSearchResults([]);
        setSearchTotal(0);
      })
      .finally(() => setSearchLoading(false));
  }, [debouncedQuery, searchPage, traditionFilter]);

  const traditions = useMemo(() => {
    const set = new Set<string>();
    for (const r of searchResults) {
      if (r.tradition) set.add(r.tradition);
    }
    return [...set].sort();
  }, [searchResults]);

  const grouped = useMemo(() => {
    const byAuthor = new Map<string, CommentaryEntry[]>();
    for (const e of entries) {
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
  }, [entries]);

  const visible = authorFilter === 'all' ? grouped : grouped.filter((g) => g.author === authorFilter);
  const totalPages = Math.ceil(searchTotal / PAGE_SIZE);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-scripture text-3xl font-medium text-stone-800 dark:text-stone-100">Commentaries</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500 dark:text-stone-400">
          Search what others before you have said, or browse passage by passage.
          {manifest && manifest.length > 0 && (
            <> {manifest.length} sources across the corpus.</>
          )}
        </p>
      </header>

      {/* Search input */}
      <div className="relative mb-4">
        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchInput(e.target.value)}
          placeholder="Search commentaries…"
          className="w-full rounded-lg border border-stone-300 bg-white py-2.5 pl-10 pr-4 text-sm text-stone-800 shadow-sm outline-none placeholder:text-stone-400 focus:border-stone-500 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-stone-400"
        />
        {searchQuery && (
          <button
            onClick={() => handleSearchInput('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
            aria-label="Clear search"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  !traditionFilter
                    ? 'bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700'
                }`}
              >
                All
              </button>
              {traditions.map((t) => (
                <button
                  key={t}
                  onClick={() => { setTraditionFilter(traditionFilter === t ? null : t); setSearchPage(0); }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    traditionFilter === t
                      ? 'bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {searchLoading ? (
            <p className="py-16 text-center text-sm text-stone-400">Searching…</p>
          ) : searchError ? (
            <p className="py-16 text-center text-sm text-red-500">{searchError}</p>
          ) : searchResults.length === 0 ? (
            <p className="py-16 text-center text-sm text-stone-400">
              No results for &ldquo;{debouncedQuery}&rdquo;
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-stone-400 dark:text-stone-500">
                {searchTotal} result{searchTotal !== 1 ? 's' : ''}
                {traditionFilter ? ` in ${traditionFilter}` : ''}
              </p>

              <div className="space-y-3">
                {searchResults.map((r) => {
                  const b = BOOK_BY_NUM.get(r.book);
                  const passageLabel = b
                    ? `${b.name} ${r.chapter}:${verseLabel(r.verse_start, r.verse_end)}`
                    : `${r.book}:${r.chapter}:${r.verse_start}`;
                  const readerUrl = b ? `/read/${b.slug}/${r.chapter}` : '#';

                  return (
                    <article key={r.id} className="rounded-xl border border-stone-200 bg-white/60 p-4 shadow-sm dark:border-stone-700 dark:bg-stone-800/50">
                      <div className="mb-1 flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-medium text-stone-800 dark:text-stone-100">{r.author}</span>
                        {r.year != null && <span className="text-xs text-stone-400">{yearLabel(r.year)}</span>}
                        {r.tradition && (
                          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-500 dark:bg-stone-700 dark:text-stone-400">
                            {r.tradition}
                          </span>
                        )}
                      </div>
                      <p className="mb-2 text-xs text-stone-400 dark:text-stone-500">
                        {passageLabel} · {r.source_title}
                      </p>
                      <p
                        className="font-scripture text-sm leading-relaxed text-stone-600 dark:text-stone-300 [&_mark]:rounded-sm [&_mark]:bg-amber-200/70 [&_mark]:px-0.5 [&_mark]:text-amber-900 dark:[&_mark]:bg-amber-700/40 dark:[&_mark]:text-amber-200"
                        dangerouslySetInnerHTML={{ __html: r.snippet }}
                      />
                      <Link
                        href={readerUrl}
                        className="mt-2 inline-block text-xs font-medium text-amber-700 hover:text-amber-800 dark:text-amber-500 dark:hover:text-amber-400"
                      >
                        Open in reader &rarr;
                      </Link>
                    </article>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setSearchPage((p) => Math.max(0, p - 1))}
                    disabled={searchPage === 0}
                    className="rounded-md border border-stone-300 px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100 disabled:opacity-40 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-800"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-stone-500 dark:text-stone-400">
                    {searchPage + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => setSearchPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={searchPage >= totalPages - 1}
                    className="rounded-md border border-stone-300 px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100 disabled:opacity-40 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-800"
                  >
                    Next
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
          <div className="sticky top-0 z-20 -mx-5 mb-6 flex flex-wrap items-center gap-2 border-b border-stone-200 bg-stone-50/95 px-5 py-3 backdrop-blur-sm dark:border-stone-700 dark:bg-stone-900/95 sm:-mx-6 sm:px-6">
            <select
              value={bookSlug}
              onChange={(e) => {
                setBookSlug(e.target.value);
                setChapter(1);
              }}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 shadow-sm outline-none focus:border-stone-500 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
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
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 shadow-sm outline-none focus:border-stone-500 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
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
                className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 shadow-sm outline-none focus:border-stone-500 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
              >
                <option value="all">All sources ({grouped.length})</option>
                {grouped.map((g) => (
                  <option key={g.author} value={g.author}>{g.author}</option>
                ))}
              </select>
            )}

            <Link
              href={`/read/${bookSlug}/${chapter}`}
              className="ml-auto rounded-full bg-white px-3 py-1.5 text-xs font-medium text-stone-600 shadow-sm hover:bg-stone-100 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
            >
              Open in reader &rarr;
            </Link>
          </div>

          {loading ? (
            <p className="py-16 text-center text-sm text-stone-400">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="py-16 text-center text-sm text-stone-400">
              No commentary available for {book.name} {book.chapterCount === 1 ? '' : chapter} yet.
            </p>
          ) : (
            <div className="space-y-8">
              {visible.map((g) => (
                <article key={g.author} className="rounded-2xl border border-stone-200 bg-white/60 p-5 shadow-sm dark:border-stone-700 dark:bg-stone-800/50">
                  <div className="mb-3 flex flex-wrap items-baseline gap-2 border-b border-stone-100 pb-3 dark:border-stone-700">
                    <h2 className="font-scripture text-xl font-medium text-stone-800 dark:text-stone-100">{g.author}</h2>
                    {g.year != null && <span className="text-xs text-stone-400">{yearLabel(g.year)}</span>}
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-500 dark:bg-stone-700 dark:text-stone-400">
                      {g.tradition ?? eraLabel(g.year)}
                    </span>
                    <span className="ml-auto text-[11px] text-stone-400">{g.sourceTitle}</span>
                  </div>
                  <div className="space-y-3">
                    {g.notes.map((n, i) => (
                      <p key={i} className="font-scripture text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
                        <span className="mr-2 select-none font-sans text-xs font-semibold text-amber-600/80">
                          {n.verseStart === n.verseEnd ? `v${n.verseStart}` : `v${n.verseStart}–${n.verseEnd}`}
                        </span>
                        <EntryText text={n.text} />
                      </p>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      <p className="mt-12 border-t border-stone-100 pt-6 text-center font-scripture text-sm italic text-stone-400 dark:border-stone-800">
        These are the words of men. Open your Bible and pray on it.
      </p>
    </div>
  );
}
