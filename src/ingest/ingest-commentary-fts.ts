import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { neon } = require('@neondatabase/serverless') as typeof import('@neondatabase/serverless');

const CORPUS_DIR = 'web/public/commentaries';
const BATCH_SIZE = 200;

interface RawEntry {
  verseStart: number;
  verseEnd: number;
  author: string;
  year: number | null;
  tradition?: string;
  sourceTitle: string;
  sourceUrl: string;
  text: string;
}

interface ChapterFile {
  book: number;
  chapter: number;
  entries: RawEntry[];
}

interface Row {
  book: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
  author: string;
  year: number | null;
  tradition: string | null;
  source_title: string;
  source_url: string;
  body: string;
}

function* readAllEntries(): Generator<Row> {
  const bookDirs = readdirSync(CORPUS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const bookSlug of bookDirs) {
    const dir = join(CORPUS_DIR, bookSlug);
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort((a, b) => parseInt(a) - parseInt(b));

    for (const file of files) {
      const data = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as ChapterFile;
      if (!Array.isArray(data.entries)) continue;

      for (const e of data.entries) {
        if (!e.text?.trim()) continue;
        yield {
          book: data.book,
          chapter: data.chapter,
          verse_start: e.verseStart,
          verse_end: e.verseEnd,
          author: e.author,
          year: e.year ?? null,
          tradition: e.tradition ?? null,
          source_title: e.sourceTitle,
          source_url: e.sourceUrl ?? '',
          body: e.text,
        };
      }
    }
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL must be set (owner role for INSERT)');
    process.exit(1);
  }
  const sql = neon(url.replace(/^"|"$/g, ''));

  let batch: Row[] = [];
  let total = 0;
  let batchCount = 0;

  async function flush() {
    if (batch.length === 0) return;
    await sql.transaction(
      batch.map(
        (r) =>
          sql`INSERT INTO commentary_entries
            (book, chapter, verse_start, verse_end, author, year, tradition, source_title, source_url, body)
            VALUES (${r.book}, ${r.chapter}, ${r.verse_start}, ${r.verse_end},
                    ${r.author}, ${r.year}, ${r.tradition}, ${r.source_title}, ${r.source_url}, ${r.body})
            ON CONFLICT (book, chapter, verse_start, verse_end, author, source_title) DO NOTHING`,
      ),
    );
    batchCount++;
    batch = [];
  }

  for (const row of readAllEntries()) {
    batch.push(row);
    total++;
    if (batch.length >= BATCH_SIZE) {
      await flush();
      process.stdout.write(`\r  ${total} entries processed (${batchCount} batches)...`);
    }
  }
  await flush();

  console.log(`\nDone. ${total} entries ingested in ${batchCount} batches (duplicates skipped via ON CONFLICT).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
