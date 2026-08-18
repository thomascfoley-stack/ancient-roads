// Q6 — A BOOK NAME SPELLED THE WAY A URL SPELLS IT STILL RESOLVES.
//
// The 2026-08-16 QA fleet found `/read/1-corinthians/1`, `/read/song-of-solomon/1`,
// `/read/song-of-songs/1` and `/read/iikings/1` all failing to a bare "Unknown book", across four
// independent sessions. Three of those four were NOT missing aliases — `aliases.ts` has declared
// `song of songs`, `song of solomon` and `1 corinthians` all along. They died in the NORMALIZER:
//
//   * `normalizeBookInput` collapsed whitespace and stripped periods but never touched HYPHENS,
//     and a URL path segment is hyphenated by convention. "song-of-solomon" was compared, whole,
//     against a table whose key is "song of solomon".
//   * The roman-ordinal rule required a FOLLOWING SPACE (`/^(i{1,3}|...)\s+/`), so "ii kings"
//     normalized and "iikings" did not — even though the digit rule one line below it already
//     handled exactly that shape for "1kings".
//
// So this is the A7 alias defect again (2026-08-02: `/read/john/1` failed while `/read/jhn/1`
// worked), one layer down: not a caller that skipped the table, but input the table could never be
// asked about. Both fixes are in the normalizer, so they close every hyphenated and every
// unspaced-ordinal form at once rather than the four slugs the fleet happened to type.
//
// `1jo` IS a genuinely absent alias ("1 jo" was not in the table) and is added; it is unambiguous
// because the ordinal pins it to 1-3 John, whereas a bare "jo" would not be.
//
// EXPRESSED AS PROPERTIES, NOT AS THE FOUR REPORTED SLUGS. Pinning only the reported strings would
// pass the moment those four were special-cased, which is the shape of fix this file exists to
// prevent.

import { describe, expect, it } from 'vitest';
import { BOOKS } from '../../src/bible/books';
import { resolveBookSlug } from '../../src/bible/ref-parse';

describe('Q6 — hyphenated URL forms resolve', () => {
  // The property: for EVERY book, its full name with spaces replaced by hyphens — the form a URL
  // uses — resolves to that same book.
  for (const book of BOOKS) {
    const hyphenated = book.name.toLowerCase().replace(/\s+/g, '-');
    it(`/read/${hyphenated} resolves to ${book.name}`, () => {
      expect(resolveBookSlug(hyphenated)?.bookNum).toBe(book.bookNum);
    });
  }

  it('the four slugs the fleet actually typed', () => {
    expect(resolveBookSlug('1-corinthians')?.slug).toBe('1co');
    expect(resolveBookSlug('song-of-solomon')?.slug).toBe('sng');
    expect(resolveBookSlug('song-of-songs')?.slug).toBe('sng');
    expect(resolveBookSlug('iikings')?.slug).toBe('2ki');
  });
});

describe('Q6 — ordinals without a separator resolve, in every notation', () => {
  it('roman ordinals need no following space', () => {
    expect(resolveBookSlug('iikings')?.slug).toBe('2ki');
    expect(resolveBookSlug('ijohn')?.slug).toBe('1jn');
    expect(resolveBookSlug('iiicorinthians'), 'there is no III Corinthians').toBeUndefined();
  });

  it('the digit and roman forms of the same book agree', () => {
    for (const [roman, digit] of [['i', '1'], ['ii', '2'], ['iii', '3']] as const) {
      const a = resolveBookSlug(`${roman}john`);
      const b = resolveBookSlug(`${digit}john`);
      expect(a?.slug, `${roman}john vs ${digit}john`).toBe(b?.slug);
    }
  });

  it('1jo / 2jo / 3jo resolve to the Johannine epistles', () => {
    expect(resolveBookSlug('1jo')?.slug).toBe('1jn');
    expect(resolveBookSlug('2jo')?.slug).toBe('2jn');
    expect(resolveBookSlug('3jo')?.slug).toBe('3jn');
  });
});

describe('Q6 — the normalizer did not become permissive', () => {
  // Hyphen-to-space must not turn nonsense into a match. These are the guard rails that make the
  // change above a fix rather than a widening.
  it('still refuses input that names no book', () => {
    for (const bad of ['', '-', '---', 'not-a-book', 'song-of-thrones', 'iv-kings', 'ii']) {
      expect(resolveBookSlug(bad), `"${bad}" resolved to something`).toBeUndefined();
    }
  });

  it('does not let a hyphen join two different books into one', () => {
    expect(resolveBookSlug('john-mark')).toBeUndefined();
    expect(resolveBookSlug('genesis-exodus')).toBeUndefined();
  });
});
