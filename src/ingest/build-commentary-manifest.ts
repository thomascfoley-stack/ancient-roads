// Scans every commentary chapter file and builds a manifest of distinct sources
// (author + sourceTitle + tradition + year) with entry counts and which books
// each source covers. Written to web/public/commentaries/_manifest.json so the
// in-app "Commentaries" library can render a catalog without scanning at runtime.
//
// Idempotent + re-runnable.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { BOOKS } from '../bible/books.js';

const ROOT = 'web/public/commentaries';
const BOOK_NUM_TO_SLUG = new Map(BOOKS.map((b) => [b.bookNum, b.slug]));

interface SourceAgg {
  author: string;
  sourceTitle: string;
  tradition: string | null;
  year: number | null;
  entries: number;
  books: Set<number>;
}

function* walkJson(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('_')) continue; // skip manifest itself
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walkJson(p);
    else if (name.endsWith('.json')) yield p;
  }
}

const sources = new Map<string, SourceAgg>();

for (const file of walkJson(ROOT)) {
  const data = JSON.parse(readFileSync(file, 'utf-8')) as {
    book: number;
    entries: {
      author: string;
      sourceTitle: string;
      tradition?: string | null;
      year?: number | null;
    }[];
  };
  if (!Array.isArray(data.entries)) continue;

  for (const e of data.entries) {
    const key = e.author;
    let agg = sources.get(key);
    if (!agg) {
      agg = {
        author: e.author,
        sourceTitle: e.sourceTitle ?? e.author,
        tradition: e.tradition ?? null,
        year: e.year ?? null,
        entries: 0,
        books: new Set(),
      };
      sources.set(key, agg);
    }
    agg.entries++;
    if (data.book) agg.books.add(data.book);
    // keep earliest non-null year / first tradition seen
    if (agg.year == null && e.year != null) agg.year = e.year;
    if (agg.tradition == null && e.tradition) agg.tradition = e.tradition;
  }
}

const manifest = {
  generatedAt: new Date().toISOString(),
  sources: [...sources.values()]
    .map((s) => ({
      author: s.author,
      sourceTitle: s.sourceTitle,
      tradition: s.tradition,
      year: s.year,
      entries: s.entries,
      bookSlugs: [...s.books]
        .map((n) => BOOK_NUM_TO_SLUG.get(n))
        .filter((x): x is string => Boolean(x)),
    }))
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.author.localeCompare(b.author)),
};

writeFileSync(`${ROOT}/_manifest.json`, JSON.stringify(manifest));
console.log(`Sources: ${manifest.sources.length}`);
console.log(`Total entries: ${manifest.sources.reduce((n, s) => n + s.entries, 0)}`);
console.log('Top sources by entry count:');
[...manifest.sources]
  .sort((a, b) => b.entries - a.entries)
  .slice(0, 15)
  .forEach((s) => console.log(`  ${String(s.entries).padStart(6)}  ${s.author}`));
