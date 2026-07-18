// Legal corpus boundary — the published-author allowlist shared across read paths.
// Mirrors LEGAL_CORPUS_FILTER in teacher/routing.ts (embeddings metadata JSON).
// Permanent fix at GA: sources.status='published' column (docs/MIGRATION_DESIGN.md).

import { SERVED_PROSE_WORKS, SERVED_SONG_VERSE_WORKS } from './teacher/routing';

export { LEGAL_CORPUS_FILTER } from './teacher/routing';

/** Authors that must never be returned from any served read path (quarantined / copyrighted). */
export const MUST_NOT_SERVE_AUTHORS = [
  'Tyndale Study Notes',
  'Tyndale Open Study Notes',
  'Theophylact',
  'Bonaventure',
  'Oecumenius',
  'Origen',
  'Origen of Alexandria', // the register ingest's author string — same ruling (A6 2026-07-17)
  'Aquinas-Larcher',
] as const;

export type MustNotServeAuthor = (typeof MUST_NOT_SERVE_AUTHORS)[number];

export function isMustNotServeAuthor(author: string): boolean {
  // exact list hit, a normalized first-token hit ("Origen of Alexandria" ~ 'Origen'),
  // or the Jerome's-translation bucket. Normalization guards against the next
  // author-string spelling variant silently bypassing an editorial ruling.
  if ((MUST_NOT_SERVE_AUTHORS as readonly string[]).includes(author)) return true;
  const first = author.split(/\s+(of|the)\s+/i)[0]!.trim();
  if (first !== author && (MUST_NOT_SERVE_AUTHORS as readonly string[]).includes(first)) return true;
  return author.startsWith("Jerome's"); // Jeremiah/Lamentations modern translation bucket
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
  'Albert Barnes', // SAME author as "Barnes' Notes" — the embeddings table names him this way; both are published (matches 0 rows in commentary_entries, which is harmless)
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
const REGISTER_SERVED_SLUGS: readonly string[] = [...SERVED_PROSE_WORKS, ...SERVED_SONG_VERSE_WORKS];
// The register go-live adds `work IN (published slugs)` — migration 019 adds the
// column + rebuilds idx_commentary_fts_legal in lockstep (fts-legal-index-sync).
export const LEGAL_COMMENTARY_ENTRIES_PREDICATE = `(author IN (${sqlList(PUBLISHED_WHOLE_BIBLE_AUTHORS)})
   OR (author = 'John Chrysostom' AND book IN (40, 43, 44))
   OR (author = 'Augustine of Hippo' AND book IN (19, 43))
   OR work IN (${sqlList(REGISTER_SERVED_SLUGS)}))`;

// Register go-live (CONTENT_GO_LIVE.md decisions 2/3, 2026-07-16): static-corpus
// entries from the auto-published clean tier carry a `work` slug; membership here
// is the reader-side publish switch (mirrors SERVED_*_WORKS in teacher/routing.ts
// — now DERIVED from those constants; one edit updates every surface). Deliberately absent: origen-commentary
// (MUST_NOT_SERVE conflict, escalated), thayers-lexicon (OCR tier), historians
// (no read path), poole-tcp/scofield/pnt (the parked owner call).
export const PUBLISHED_WORKS = new Set<string>(REGISTER_SERVED_SLUGS);

/** In-memory per-entry check for static JSON entries (reader). Book-aware;
 *  register-aware via the entry's `work` slug. */
export function isPublishedCommentaryEntry(entry: {
  author: string;
  sourceUrl?: string | null;
  book?: number;
  work?: string | null;
}): boolean {
  const { author } = entry;
  // MUST_NOT_SERVE is an absolute veto — the work-slug branch was author-blind,
  // so a banned author (e.g. an Origen excerpt) inside an otherwise-published
  // work slug would serve (A6 line-by-line 2026-07-17). Check the ruling first.
  if (isMustNotServeAuthor(author)) return false;
  if (entry.work && PUBLISHED_WORKS.has(entry.work)) return true;
  if ((PUBLISHED_WHOLE_BIBLE_AUTHORS as readonly string[]).includes(author)) return true;
  const books = PUBLISHED_BOOK_SCOPED[author];
  return books ? books.includes(entry.book ?? 0) : false;
}

/** Author-level check for the library facet / manifest: is this author published in
 *  ANY book? (The per-book restriction is enforced at entry level by the reader.) */
export function isPublishedAuthor(author: string): boolean {
  if (isMustNotServeAuthor(author)) return false;
  return (PUBLISHED_WHOLE_BIBLE_AUTHORS as readonly string[]).includes(author)
    || Object.prototype.hasOwnProperty.call(PUBLISHED_BOOK_SCOPED, author);
}
