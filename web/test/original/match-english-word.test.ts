// matchEnglishWord — selecting an English word in the reader and finding the original behind it.
//
// Runs against the REAL John 10 interlinear and the REAL Greek lexicon, not fixtures, because the
// whole difficulty is what the shipped data actually says: there is no positional alignment
// between the English text and the original words, so the match is made against each word's gloss
// and its Strong's KJV-usage list. A fixture would test my idea of that data rather than the data.
//
// The assertions below were read off the files first (John 10:11 has ποιμὴν at index 3 AND 7, both
// G4166; G5590's gloss is "breath" and only its KJV usage says "life"), so they check the system
// against verified labels rather than against themselves.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isSingleWord, matchEnglishWord, singleWordOf, type LexEntry, type OWord } from '@/lib/original';

const ORIGINAL = path.resolve(__dirname, '../../public/original/jhn/10.json');
const LEXICON = path.resolve(__dirname, '../../public/lexicon/greek.json');
const HAVE = existsSync(ORIGINAL) && existsSync(LEXICON);
if (!HAVE) {
  console.warn('⚠ SKIPPED (visibly): needs public/original/jhn/10.json and public/lexicon/greek.json.');
}

const verses: Record<string, OWord[]> = HAVE
  ? (JSON.parse(readFileSync(ORIGINAL, 'utf8')) as { verses: Record<string, OWord[]> }).verses
  : {};
const lex: Record<string, LexEntry> = HAVE ? JSON.parse(readFileSync(LEXICON, 'utf8')) : {};
const v11 = () => verses['11']!;
const v13 = () => verses['13']!;
const strongs = (ms: { word: OWord }[]) => ms.map((m) => m.word.s);

describe.skipIf(!HAVE)('matchEnglishWord — against the real John 10 data', () => {
  it('finds the shepherd, ONCE, though the verse says it twice', () => {
    // ποιμὴν is at index 3 and index 7 of John 10:11, both G4166. A reader wants one entry.
    const hits = matchEnglishWord('shepherd', v11(), lex);
    expect(strongs(hits)).toEqual(['G4166']);
    expect(hits[0]!.word.w).toBe('ποιμὴν');
  });

  it('matches on KJV usage when the gloss alone would miss', () => {
    // G5590's gloss is "breath" — the word "life" appears only in its KJV-usage list. This is the
    // case that decides whether the lexicon channel is load-bearing or decorative.
    expect(strongs(matchEnglishWord('life', v11(), lex))).toEqual(['G5590']);
    expect(matchEnglishWord('life', v11(), null)).toEqual([]);
  });

  it('still works from glosses alone when the lexicon is unavailable', () => {
    expect(strongs(matchEnglishWord('shepherd', v11(), null))).toEqual(['G4166']);
  });

  it('finds the hireling in v13 and the sheep in v11', () => {
    expect(strongs(matchEnglishWord('hireling', v13(), lex))).toEqual(['G3411']);
    // G4263's gloss is "something that walks forward"; only "sheep(-fold)" in the KJV usage says
    // sheep, so the parenthetical stripping is what makes this one work.
    expect(strongs(matchEnglishWord('sheep', v11(), lex))).toEqual(['G4263']);
  });

  it('does NOT let a gloss article match the article', () => {
    // "a shepherd" must not make "a" mean ποιμήν. This is the false-positive guard: a wrong
    // mapping is worse than no mapping, because the product would be asserting it.
    expect(matchEnglishWord('a', v11(), lex)).toEqual([]);
  });

  it('matches the definite article to the definite article only', () => {
    // G3588's gloss IS "the", so it must match — while G846 ("the reflexive pronoun self") and
    // G3756 ("the absolute negative ) adverb") must not, on the strength of a leading article.
    expect(strongs(matchEnglishWord('the', v11(), lex))).toEqual(['G3588']);
  });

  it('reaches the base form through a plural when nothing matches exactly', () => {
    expect(strongs(matchEnglishWord('shepherds', v11(), lex))).toEqual(['G4166']);
  });

  it('returns nothing rather than a guess', () => {
    expect(matchEnglishWord('computer', v11(), lex)).toEqual([]);
    expect(matchEnglishWord('', v11(), lex)).toEqual([]);
    expect(matchEnglishWord('...', v11(), lex)).toEqual([]);
  });
});

describe('matchEnglishWord — the ranking property, on data built to isolate it', () => {
  const word = (s: string, g: string): OWord => ({ w: s, l: s, tr: s, s, m: '', g });

  it('an exact match suppresses every merely-stemmed one', () => {
    // Both would match "shepherd" if the stemmed pass ran unconditionally; only the exact one
    // may survive, or the panel offers a choice it has no business offering.
    const hits = matchEnglishWord('shepherd', [word('G1', 'shepherds'), word('G2', 'a shepherd')], null);
    expect(strongs(hits)).toEqual(['G2']);
  });

  it('offers EVERY candidate when they are equally exact, in verse order', () => {
    const hits = matchEnglishWord('light', [word('G9', 'light'), word('G8', 'a light')], null);
    expect(strongs(hits)).toEqual(['G9', 'G8']);
  });
});

describe('isSingleWord', () => {
  it('accepts one word, including hyphens and apostrophes', () => {
    expect(isSingleWord('shepherd')).toBe(true);
    expect(isSingleWord(' shepherd ')).toBe(true);
    expect(isSingleWord("shepherd's")).toBe(true);
    expect(isSingleWord('well-beloved')).toBe(true);
  });

  it('rejects anything that is not one word', () => {
    expect(isSingleWord('good shepherd')).toBe(false);
    expect(isSingleWord('')).toBe(false);
    expect(isSingleWord('10:11')).toBe(false);
  });

  // THE CASE THAT KEPT "Define" OFF THE POPOVER IN THE BROWSER. The reader's word-snapping hands
  // back the canonical substring, which carries the sentence's punctuation with it. A strict
  // anchored test called `shepherd.` "not a word" and the button silently never rendered, while
  // every unit test of the lookup behind it passed.
  it('sees through the punctuation a real selection carries', () => {
    expect(singleWordOf('shepherd.')).toBe('shepherd');
    expect(singleWordOf('“shepherd”')).toBe('shepherd');
    expect(singleWordOf(' shepherd, ')).toBe('shepherd');
    expect(singleWordOf('shepherd’s')).toBe('shepherd’s');
    expect(singleWordOf('good shepherd')).toBeNull();
    expect(singleWordOf('11')).toBeNull();
    expect(singleWordOf('')).toBeNull();
  });
});
