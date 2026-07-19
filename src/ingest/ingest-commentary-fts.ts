import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import pg from 'pg';
import { from as copyFrom } from 'pg-copy-streams';

const CORPUS_DIR = 'web/public/commentaries';

interface RawEntry {
  verseStart: number;
  verseEnd: number;
  author: string;
  work?: string;
  register?: string;
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

function escapeCopy(val: string | number | null): string {
  if (val === null) return '\\N';
  return String(val)
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL must be set (owner role, direct/unpooled connection for COPY)');
    process.exit(1);
  }

  // Branch guard (deep-audit 2026-07-16, H3): this script TRUNCATEs the serving
  // FTS table — allow-list dev/test, read from the same env source as DATABASE_URL.
  if (process.env.NEON_BRANCH !== 'dev' && process.env.NEON_BRANCH !== 'test') {
    console.error(`STOP: NEON_BRANCH="${process.env.NEON_BRANCH ?? '(unset)'}" — export NEON_BRANCH=dev|test alongside DATABASE_URL to run the destructive re-ingest`);
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: url.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  const beforeCount = await client.query('SELECT count(*)::int AS total FROM commentary_entries');
  console.log(`Before: ${beforeCount.rows[0].total} rows`);

  // TRUNCATE + COPY in ONE transaction: a COPY failure must not leave the FTS
  // corpus empty or partial (was autocommitted — deep-audit H3).
  await client.query('BEGIN');
  console.log('Truncating (transactional)...');
  await client.query('TRUNCATE commentary_entries RESTART IDENTITY');

  console.log('Starting COPY...');
  const stream = client.query(
    copyFrom(
      `COPY commentary_entries (book, chapter, verse_start, verse_end, author, year, tradition, source_title, source_url, body, entry_index, work, register) FROM STDIN`
    )
  );

  const bookDirs = readdirSync(CORPUS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let total = 0;

  for (const bookSlug of bookDirs) {
    const dir = join(CORPUS_DIR, bookSlug);
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort((a, b) => parseInt(a) - parseInt(b));

    for (const file of files) {
      const data = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as ChapterFile;
      if (!Array.isArray(data.entries)) continue;

      let entryIndex = 0;
      for (const e of data.entries) {
        if (!e.text?.trim()) continue;

        const row = [
          data.book,
          data.chapter,
          e.verseStart,
          e.verseEnd,
          escapeCopy(e.author),
          e.year ?? null,
          escapeCopy(e.tradition ?? null),
          escapeCopy(e.sourceTitle),
          escapeCopy(e.sourceUrl ?? ''),
          escapeCopy(e.text),
          entryIndex,
          e.work ? escapeCopy(e.work) : null,
          e.register ? escapeCopy(e.register) : null,
        ]
          .map((v) => (v === null ? '\\N' : String(v)))
          .join('\t');

        const canContinue = stream.write(row + '\n');
        if (!canContinue) {
          await new Promise<void>((resolve) => stream.once('drain', resolve));
        }

        total++;
        entryIndex++;

        if (total % 50000 === 0) {
          process.stderr.write(`  ${total} rows...\n`);
        }
      }
    }
  }

  stream.end();
  try {
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
    throw e;
  }

  const afterCount = await client.query('SELECT count(*)::int AS total FROM commentary_entries');
  console.log(`After: ${afterCount.rows[0].total} rows`);

  await client.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
