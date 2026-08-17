// Q3e — WHAT COMES AFTER THE LAST CHAPTER OF A BOOK IS DECIDED BY THE BOOK, NOT BY ITS ADDRESS.
//
// A QA-fleet session reported the reader's continuous scroll "silently jumping from the end of
// 1 John into unrelated chapters" instead of advancing to 2 John, reproduced twice. The exact
// destination they named (the Gospel of John) is NOT reproduced here and may have been tab
// contention — but the mechanism for landing in an unrelated book, silently, is real and is in
// this function:
//
//   const idx = BOOKS.indexOf(book);          // <- OBJECT IDENTITY
//   if (idx >= BOOKS.length - 1) return null;
//   return { book: BOOKS[idx + 1], chapter: 1 };
//
// `indexOf` compares by reference. Hand it a book that is EQUAL but not IDENTICAL — one rebuilt
// from a route param, round-tripped through JSON, spread into a new object, or produced by any
// resolver that constructs rather than returns the singleton — and `idx` is -1. The guard tests
// `idx >= 65`, which -1 is not, so execution falls through to `BOOKS[-1 + 1]`: **Genesis 1**. No
// error, no null, no signal. The reader simply continues into the wrong book.
//
// `prevChapter` has the same lookup with a `idx <= 0` guard, so it fails the other way — -1 reads
// as "there is nothing before this", a silent dead end at the top of every book.
//
// Fixed by identifying the book the way the rest of the app does: by slug. The tests below pin the
// property (equal-but-not-identical must behave identically) rather than the four books someone
// happened to try, because a fix that special-cased 1 John would pass a narrower test forever.

import { describe, expect, it } from 'vitest';
import { BOOKS } from '@bible/books';
import { nextChapter, prevChapter } from '@/lib/bible';

/** The same book, as a resolver that CONSTRUCTS rather than returns the singleton would give it. */
function copyOf(slug: string) {
  const b = BOOKS.find((x) => x.slug === slug);
  if (!b) throw new Error(`no such book: ${slug}`);
  return { ...b };
}

describe('Q3e — advancing past the end of a book does not depend on object identity', () => {
  it('1 John → 2 John, from a reconstructed book object', () => {
    // SEED: restore `BOOKS.indexOf(book)` -> RED, and the failure is 'gen/1' — silently Genesis.
    const oneJohn = copyOf('1jn');
    const n = nextChapter(oneJohn, oneJohn.chapterCount);
    expect(`${n?.book.slug}/${n?.chapter}`).toBe('2jn/1');
  });

  it('EVERY book advances the same way whether or not the object is the singleton', () => {
    for (const book of BOOKS) {
      const identity = nextChapter(book, book.chapterCount);
      const copied = nextChapter(copyOf(book.slug), book.chapterCount);
      expect(
        `${copied?.book.slug ?? 'end'}/${copied?.chapter ?? ''}`,
        `nextChapter disagreed with itself for ${book.slug}`,
      ).toBe(`${identity?.book.slug ?? 'end'}/${identity?.chapter ?? ''}`);
    }
  });

  it('EVERY book steps back the same way — prevChapter has the same lookup', () => {
    for (const book of BOOKS) {
      const identity = prevChapter(book, 1);
      const copied = prevChapter(copyOf(book.slug), 1);
      expect(
        `${copied?.book.slug ?? 'start'}/${copied?.chapter ?? ''}`,
        `prevChapter disagreed with itself for ${book.slug}`,
      ).toBe(`${identity?.book.slug ?? 'start'}/${identity?.chapter ?? ''}`);
    }
  });

  it('the ends of the canon still terminate rather than wrapping', () => {
    const rev = copyOf('rev');
    expect(nextChapter(rev, rev.chapterCount), 'walked off the end of Revelation').toBeNull();
    expect(prevChapter(copyOf('gen'), 1), 'walked off the front of Genesis').toBeNull();
  });

  it('a book that is not in the canon resolves to nothing, never to Genesis', () => {
    const fake = { ...copyOf('gen'), slug: 'not-a-book', name: 'Not A Book' };
    // AT ITS LAST CHAPTER, which is the only point that consults the canon at all. The first
    // draft asserted on `nextChapter(fake, 1)` and failed — correctly, and against the TEST:
    // chapter 1 of a 50-chapter book advances to chapter 2 by the early return, without ever
    // looking the book up. Refusing that would have been the wrong fix.
    expect(nextChapter(fake, fake.chapterCount), 'an unknown book was given a successor').toBeNull();
    expect(prevChapter(fake, 1), 'an unknown book was given a predecessor').toBeNull();
  });
});
