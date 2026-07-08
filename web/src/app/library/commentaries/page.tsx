'use client';

import { useEffect, useMemo, useState } from 'react';
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
  const [bookSlug, setBookSlug] = useState('jhn');
  const [chapter, setChapter] = useState(1);
  const [entries, setEntries] = useState<CommentaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [manifest, setManifest] = useState<CommentarySource[] | null>(null);
  const [authorFilter, setAuthorFilter] = useState<string>('all');

  const book: Book = BOOK_BY_BOOK_SLUG.get(bookSlug) ?? BOOKS[0]!;

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

  // group entries by author, ordered by year
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

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-scripture text-3xl font-medium text-stone-800">Commentaries</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">
          Read what others before you have said, passage by passage. Every note is stored in the
          app and shown in full here. These are the words of men, never a substitute for the text
          itself.
          {manifest && manifest.length > 0 && (
            <> {manifest.length} sources across the corpus.</>
          )}
        </p>
      </header>

      {/* Passage selector */}
      <div className="sticky top-0 z-20 -mx-5 mb-6 flex flex-wrap items-center gap-2 border-b border-stone-200 bg-stone-50/95 px-5 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
        <select
          value={bookSlug}
          onChange={(e) => {
            setBookSlug(e.target.value);
            setChapter(1);
          }}
          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 shadow-sm outline-none focus:border-stone-500"
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
          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 shadow-sm outline-none focus:border-stone-500"
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
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 shadow-sm outline-none focus:border-stone-500"
          >
            <option value="all">All sources ({grouped.length})</option>
            {grouped.map((g) => (
              <option key={g.author} value={g.author}>{g.author}</option>
            ))}
          </select>
        )}

        <Link
          href={`/read/${bookSlug}/${chapter}`}
          className="ml-auto rounded-full bg-white px-3 py-1.5 text-xs font-medium text-stone-600 shadow-sm hover:bg-stone-100"
        >
          Open in reader →
        </Link>
      </div>

      {/* Body */}
      {loading ? (
        <p className="py-16 text-center text-sm text-stone-400">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-stone-400">
          No commentary available for {book.name} {book.chapterCount === 1 ? '' : chapter} yet.
        </p>
      ) : (
        <div className="space-y-8">
          {visible.map((g) => (
            <article key={g.author} className="rounded-2xl border border-stone-200 bg-white/60 p-5 shadow-sm">
              <div className="mb-3 flex flex-wrap items-baseline gap-2 border-b border-stone-100 pb-3">
                <h2 className="font-scripture text-xl font-medium text-stone-800">{g.author}</h2>
                {g.year != null && <span className="text-xs text-stone-400">{yearLabel(g.year)}</span>}
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-500">
                  {g.tradition ?? eraLabel(g.year)}
                </span>
                <span className="ml-auto text-[11px] text-stone-400">{g.sourceTitle}</span>
              </div>
              <div className="space-y-3">
                {g.notes.map((n, i) => (
                  <p key={i} className="font-scripture text-[15px] leading-relaxed text-stone-700">
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

      <p className="mt-12 border-t border-stone-100 pt-6 text-center font-scripture text-sm italic text-stone-400">
        These are the words of men. Open your Bible and pray on it.
      </p>
    </div>
  );
}
