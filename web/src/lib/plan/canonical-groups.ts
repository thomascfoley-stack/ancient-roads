// Reviewed table of named canonical book groupings ("Pauline Epistles," "the Gospels").
// ADR-048: the LLM/UI selects a GROUP KEY from this table; it never enumerates a book list
// itself. Same posture as ADR-017/046 for topics — a classification the app applies is
// reviewed and named, never an editorial call the model makes per-request.
//
// Seeded with the groupings that are genuinely uncontested across traditions. Extending this
// table later costs one entry; it does not need to be exhaustive on day one.

import { BOOKS } from '@/bible/books';

export interface CanonicalGroup {
  label: string;
  books: readonly string[]; // canonical slugs, in reading order
  note?: string;             // recorded reasoning for a non-obvious inclusion/exclusion
}

export const CANONICAL_GROUPS: Record<string, CanonicalGroup> = {
  pentateuch: {
    label: 'The Pentateuch (Torah)',
    books: ['gen', 'exo', 'lev', 'num', 'deu'],
  },
  gospels: {
    label: 'The Gospels',
    books: ['mat', 'mrk', 'luk', 'jhn'],
  },
  'minor-prophets': {
    label: 'The Minor Prophets',
    books: ['hos', 'jol', 'amo', 'oba', 'jon', 'mic', 'nam', 'hab', 'zep', 'hag', 'zec', 'mal'],
  },
  'wisdom-literature': {
    label: 'Wisdom Literature',
    books: ['job', 'psa', 'pro', 'ecc', 'sng'],
  },
  'pauline-epistles': {
    label: "Paul's Epistles",
    books: ['rom', '1co', '2co', 'gal', 'eph', 'php', 'col', '1th', '2th', '1ti', '2ti', 'tit', 'phm'],
    note:
      'Hebrews (book 58, immediately following Philemon) is DELIBERATELY EXCLUDED — its authorship is a ' +
      'traditional dispute, not a settled fact the app can bake in silently. This grouping follows the ' +
      'majority convention (13 letters, Romans-Philemon). If Hebrews is wanted, it is reachable as its own ' +
      "book scope; it does not ride along inside this group's default.",
  },
  'general-epistles': {
    label: 'The General Epistles',
    books: ['jas', '1pe', '2pe', '1jn', '2jn', '3jn', 'jud'],
  },
  'whole-bible': {
    label: 'The whole Bible',
    // DERIVED from BOOKS, never hand-typed — the repo's own standing lesson (docs/pm/MASTER.md
    // "failure-mode watchlist": a hand-maintained expected set is the most-repeated defect class
    // here). A 67th book landing in books.ts is automatically included; a typo cannot happen.
    books: BOOKS.map((b) => b.slug),
  },
};

export function resolveCanonicalGroup(key: string): CanonicalGroup | undefined {
  return CANONICAL_GROUPS[key];
}
