// Legal corpus boundary — the published-author allowlist shared across read paths.
// Mirrors LEGAL_CORPUS_FILTER in teacher/routing.ts (embeddings metadata JSON).
// Permanent fix at GA: sources.status='published' column (docs/MIGRATION_DESIGN.md).

export { LEGAL_CORPUS_FILTER } from './teacher/routing';

/** Authors that must never be returned from any served read path (quarantined / copyrighted). */
export const MUST_NOT_SERVE_AUTHORS = [
  'Tyndale Study Notes',
  'Tyndale Open Study Notes',
  'Theophylact',
  'Bonaventure',
  'Oecumenius',
  'Origen',
  'Aquinas-Larcher',
] as const;

export type MustNotServeAuthor = (typeof MUST_NOT_SERVE_AUTHORS)[number];

export function isMustNotServeAuthor(author: string): boolean {
  return (MUST_NOT_SERVE_AUTHORS as readonly string[]).includes(author)
    || author.startsWith("Jerome's"); // Jeremiah/Lamentations modern translation bucket
}

// SQL predicate for commentary_entries (author, book, source_url columns).
export const LEGAL_COMMENTARY_ENTRIES_PREDICATE = `(author IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry')
   OR (author = 'John Chrysostom' AND book IN (40, 43, 44))
   OR (author = 'Augustine of Hippo' AND book IN (19, 43))
   OR (author IN ('Albert Barnes', 'John Wesley', 'John Calvin') AND source_url ILIKE '%crosswire%'))`;

/** In-memory check for static JSON entries (reader / manifest scans). */
export function isPublishedCommentaryEntry(entry: {
  author: string;
  sourceUrl?: string | null;
  book?: number;
}): boolean {
  const { author } = entry;
  const sourceUrl = (entry.sourceUrl ?? '').toLowerCase();
  const book = entry.book ?? 0;
  if (['John Gill', 'Jamieson, Fausset & Brown', 'Adam Clarke', 'Matthew Henry'].includes(author)) {
    return true;
  }
  if (author === 'John Chrysostom' && [40, 43, 44].includes(book)) return true;
  if (author === 'Augustine of Hippo' && [19, 43].includes(book)) return true;
  if (['Albert Barnes', 'John Wesley', 'John Calvin'].includes(author) && sourceUrl.includes('crosswire')) {
    return true;
  }
  return false;
}
