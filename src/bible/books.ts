// Canonical book table: standard Protestant 66, Gen=1..Rev=66.
// Chapter counts follow the English KJV versification (the canonical scheme).

export interface Book {
  bookNum: number;
  slug: string;
  name: string;
  testament: 'OT' | 'NT';
  chapterCount: number;
}

export const BOOKS: Book[] = [
  { bookNum: 1, slug: 'gen', name: 'Genesis', testament: 'OT', chapterCount: 50 },
  { bookNum: 2, slug: 'exo', name: 'Exodus', testament: 'OT', chapterCount: 40 },
  { bookNum: 3, slug: 'lev', name: 'Leviticus', testament: 'OT', chapterCount: 27 },
  { bookNum: 4, slug: 'num', name: 'Numbers', testament: 'OT', chapterCount: 36 },
  { bookNum: 5, slug: 'deu', name: 'Deuteronomy', testament: 'OT', chapterCount: 34 },
  { bookNum: 6, slug: 'jos', name: 'Joshua', testament: 'OT', chapterCount: 24 },
  { bookNum: 7, slug: 'jdg', name: 'Judges', testament: 'OT', chapterCount: 21 },
  { bookNum: 8, slug: 'rut', name: 'Ruth', testament: 'OT', chapterCount: 4 },
  { bookNum: 9, slug: '1sa', name: '1 Samuel', testament: 'OT', chapterCount: 31 },
  { bookNum: 10, slug: '2sa', name: '2 Samuel', testament: 'OT', chapterCount: 24 },
  { bookNum: 11, slug: '1ki', name: '1 Kings', testament: 'OT', chapterCount: 22 },
  { bookNum: 12, slug: '2ki', name: '2 Kings', testament: 'OT', chapterCount: 25 },
  { bookNum: 13, slug: '1ch', name: '1 Chronicles', testament: 'OT', chapterCount: 29 },
  { bookNum: 14, slug: '2ch', name: '2 Chronicles', testament: 'OT', chapterCount: 36 },
  { bookNum: 15, slug: 'ezr', name: 'Ezra', testament: 'OT', chapterCount: 10 },
  { bookNum: 16, slug: 'neh', name: 'Nehemiah', testament: 'OT', chapterCount: 13 },
  { bookNum: 17, slug: 'est', name: 'Esther', testament: 'OT', chapterCount: 10 },
  { bookNum: 18, slug: 'job', name: 'Job', testament: 'OT', chapterCount: 42 },
  { bookNum: 19, slug: 'psa', name: 'Psalms', testament: 'OT', chapterCount: 150 },
  { bookNum: 20, slug: 'pro', name: 'Proverbs', testament: 'OT', chapterCount: 31 },
  { bookNum: 21, slug: 'ecc', name: 'Ecclesiastes', testament: 'OT', chapterCount: 12 },
  { bookNum: 22, slug: 'sng', name: 'Song of Songs', testament: 'OT', chapterCount: 8 },
  { bookNum: 23, slug: 'isa', name: 'Isaiah', testament: 'OT', chapterCount: 66 },
  { bookNum: 24, slug: 'jer', name: 'Jeremiah', testament: 'OT', chapterCount: 52 },
  { bookNum: 25, slug: 'lam', name: 'Lamentations', testament: 'OT', chapterCount: 5 },
  { bookNum: 26, slug: 'ezk', name: 'Ezekiel', testament: 'OT', chapterCount: 48 },
  { bookNum: 27, slug: 'dan', name: 'Daniel', testament: 'OT', chapterCount: 12 },
  { bookNum: 28, slug: 'hos', name: 'Hosea', testament: 'OT', chapterCount: 14 },
  { bookNum: 29, slug: 'jol', name: 'Joel', testament: 'OT', chapterCount: 3 },
  { bookNum: 30, slug: 'amo', name: 'Amos', testament: 'OT', chapterCount: 9 },
  { bookNum: 31, slug: 'oba', name: 'Obadiah', testament: 'OT', chapterCount: 1 },
  { bookNum: 32, slug: 'jon', name: 'Jonah', testament: 'OT', chapterCount: 4 },
  { bookNum: 33, slug: 'mic', name: 'Micah', testament: 'OT', chapterCount: 7 },
  { bookNum: 34, slug: 'nam', name: 'Nahum', testament: 'OT', chapterCount: 3 },
  { bookNum: 35, slug: 'hab', name: 'Habakkuk', testament: 'OT', chapterCount: 3 },
  { bookNum: 36, slug: 'zep', name: 'Zephaniah', testament: 'OT', chapterCount: 3 },
  { bookNum: 37, slug: 'hag', name: 'Haggai', testament: 'OT', chapterCount: 2 },
  { bookNum: 38, slug: 'zec', name: 'Zechariah', testament: 'OT', chapterCount: 14 },
  { bookNum: 39, slug: 'mal', name: 'Malachi', testament: 'OT', chapterCount: 4 },
  { bookNum: 40, slug: 'mat', name: 'Matthew', testament: 'NT', chapterCount: 28 },
  { bookNum: 41, slug: 'mrk', name: 'Mark', testament: 'NT', chapterCount: 16 },
  { bookNum: 42, slug: 'luk', name: 'Luke', testament: 'NT', chapterCount: 24 },
  { bookNum: 43, slug: 'jhn', name: 'John', testament: 'NT', chapterCount: 21 },
  { bookNum: 44, slug: 'act', name: 'Acts', testament: 'NT', chapterCount: 28 },
  { bookNum: 45, slug: 'rom', name: 'Romans', testament: 'NT', chapterCount: 16 },
  { bookNum: 46, slug: '1co', name: '1 Corinthians', testament: 'NT', chapterCount: 16 },
  { bookNum: 47, slug: '2co', name: '2 Corinthians', testament: 'NT', chapterCount: 13 },
  { bookNum: 48, slug: 'gal', name: 'Galatians', testament: 'NT', chapterCount: 6 },
  { bookNum: 49, slug: 'eph', name: 'Ephesians', testament: 'NT', chapterCount: 6 },
  { bookNum: 50, slug: 'php', name: 'Philippians', testament: 'NT', chapterCount: 4 },
  { bookNum: 51, slug: 'col', name: 'Colossians', testament: 'NT', chapterCount: 4 },
  { bookNum: 52, slug: '1th', name: '1 Thessalonians', testament: 'NT', chapterCount: 5 },
  { bookNum: 53, slug: '2th', name: '2 Thessalonians', testament: 'NT', chapterCount: 3 },
  { bookNum: 54, slug: '1ti', name: '1 Timothy', testament: 'NT', chapterCount: 6 },
  { bookNum: 55, slug: '2ti', name: '2 Timothy', testament: 'NT', chapterCount: 4 },
  { bookNum: 56, slug: 'tit', name: 'Titus', testament: 'NT', chapterCount: 3 },
  { bookNum: 57, slug: 'phm', name: 'Philemon', testament: 'NT', chapterCount: 1 },
  { bookNum: 58, slug: 'heb', name: 'Hebrews', testament: 'NT', chapterCount: 13 },
  { bookNum: 59, slug: 'jas', name: 'James', testament: 'NT', chapterCount: 5 },
  { bookNum: 60, slug: '1pe', name: '1 Peter', testament: 'NT', chapterCount: 5 },
  { bookNum: 61, slug: '2pe', name: '2 Peter', testament: 'NT', chapterCount: 3 },
  { bookNum: 62, slug: '1jn', name: '1 John', testament: 'NT', chapterCount: 5 },
  { bookNum: 63, slug: '2jn', name: '2 John', testament: 'NT', chapterCount: 1 },
  { bookNum: 64, slug: '3jn', name: '3 John', testament: 'NT', chapterCount: 1 },
  { bookNum: 65, slug: 'jud', name: 'Jude', testament: 'NT', chapterCount: 1 },
  { bookNum: 66, slug: 'rev', name: 'Revelation', testament: 'NT', chapterCount: 22 },
];

export const BOOK_BY_NUM = new Map(BOOKS.map((b) => [b.bookNum, b]));
export const BOOK_BY_SLUG = new Map(BOOKS.map((b) => [b.slug, b]));
