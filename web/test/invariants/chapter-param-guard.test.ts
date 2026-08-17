// A084 — A MALFORMED CHAPTER PARAM DISPATCHES NOTHING.
//
// `/read/jhn/abc` renders the right user-visible error, and then fires backend requests anyway with
// a literal `NaN` in them — `/api/annotations?book=43&chapter=NaN`, plus the commentary and
// original-language prefetches. They 404/401 in the console on every malformed URL. The page looks
// correct and the network tab does not.
//
// The chapter fetch itself was ALREADY guarded (`page.tsx:144` checks isNaN before fetchChapter).
// The defect is that three OTHER dispatchers were not, each deciding for itself whether the param
// was usable — which is this repo's most-repeated failure class, a rule re-typed at every call
// site instead of derived once. So the fix is one predicate, not three isNaN checks.
//
// The predicate is what is tested here, at its boundaries. The call sites spend it; a call site
// that forgets to is a code-review question, not something a unit test can honestly police.

import { describe, expect, it } from 'vitest';
import { isFetchableChapter } from '../../src/lib/chapter-param';

describe('A084 — isFetchableChapter', () => {
  it('refuses what parseInt produces from a malformed segment', () => {
    // `parseInt('abc', 10)` is NaN — the exact value that reached the URL as the string "NaN".
    expect(isFetchableChapter(43, Number.parseInt('abc', 10))).toBe(false);
    expect(isFetchableChapter(43, NaN)).toBe(false);
  });

  it('refuses values that are numbers but cannot address a chapter', () => {
    for (const bad of [0, -1, 1.5, Infinity, -Infinity]) {
      expect(isFetchableChapter(43, bad), `${bad} was treated as fetchable`).toBe(false);
    }
  });

  it('refuses when the BOOK is unresolved, whatever the chapter is', () => {
    // A book that did not resolve makes the chapter meaningless; both prefetches key on the slug.
    for (const bad of [undefined, 0, NaN]) {
      expect(isFetchableChapter(bad as number | undefined, 1), `book ${bad} was treated as fetchable`).toBe(false);
    }
  });

  it('accepts an ordinary chapter', () => {
    // The control. Guarding must not stop the reader working.
    expect(isFetchableChapter(43, 1)).toBe(true);
    expect(isFetchableChapter(1, 50)).toBe(true);
  });

  it('does not range-check against the book length — that is a different question, asked elsewhere', () => {
    // `page.tsx` separately refuses chapter > book.chapterCount and renders a recovery page.
    // Duplicating that bound here would be the same re-typing this predicate exists to remove,
    // and it would need the book table, which a param guard has no business holding.
    expect(isFetchableChapter(43, 9999)).toBe(true);
  });
});
