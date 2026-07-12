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

// The published (PD, servable) commentators, in the naming used by commentary_entries
// AND the static reader files (both use "Barnes' Notes", not the embeddings table's
// 'Albert Barnes'). Whole-Bible PD works served for every book:
export const PUBLISHED_WHOLE_BIBLE_AUTHORS = [
  'John Gill',
  'Jamieson, Fausset & Brown',
  'Adam Clarke',
  'Matthew Henry',
  "Barnes' Notes",
  'John Wesley',
  'John Calvin',
] as const;
// Published only for specific books (a verified PD edition exists there):
const PUBLISHED_BOOK_SCOPED: Record<string, number[]> = {
  'John Chrysostom': [40, 43, 44],
  'Augustine of Hippo': [19, 43],
};

// ⚠ FIXED (§1b, queue #4): this predicate was HAND-COPIED from the embeddings-table
// convention (LEGAL_CORPUS_FILTER: 'Albert Barnes' + source_url ILIKE '%crosswire%')
// into commentary_entries, where the same authors are named "Barnes' Notes" and sourced
// from biblehub — so Barnes/Wesley/Calvin (45,390 entries) matched ZERO rows and search
// silently served 6 of 9, not 9. Now built from PUBLISHED_WHOLE_BIBLE_AUTHORS with no
// URL condition. (Provenance of the biblehub/blogspot sources is flagged for owner
// review in docs/AUTHOR_TRIAGE.md; these authors are all pre-1929 PD.)
const sqlList = (xs: readonly string[]) => xs.map((a) => `'${a.replace(/'/g, "''")}'`).join(',');
export const LEGAL_COMMENTARY_ENTRIES_PREDICATE = `(author IN (${sqlList(PUBLISHED_WHOLE_BIBLE_AUTHORS)})
   OR (author = 'John Chrysostom' AND book IN (40, 43, 44))
   OR (author = 'Augustine of Hippo' AND book IN (19, 43)))`;

/** In-memory per-entry check for static JSON entries (reader). Book-aware. */
export function isPublishedCommentaryEntry(entry: {
  author: string;
  sourceUrl?: string | null;
  book?: number;
}): boolean {
  const { author } = entry;
  if ((PUBLISHED_WHOLE_BIBLE_AUTHORS as readonly string[]).includes(author)) return true;
  const books = PUBLISHED_BOOK_SCOPED[author];
  return books ? books.includes(entry.book ?? 0) : false;
}

/** Author-level check for the library facet / manifest: is this author published in
 *  ANY book? (The per-book restriction is enforced at entry level by the reader.) */
export function isPublishedAuthor(author: string): boolean {
  return (PUBLISHED_WHOLE_BIBLE_AUTHORS as readonly string[]).includes(author)
    || author in PUBLISHED_BOOK_SCOPED;
}
