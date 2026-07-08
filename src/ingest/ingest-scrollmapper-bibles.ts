import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { BOOKS } from '../bible/books.js';

const SRC = '/tmp/bible_databases/formats/json';
const OUT = 'web/public/bible';

const BOOK_NAME_TO_SLUG: Record<string, string> = {};
const BOOK_NAME_TO_NUM: Record<string, number> = {};
for (const [i, b] of BOOKS.entries()) {
  BOOK_NAME_TO_SLUG[b.name.toLowerCase()] = b.slug;
  BOOK_NAME_TO_NUM[b.name.toLowerCase()] = i + 1;
}

const NAME_ALIASES: Record<string, string> = {
  'psalm': 'psalms',
  'song of solomon': 'song of songs',
  'song of songs': 'song of songs',
  'revelation of john': 'revelation',
  'apocalypse': 'revelation',
  'i samuel': '1 samuel', 'ii samuel': '2 samuel',
  'i kings': '1 kings', 'ii kings': '2 kings',
  'i chronicles': '1 chronicles', 'ii chronicles': '2 chronicles',
  'i corinthians': '1 corinthians', 'ii corinthians': '2 corinthians',
  'i thessalonians': '1 thessalonians', 'ii thessalonians': '2 thessalonians',
  'i timothy': '1 timothy', 'ii timothy': '2 timothy',
  'i peter': '1 peter', 'ii peter': '2 peter',
  'i john': '1 john', 'ii john': '2 john', 'iii john': '3 john',
  'the revelation': 'revelation',
};

function resolveSlug(bookName: string): string | null {
  let name = bookName.toLowerCase().trim();
  if (name.startsWith('the ')) name = name.substring(4);
  const direct = BOOK_NAME_TO_SLUG[name];
  if (direct) return direct;
  const aliased = NAME_ALIASES[name];
  const aliasedSlug = aliased ? BOOK_NAME_TO_SLUG[aliased] : undefined;
  if (aliasedSlug) return aliasedSlug;
  for (const [key, slug] of Object.entries(BOOK_NAME_TO_SLUG)) {
    if (key.startsWith(name) || name.startsWith(key)) return slug;
  }
  return null;
}

const TRANSLATIONS_TO_INGEST: Record<string, { id: string; name: string; abbr: string }> = {
  'Geneva1599': { id: 'geneva', name: 'Geneva Bible (1599)', abbr: 'GNV' },
  'Tyndale': { id: 'tyndale', name: 'Tyndale Bible', abbr: 'TYN' },
  'Webster': { id: 'webster', name: "Webster's Bible Translation", abbr: 'WBT' },
  // DRC (Douay-Rheims) intentionally excluded — Catholic canon/notes are out of scope.
  'LITV': { id: 'litv', name: 'Literal Translation of the Holy Bible', abbr: 'LITV' },
  'NHEB': { id: 'nheb', name: 'New Heart English Bible', abbr: 'NHEB' },
  'AKJV': { id: 'akjv', name: 'American King James Version', abbr: 'AKJV' },
  'MKJV': { id: 'mkjv', name: 'Modern King James Version', abbr: 'MKJV' },
  'Rotherham': { id: 'rotherham', name: "Rotherham's Emphasized Bible", abbr: 'REB' },
  'Anderson': { id: 'anderson', name: 'Anderson New Testament', abbr: 'ANT' },
  'Noyes': { id: 'noyes', name: 'Noyes Translation', abbr: 'NOY' },
  'Jubilee2000': { id: 'jubilee', name: 'Jubilee Bible 2000', abbr: 'JUB' },
  'LEB': { id: 'leb', name: 'Lexham English Bible', abbr: 'LEB' },
  'RWebster': { id: 'rwebster', name: 'Revised Webster Version', abbr: 'RWB' },
  'UKJV': { id: 'ukjv', name: 'Updated King James Version', abbr: 'UKJV' },
};

function main() {
  let totalTranslations = 0;
  let totalChapters = 0;

  for (const [filename, meta] of Object.entries(TRANSLATIONS_TO_INGEST)) {
    const srcFile = `${SRC}/${filename}.json`;
    if (!existsSync(srcFile)) {
      console.log(`  Skipping ${filename} — file not found`);
      continue;
    }

    const outDir = `${OUT}/${meta.id}`;
    if (existsSync(outDir)) {
      console.log(`  Skipping ${meta.id} — already exists`);
      continue;
    }

    console.log(`\n=== ${meta.name} (${meta.abbr}) ===`);
    const data = JSON.parse(readFileSync(srcFile, 'utf-8'));
    const books = data.books;

    let chaptersWritten = 0;

    for (const book of books) {
      const slug = resolveSlug(book.name);
      if (!slug) {
        console.log(`  Unknown book: "${book.name}"`);
        continue;
      }
      const bookNum = BOOK_NAME_TO_NUM[book.name.toLowerCase().trim()]
        ?? BOOK_NAME_TO_NUM[NAME_ALIASES[book.name.toLowerCase().trim()] ?? '']
        ?? 0;

      for (const chapter of book.chapters) {
        const chNum = chapter.chapter;
        const verses = chapter.verses.map((v: any) => ({
          verse: v.verse,
          text: v.text,
        }));

        const chapterData = {
          book: bookNum || BOOKS.findIndex(b => b.slug === slug) + 1,
          chapter: chNum,
          translation: meta.id,
          verses,
        };

        const chDir = `${outDir}/${slug}`;
        mkdirSync(chDir, { recursive: true });
        writeFileSync(`${chDir}/${chNum}.json`, JSON.stringify(chapterData));
        chaptersWritten++;
      }
      process.stdout.write('.');
    }

    console.log(`\n  ${chaptersWritten} chapters written`);
    totalChapters += chaptersWritten;
    totalTranslations++;
  }

  console.log(`\nDone: ${totalTranslations} translations, ${totalChapters} chapters total`);
}

main();
