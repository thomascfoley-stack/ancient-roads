// D7 (DEEP_SWEEP) — a verse whose \v marker ENDS a line was silently dropped, and its number was
// glued into the previous verse's text.
//
// Each line is trimEnd()'d (usfm.ts:96) and the marker regex then requires a trailing \s
// (usfm.ts:123). A line that is exactly `\v 2` therefore has nothing after the number, never
// matches, and falls into the continuation branch: verse 2 ceases to exist and the digit "2"
// joins verse 1's prose. Downstream checks cannot see it — computeVerseCounts takes the MAX verse
// number, so the counts stay right, and the versification gate reads it as a ±1 variant.
//
// LATENT, not live: the served WEB corpus was verified clean. It fires the next time a USFM
// source wraps a line after a verse number, which is ordinary formatting.
import { describe, expect, it } from 'vitest';
import { parseUsfmFile } from '../src/ingest/usfm';

const doc = (body: string) => `\\id GEN\n\\c 1\n${body}`;

describe('D7 — a verse marker at end-of-line still starts a verse', () => {
  it('does not drop a verse whose \\v marker ends the line', () => {
    const verses = parseUsfmFile(doc('\\v 1 In the beginning God created.\n\\v 2\nAnd the earth was without form.\n'));
    expect(verses.map((v) => v.verse)).toEqual([1, 2]);
  });

  it('does not glue the dropped verse number into the previous verse', () => {
    const verses = parseUsfmFile(doc('\\v 1 In the beginning God created.\n\\v 2\nAnd the earth was without form.\n'));
    expect(verses[0]!.text, 'the digit 2 must not appear in verse 1').not.toMatch(/\b2\b/);
    expect(verses[1]!.text).toMatch(/without form/);
  });

  it('the ordinary same-line form is unchanged', () => {
    const verses = parseUsfmFile(doc('\\v 1 First verse.\n\\v 2 Second verse.\n'));
    expect(verses.map((v) => v.verse)).toEqual([1, 2]);
    expect(verses[1]!.text).toBe('Second verse.');
  });

  it('a letter-suffixed marker is recognised rather than swallowed', () => {
    const verses = parseUsfmFile(doc('\\v 13 Thirteen.\n\\v 14a Fourteen part a.\n'));
    expect(verses.map((v) => v.verse)).toEqual([13, 14]);
  });
});
