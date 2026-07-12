// Layer 1 — PRESENCE invariant (§1b, queue #4). Every prior licensing test asserts that
// forbidden authors are ABSENT; not one asserted that an ALLOWED author is PRESENT — so a
// naming bug that silently dropped Barnes/Wesley/Calvin (45,390 entries; 'Albert Barnes'
// vs "Barnes' Notes", crosswire-vs-biblehub) passed every gate. This closes that class:
// it exercises the real isPublishedCommentaryEntry / isPublishedAuthor with each of the 9
// published authors, no DB required, so it runs in CI.

import { describe, expect, it } from 'vitest';
import {
  isPublishedCommentaryEntry,
  isPublishedAuthor,
  isMustNotServeAuthor,
  PUBLISHED_WHOLE_BIBLE_AUTHORS,
} from '@/lib/legal-corpus';

// The 9 published authors in the commentary_entries / static-reader naming convention.
const WHOLE_BIBLE = [
  'John Gill',
  'Jamieson, Fausset & Brown',
  'Adam Clarke',
  'Matthew Henry',
  "Barnes' Notes",
  'John Wesley',
  'John Calvin',
] as const;
const BOOK_SCOPED: Array<[string, number, number]> = [
  // [author, publishedBook, unpublishedBook]
  ['John Chrysostom', 43, 1], // John yes, Genesis no
  ['Augustine of Hippo', 19, 40], // Psalms yes, Matthew no
];

describe('Layer 1 — published-author PRESENCE', () => {
  it('all 7 whole-Bible authors are published (any book)', () => {
    for (const author of WHOLE_BIBLE) {
      expect(isPublishedAuthor(author), `${author} must be a published author`).toBe(true);
      expect(isPublishedCommentaryEntry({ author, book: 45 }), `${author} must be served`).toBe(true);
      expect(isPublishedCommentaryEntry({ author, book: 1 }), `${author} must be served in Genesis too`).toBe(true);
    }
  });

  it('the constant matches the expected whole-Bible set exactly (catches accidental drops)', () => {
    expect([...PUBLISHED_WHOLE_BIBLE_AUTHORS].sort()).toEqual([...WHOLE_BIBLE].sort());
  });

  it('book-scoped authors are published in their books but NOT elsewhere', () => {
    for (const [author, yes, no] of BOOK_SCOPED) {
      expect(isPublishedAuthor(author), `${author} is published somewhere`).toBe(true);
      expect(isPublishedCommentaryEntry({ author, book: yes }), `${author} in book ${yes}`).toBe(true);
      expect(isPublishedCommentaryEntry({ author, book: no }), `${author} must NOT serve book ${no}`).toBe(false);
    }
  });

  it('the embeddings-table naming ("Albert Barnes") is NOT the commentary naming', () => {
    // Guards the exact bug: the commentary paths use "Barnes' Notes"; if someone copies the
    // embeddings 'Albert Barnes' back in, Barnes silently disappears from search + reader.
    expect(isPublishedAuthor("Barnes' Notes")).toBe(true);
    expect(isPublishedAuthor('Albert Barnes')).toBe(false);
  });

  it('forbidden / non-corpus authors are NOT published', () => {
    for (const bad of ['Tyndale Study Notes', 'Pelagius', 'Valentinus', 'CS Lewis', 'Book of Enoch', 'Origen of Alexandria']) {
      expect(isPublishedAuthor(bad), `${bad} must not be published`).toBe(false);
      expect(isPublishedCommentaryEntry({ author: bad, book: 43 }), `${bad} must not be served`).toBe(false);
    }
  });

  it('no published author is also on the must-not-serve list (no contradiction)', () => {
    for (const author of WHOLE_BIBLE) {
      expect(isMustNotServeAuthor(author), `${author} cannot be both published and forbidden`).toBe(false);
    }
  });
});
