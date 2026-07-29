#!/usr/bin/env tsx
// CLI: import commentaries from the HistoricalChristianFaith SQLite database
// into JSON files organized by verse for future loading into Supabase.
//
// Usage:  pnpm ingest:commentaries
//         tsx src/ingest/ingest-commentaries.ts [path-to-sqlite]
//
// Produces: data/commentaries/{bookSlug}/{chapter}.json
// Each file: { book, chapter, entries: [{ verseStart, verseEnd, author, year, sourceTitle, sourceUrl, text }] }

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOKS } from '../bible/books';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const dbPath = process.argv[2] ?? join(root, 'data', 'raw', 'commentaries.sqlite');

// Map commentary DB book names → our book numbers
const BOOK_NAME_TO_NUM: Record<string, number> = {};
for (const b of BOOKS) {
  // Our slug without numbers prefix
  const lowerName = b.name.toLowerCase().replace(/\s+/g, '');
  BOOK_NAME_TO_NUM[lowerName] = b.bookNum;
}
// Explicit overrides for format mismatches
Object.assign(BOOK_NAME_TO_NUM, {
  '1samuel': 9, '2samuel': 10,
  '1kings': 11, '2kings': 12,
  '1chronicles': 13, '2chronicles': 14,
  songofsolomon: 22, // Song of Songs
  '1corinthians': 46, '2corinthians': 47,
  '1thessalonians': 52, '2thessalonians': 53,
  '1timothy': 54, '2timothy': 55,
  '1peter': 60, '2peter': 61,
  '1john': 62, '2john': 63, '3john': 64,
});

const SLUG_BY_NUM = new Map(BOOKS.map((b) => [b.bookNum, b.slug]));

// Deuterocanonical / apocryphal — skip
const SKIP_BOOKS = new Set([
  '1maccabees', '2maccabees', 'baruch', 'judith',
  'sirach', 'tobit', 'wisdom', 'prayerofazariah',
]);

interface RawRow {
  book: string;
  father_name: string;
  ts: number | null;
  location_start: number;
  location_end: number;
  txt: string;
  source_title: string;
  source_url: string;
  append_to_author_name: string;
}

interface CommentaryEntry {
  verseStart: number;
  verseEnd: number;
  author: string;
  year: number | null;
  sourceTitle: string;
  sourceUrl: string;
  text: string;
}

function sqlite3Query(db: string, sql: string): string {
  return execSync(`sqlite3 -json "${db}" "${sql.replace(/"/g, '\\"')}"`, {
    encoding: 'utf-8',
    maxBuffer: 512 * 1024 * 1024,
  });
}

console.log(`Reading commentaries from ${dbPath}`);

// Get total count
const countResult = JSON.parse(sqlite3Query(dbPath,
  `SELECT COUNT(*) as cnt FROM commentary WHERE book NOT IN ('1maccabees','2maccabees','baruch','judith','sirach','tobit','wisdom','prayerofazariah')`
)) as { cnt: number }[];
console.log(`  ${countResult[0]?.cnt ?? 0} Protestant entries`);

// Fetch all Protestant entries sorted by book, location
const rawJson = sqlite3Query(dbPath,
  `SELECT book, father_name, ts, location_start, location_end, txt, source_title, source_url, append_to_author_name FROM commentary WHERE book NOT IN ('1maccabees','2maccabees','baruch','judith','sirach','tobit','wisdom','prayerofazariah') ORDER BY book, location_start`
);

const rows: RawRow[] = JSON.parse(rawJson);
console.log(`  Parsed ${rows.length} rows`);

// Group by book+chapter → entries
const byBookChapter = new Map<string, CommentaryEntry[]>();
let skippedBooks = 0;
let processedRows = 0;

for (const row of rows) {
  if (SKIP_BOOKS.has(row.book)) continue;

  const bookNum = BOOK_NAME_TO_NUM[row.book];
  if (bookNum === undefined) {
    if (skippedBooks === 0) console.warn(`  Unknown book: ${row.book}`);
    skippedBooks++;
    continue;
  }

  // Commentary location: chapter * 1_000_000 + verse
  const chapterStart = Math.floor(row.location_start / 1_000_000);
  const verseStart = row.location_start % 1_000_000;
  const chapterEnd = Math.floor(row.location_end / 1_000_000);
  const verseEnd = row.location_end % 1_000_000;

  // For cross-chapter entries, assign to the start chapter
  const chapter = chapterStart;
  if (chapter < 1) continue;

  const slug = SLUG_BY_NUM.get(bookNum);
  if (!slug) continue;

  const key = `${slug}:${chapter}`;

  const author = row.append_to_author_name
    ? `${row.father_name} ${row.append_to_author_name}`
    : row.father_name;

  const entry: CommentaryEntry = {
    verseStart,
    verseEnd: chapterEnd === chapterStart ? verseEnd : verseStart,
    author,
    year: row.ts,
    sourceTitle: row.source_title,
    sourceUrl: row.source_url || '',
    text: row.txt.trim(),
  };

  const arr = byBookChapter.get(key);
  if (arr) arr.push(entry);
  else byBookChapter.set(key, [entry]);
  processedRows++;
}

console.log(`  ${processedRows} entries processed, ${skippedBooks} skipped`);

// Write chapter JSON files
const outDir = join(root, 'data', 'commentaries');
let fileCount = 0;
let totalEntries = 0;

for (const [key, entries] of byBookChapter) {
  const [slug, chapStr] = key.split(':') as [string, string];
  const chapter = parseInt(chapStr, 10);
  const book = BOOKS.find((b) => b.slug === slug);
  if (!book) continue;

  const dir = join(outDir, slug);
  mkdirSync(dir, { recursive: true });

  const payload = {
    book: book.bookNum,
    chapter,
    entries: entries.sort((a, b) => a.verseStart - b.verseStart),
  };

  writeFileSync(join(dir, `${chapter}.json`), JSON.stringify(payload));
  fileCount++;
  totalEntries += entries.length;
}

console.log(`  Wrote ${fileCount} chapter files (${totalEntries} entries) to ${outDir}`);

// Stats
const bookCoverage = new Set([...byBookChapter.keys()].map((k) => k.split(':')[0]));
console.log(`  ${bookCoverage.size} books with commentary coverage`);

// Author stats
const authorCounts = new Map<string, number>();
for (const entries of byBookChapter.values()) {
  for (const e of entries) {
    authorCounts.set(e.author, (authorCounts.get(e.author) ?? 0) + 1);
  }
}
const topAuthors = [...authorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log('  Top authors:');
for (const [author, count] of topAuthors) {
  console.log(`    ${author}: ${count}`);
}

console.log('Done.');
